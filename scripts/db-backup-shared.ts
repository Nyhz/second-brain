import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type EnvMap = Record<string, string>;

export const loadDotEnv = (path = '.env'): EnvMap => {
  const content = readFileSync(path, 'utf8');
  const env: EnvMap = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    env[key] = value;
  }
  return env;
};

export const runCommand = async (cmd: string[], label: string) => {
  const [command, ...args] = cmd;
  if (!command) {
    throw new Error(`${label} failed: empty command`);
  }

  try {
    return await execFileAsync(command, args, {
      maxBuffer: 20 * 1024 * 1024,
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
    throw new Error(
      `${label} failed: ${stderr.trim() || stdout.trim() || String(error)}`,
    );
  }
};

export const workerComposePrefix = () => [
  'docker',
  'compose',
  '--env-file',
  '.env',
  '-f',
  'infra/docker/docker-compose.yml',
  'exec',
  '-T',
  'worker',
] as const;

export const postgresUrlForDb = (env: EnvMap, databaseName: string) => {
  const user = env.POSTGRES_USER;
  const password = env.POSTGRES_PASSWORD;
  if (!user || !password) {
    throw new Error('POSTGRES_USER or POSTGRES_PASSWORD missing from .env');
  }
  return `postgres://${user}:${password}@postgres:5432/${databaseName}`;
};

export const latestBackupPath = async () => {
  const { stdout } = await runCommand(
    [
      ...workerComposePrefix(),
      'sh',
      '-lc',
      'ls -1t /backups/*.dump 2>/dev/null | head -n 1',
    ],
    'resolve latest backup',
  );
  const file = stdout.trim();
  if (!file) {
    throw new Error('No backup dump files found under /backups');
  }
  return file;
};

export const resolveBackupPath = async (requested?: string) => {
  if (!requested || requested === 'latest') {
    return latestBackupPath();
  }
  if (requested.startsWith('/')) {
    return requested;
  }
  return `/backups/${requested}`;
};

export const assertBackupExists = async (backupPath: string) => {
  await runCommand(
    [...workerComposePrefix(), 'test', '-f', backupPath],
    'check backup file',
  );
};

export const terminateConnectionsSql = (databaseName: string) => `
  select pg_terminate_backend(pid)
    from pg_stat_activity
   where datname = '${databaseName}'
     and pid <> pg_backend_pid();
`;

export const createDatabaseSql = (databaseName: string) =>
  `create database "${databaseName}";`;

export const dropDatabaseSql = (databaseName: string) =>
  `drop database if exists "${databaseName}";`;
