import { createDbClient } from '@second-brain/db';
import {
  jobDurationSeconds,
  jobLastSuccessTimestamp,
  jobRunsTotal,
} from '../metrics';

const hashToInt64 = (value: string): string => {
  let hash = BigInt(0);
  for (const char of value) {
    hash =
      (hash * BigInt(31) + BigInt(char.codePointAt(0) ?? 0)) &
      BigInt('0x7fffffffffffffff');
  }
  return hash.toString();
};

export const runWithAdvisoryLock = async (
  databaseUrl: string,
  jobName: string,
  scheduledAt: Date,
  runner: () => Promise<Record<string, unknown>>,
) => {
  const { sql } = createDbClient(databaseUrl);
  const lockKey = hashToInt64(jobName);

  const [lockResult] =
    await sql`select pg_try_advisory_lock(${lockKey}::bigint) as locked`;
  if (!lockResult?.locked) {
    jobRunsTotal.inc({ job_name: jobName, status: 'skipped' });
    await sql.end();
    return;
  }

  const [inserted] = await sql`
    insert into core.job_runs (job_name, scheduled_at, started_at, status)
    values (${jobName}, ${scheduledAt.toISOString()}, now(), 'success'::job_run_status)
    returning id
  `;
  if (!inserted?.id) {
    await sql`select pg_advisory_unlock(${lockKey}::bigint)`;
    await sql.end();
    throw new Error(`Failed to create job run record for ${jobName}`);
  }

  const end = jobDurationSeconds.startTimer({ job_name: jobName });

  try {
    const metrics = await runner();
    end();

    await sql`
      update core.job_runs
      set
        finished_at = now(),
        status = 'success'::job_run_status,
        metrics_json = ${JSON.stringify(metrics)}::jsonb
      where id = ${inserted.id}
    `;

    const nowUnix = Date.now() / 1000;
    jobLastSuccessTimestamp.set({ job_name: jobName }, nowUnix);
    jobRunsTotal.inc({ job_name: jobName, status: 'success' });
  } catch (error) {
    end();

    await sql`
      update core.job_runs
      set
        finished_at = now(),
        status = 'failed'::job_run_status,
        error_message = ${error instanceof Error ? error.message : String(error)}
      where id = ${inserted.id}
    `;

    jobRunsTotal.inc({ job_name: jobName, status: 'failed' });
    throw error;
  } finally {
    await sql`select pg_advisory_unlock(${lockKey}::bigint)`;
    await sql.end();
  }
};
