import { loadWorkerEnv } from '@second-brain/config';
import { checkServiceHealth } from './jobs/check-service-health';
import { computeDailyBalances } from './jobs/compute-balances';
import { seedSyntheticPrices } from './jobs/seed-prices';
import { snapshotAssetValuations } from './jobs/snapshot-asset-valuations';
import { runWithAdvisoryLock } from './lib/jobs';
import { log } from './lib/logger';

export const startScheduler = () => {
  const env = loadWorkerEnv();
  const symbols = env.SYNTHETIC_PRICE_SYMBOLS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const runPriceJob = async () => {
    try {
      await runWithAdvisoryLock(
        env.DATABASE_URL,
        'finances_seed_synthetic_prices',
        new Date(),
        () =>
          seedSyntheticPrices(
            env.DATABASE_URL,
            symbols,
            env.SYNTHETIC_PRICE_SEED,
          ),
      );
    } catch (error) {
      log('error', 'price_job_failed', { error: String(error) });
    }
  };

  const runBalanceJob = async () => {
    try {
      await runWithAdvisoryLock(
        env.DATABASE_URL,
        'finances_compute_daily_balances',
        new Date(),
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

  void runPriceJob();
  void runBalanceJob();
  void runAssetSnapshotJob();
  void runServiceHealthJob();

  const priceTimer = setInterval(() => {
    void runPriceJob();
  }, env.PRICE_JOB_INTERVAL_SECONDS * 1000);

  const balanceTimer = setInterval(() => {
    void runBalanceJob();
  }, env.BALANCE_JOB_INTERVAL_SECONDS * 1000);

  const assetSnapshotTimer = setInterval(() => {
    void runAssetSnapshotJob();
  }, env.ASSET_SNAPSHOT_INTERVAL_SECONDS * 1000);

  const serviceHealthTimer = setInterval(() => {
    void runServiceHealthJob();
  }, env.SERVICE_HEALTH_INTERVAL_SECONDS * 1000);

  return () => {
    clearInterval(priceTimer);
    clearInterval(balanceTimer);
    clearInterval(assetSnapshotTimer);
    clearInterval(serviceHealthTimer);
  };
};
