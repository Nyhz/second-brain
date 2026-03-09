import { loadWorkerEnv } from '@second-brain/config';
import { createDbClient } from '@second-brain/db';
import { checkServiceHealth } from './jobs/check-service-health';
import { computeDailyBalances } from './jobs/compute-balances';
import { createDatabaseBackup } from './jobs/create-database-backup';
import { snapshotAssetValuations } from './jobs/snapshot-asset-valuations';
import { syncYahooPrices } from './jobs/sync-yahoo-prices';
import { runWithAdvisoryLock } from './lib/jobs';
import { log } from './lib/logger';

const startOfUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const addUtcDays = (date: Date, days: number) => {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
};

const shouldRunToday = (
  now: Date,
  targetHourUtc: number,
  targetMinuteUtc: number,
) => {
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const targetMinutes = targetHourUtc * 60 + targetMinuteUtc;
  return nowMinutes >= targetMinutes;
};

const hasSuccessfulRunInUtcDay = async (
  databaseUrl: string,
  jobName: string,
  now: Date,
) => {
  const dayStart = startOfUtcDay(now);
  const nextDayStart = addUtcDays(dayStart, 1);
  const { sql } = createDbClient(databaseUrl);

  try {
    const [row] = await sql`
      select exists (
        select 1
        from core.job_runs
        where job_name = ${jobName}
          and status = 'success'::job_run_status
          and started_at >= ${dayStart.toISOString()}
          and started_at < ${nextDayStart.toISOString()}
      ) as "hasRun"
    `;
    return Boolean(row?.hasRun);
  } finally {
    await sql.end();
  }
};

export const startScheduler = () => {
  const env = loadWorkerEnv();

  const runBalanceJob = async () => {
    const now = new Date();
    if (
      !shouldRunToday(
        now,
        env.BALANCE_TARGET_HOUR_UTC,
        env.BALANCE_TARGET_MINUTE_UTC,
      )
    ) {
      return;
    }

    const jobName = 'finances_compute_daily_balances';

    try {
      const alreadyRun = await hasSuccessfulRunInUtcDay(
        env.DATABASE_URL,
        jobName,
        now,
      );
      if (alreadyRun) {
        return;
      }

      await runWithAdvisoryLock(
        env.DATABASE_URL,
        jobName,
        now,
        () => computeDailyBalances(env.DATABASE_URL),
      );
    } catch (error) {
      log('error', 'balance_job_failed', { error: String(error) });
    }
  };

  const runAssetSnapshotJob = async () => {
    try {
      await runWithAdvisoryLock(
        env.DATABASE_URL,
        'finances_snapshot_asset_valuations',
        new Date(),
        () => snapshotAssetValuations(env.DATABASE_URL),
      );
    } catch (error) {
      log('error', 'asset_snapshot_job_failed', { error: String(error) });
    }
  };

  const runServiceHealthJob = async () => {
    try {
      await runWithAdvisoryLock(
        env.DATABASE_URL,
        'ops_check_service_health',
        new Date(),
        () =>
          checkServiceHealth(
            env.DATABASE_URL,
            [
              { service: 'api', targetUrl: env.API_HEALTH_URL },
              { service: 'worker', targetUrl: env.WORKER_HEALTH_URL },
              { service: 'caddy', targetUrl: env.CADDY_HEALTH_URL },
            ],
            env.SERVICE_HEALTH_TIMEOUT_MS,
          ),
      );
    } catch (error) {
      log('error', 'service_health_job_failed', { error: String(error) });
    }
  };

  const runDatabaseBackupJob = async () => {
    if (!env.BACKUP_ENABLED) {
      return;
    }

    const now = new Date();
    if (
      !shouldRunToday(
        now,
        env.BACKUP_TARGET_HOUR_UTC,
        env.BACKUP_TARGET_MINUTE_UTC,
      )
    ) {
      return;
    }

    const jobName = 'core_create_database_backup_daily';
    try {
      const alreadyRun = await hasSuccessfulRunInUtcDay(
        env.DATABASE_URL,
        jobName,
        now,
      );
      if (alreadyRun) {
        return;
      }

      await runWithAdvisoryLock(env.DATABASE_URL, jobName, now, () =>
        createDatabaseBackup(
          env.DATABASE_URL,
          env.BACKUP_DIR,
          env.BACKUP_RETENTION_COUNT,
        ),
      );
    } catch (error) {
      log('error', 'database_backup_job_failed', { error: String(error) });
    }
  };

  const runYahooPriceSyncJob = async () => {
    if (!env.PRICE_SYNC_ENABLED) {
      return;
    }

    const now = new Date();
    if (
      !shouldRunToday(
        now,
        env.PRICE_SYNC_TARGET_HOUR_UTC,
        env.PRICE_SYNC_TARGET_MINUTE_UTC,
      )
    ) {
      return;
    }

    const jobName = 'finances_sync_yahoo_prices_daily';
    try {
      const alreadyRun = await hasSuccessfulRunInUtcDay(
        env.DATABASE_URL,
        jobName,
        now,
      );
      if (alreadyRun) {
        return;
      }

      await runWithAdvisoryLock(env.DATABASE_URL, jobName, now, () =>
        syncYahooPrices(env.DATABASE_URL, {
          requestDelayMs: env.PRICE_SYNC_REQUEST_DELAY_MS,
          backfillDaysPerRun: env.PRICE_SYNC_BACKFILL_DAYS_PER_RUN,
          lookbackDays: env.PRICE_SYNC_LOOKBACK_DAYS,
        }),
      );
    } catch (error) {
      log('error', 'yahoo_price_sync_job_failed', { error: String(error) });
    }
  };

  void runBalanceJob();
  void runAssetSnapshotJob();
  void runServiceHealthJob();
  void runYahooPriceSyncJob();
  void runDatabaseBackupJob();

  const balanceTimer = setInterval(() => {
    void runBalanceJob();
  }, env.BALANCE_TICK_SECONDS * 1000);

  const assetSnapshotTimer = setInterval(() => {
    void runAssetSnapshotJob();
  }, env.ASSET_SNAPSHOT_INTERVAL_SECONDS * 1000);

  const serviceHealthTimer = setInterval(() => {
    void runServiceHealthJob();
  }, env.SERVICE_HEALTH_INTERVAL_SECONDS * 1000);

  const yahooPriceSyncTimer = setInterval(() => {
    void runYahooPriceSyncJob();
  }, env.PRICE_SYNC_TICK_SECONDS * 1000);

  const databaseBackupTimer = setInterval(() => {
    void runDatabaseBackupJob();
  }, env.BACKUP_TICK_SECONDS * 1000);

  return () => {
    clearInterval(balanceTimer);
    clearInterval(assetSnapshotTimer);
    clearInterval(serviceHealthTimer);
    clearInterval(yahooPriceSyncTimer);
    clearInterval(databaseBackupTimer);
  };
};
