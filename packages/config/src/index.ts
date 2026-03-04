import { z } from 'zod';

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const apiSchema = baseSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
  SERVICE_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  API_HEALTH_URL: z.string().url().default('http://api:3001/health'),
  WORKER_HEALTH_URL: z.string().url().default('http://worker:3002/health'),
  CADDY_HEALTH_URL: z
    .string()
    .url()
    .default('http://caddy:8080/__caddy/healthz'),
});

const workerSchema = baseSchema.extend({
  WORKER_PORT: z.coerce.number().int().positive().default(3002),
  BALANCE_JOB_INTERVAL_SECONDS: z.coerce.number().int().positive().default(120),
  ASSET_SNAPSHOT_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(86400),
  SERVICE_HEALTH_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  SERVICE_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  API_HEALTH_URL: z.string().url().default('http://api:3001/health'),
  WORKER_HEALTH_URL: z.string().url().default('http://worker:3002/health'),
  CADDY_HEALTH_URL: z
    .string()
    .url()
    .default('http://caddy:8080/__caddy/healthz'),
});

const appSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().min(1).default('/api'),
  INTERNAL_API_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_BASE_PATH: z.string().default(''),
  FINANCES_PANEL_PORT: z.coerce.number().int().positive().default(3000),
  PORTAL_PORT: z.coerce.number().int().positive().default(3005),
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
