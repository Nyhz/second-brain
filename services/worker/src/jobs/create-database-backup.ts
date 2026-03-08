import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDbClient } from '@second-brain/db';

const execFileAsync = promisify(execFile);

const runCommand = async (cmd: string[], label: string) => {
  const command = cmd[0];
  if (!command) {
    throw new Error(`${label} failed: command is empty`);
  }
  const [, ...args] = cmd;
  try {
    return await execFileAsync(command, args, {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr)
        : '';
    const stdout =
      error && typeof error === 'object' && 'stdout' in error
        ? String(error.stdout)
        : '';
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'unknown';

    throw new Error(
      `${label} failed (${code}): ${stderr.trim() || stdout.trim() || 'unknown error'}`,
    );
  }
};

const fileSha256 = async (path: string) => {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
};

const isoStamp = (date: Date) =>
  date.toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');

export const createDatabaseBackup = async (
  databaseUrl: string,
  backupDir: string,
  retentionCount: number,
): Promise<Record<string, unknown>> => {
  const { sql } = createDbClient(databaseUrl);
  const startedAt = new Date();
  const fileName = `second-brain-${isoStamp(startedAt)}.dump`;
  const filePath = join(backupDir, fileName);

  await mkdir(backupDir, { recursive: true });

  const [run] = await sql`
    insert into core.backup_runs (
      backup_type,
      started_at,
      status,
      file_name,
      file_path
    )
    values (
      'pg_dump_custom',
      ${startedAt.toISOString()},
      'success'::job_run_status,
      ${fileName},
      ${filePath}
    )
    returning id
  `;

  if (!run?.id) {
    await sql.end();
    throw new Error('Failed to create backup run record');
  }

  try {
    await runCommand(
      ['pg_dump', '--format=custom', `--file=${filePath}`, databaseUrl],
      'pg_dump',
    );

    await runCommand(['pg_restore', '--list', filePath], 'pg_restore verify');

    const fileInfo = await stat(filePath);
    const sha256 = await fileSha256(filePath);

    const oldRows = await sql`
      select id, file_path as "filePath"
      from core.backup_runs
      where file_path is not null
        and file_deleted_at is null
      order by started_at desc
    `;

    const staleRows = oldRows.slice(Math.max(retentionCount, 0));

    let deletedFiles = 0;
    for (const row of staleRows) {
      const stalePath = String(row.filePath ?? '');
      if (!stalePath) continue;
      try {
        await rm(stalePath, { force: true });
        deletedFiles += 1;
      } catch {
        // Ignore file-system cleanup failures; metadata remains queryable.
      }
      await sql`
        update core.backup_runs
        set file_deleted_at = now()
        where id = ${String(row.id)}
      `;
    }

    await sql`
      update core.backup_runs
      set
        finished_at = now(),
        status = 'success'::job_run_status,
        file_size_bytes = ${Math.min(fileInfo.size, 2147483647)},
        file_sha256 = ${sha256},
        verified_at = now(),
        metrics_json = ${JSON.stringify({
          deletedFiles,
          retentionCount,
          backupDir,
          fileBaseName: basename(filePath),
        })}::jsonb
      where id = ${String(run.id)}
    `;

    const files = await readdir(backupDir);

    await sql.end();
    return {
      fileName,
      filePath,
      fileSizeBytes: fileInfo.size,
      fileSha256: sha256,
      retainedFiles: files.length,
      deletedFiles,
      retentionCount,
    };
  } catch (error) {
    await sql`
      update core.backup_runs
      set
        finished_at = now(),
        status = 'failed'::job_run_status,
        error_message = ${error instanceof Error ? error.message : String(error)}
      where id = ${String(run.id)}
    `;
    await sql.end();
    throw error;
  }
};
