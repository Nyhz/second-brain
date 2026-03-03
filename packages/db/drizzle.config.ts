import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/*.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      (globalThis as { Bun?: { env: Record<string, string | undefined> } }).Bun
        ?.env.DATABASE_URL_LOCAL ??
      'postgres://second_brain:second_brain@localhost:5432/second_brain',
  },
});
