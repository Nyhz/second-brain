import { z } from 'zod';

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const apiSchema = baseSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
});

const workerSchema = baseSchema.extend({
  WORKER_PORT: z.coerce.number().int().positive().default(3002),
  PRICE_JOB_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  BALANCE_JOB_INTERVAL_SECONDS: z.coerce.number().int().positive().default(120),
  SYNTHETIC_PRICE_SEED: z.coerce.number().int().default(42),
  SYNTHETIC_PRICE_SYMBOLS: z.string().default('SPY,QQQ,BTC'),
});

const appSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  FINANCES_PANEL_PORT: z.coerce.number().int().positive().default(3000),
});

export type ApiEnv = z.infer<typeof apiSchema>;
export type WorkerEnv = z.infer<typeof workerSchema>;
export type AppEnv = z.infer<typeof appSchema>;

const runtimeEnv = (): Record<string, string | undefined> => {
  const maybeBun = (
    globalThis as { Bun?: { env: Record<string, string | undefined> } }
  ).Bun;
  if (maybeBun) return maybeBun.env;
  const maybeProcess = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  return maybeProcess?.env ?? {};
};

export const loadApiEnv = (
  input: Record<string, string | undefined> = runtimeEnv(),
): ApiEnv => {
  return apiSchema.parse(input);
};

export const loadWorkerEnv = (
  input: Record<string, string | undefined> = runtimeEnv(),
): WorkerEnv => {
  return workerSchema.parse(input);
};

export const loadAppEnv = (
  input: Record<string, string | undefined> = runtimeEnv(),
): AppEnv => {
  return appSchema.parse(input);
};
