import { loadWorkerEnv } from '@second-brain/config';
import { computeDailyBalances } from './jobs/compute-balances';
import { seedSyntheticPrices } from './jobs/seed-prices';
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

  void runPriceJob();
  void runBalanceJob();

  const priceTimer = setInterval(() => {
    void runPriceJob();
  }, env.PRICE_JOB_INTERVAL_SECONDS * 1000);

  const balanceTimer = setInterval(() => {
    void runBalanceJob();
  }, env.BALANCE_JOB_INTERVAL_SECONDS * 1000);

  return () => {
    clearInterval(priceTimer);
    clearInterval(balanceTimer);
  };
};
