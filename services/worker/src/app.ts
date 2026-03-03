import { loadWorkerEnv } from '@second-brain/config';
import { createDbClient } from '@second-brain/db';
import { Elysia } from 'elysia';
import { registry } from './metrics';

export const createWorkerApp = () => {
  const env = loadWorkerEnv();
  const app = new Elysia();

  app.get('/health', () => ({
    status: 'ok',
    service: 'worker',
    ts: new Date().toISOString(),
  }));

  app.get('/ready', async ({ set }) => {
    try {
      const { sql } = createDbClient(env.DATABASE_URL);
      const [row] = await sql`select 1 as ok`;
      await sql.end();

      if (!row || row.ok !== 1) {
        throw new Error('database readiness check failed');
      }

      return { status: 'ready' };
    } catch (error) {
      set.status = 503;
      return {
        code: 'NOT_READY',
        message: 'Database unavailable',
        details: `${error}`,
      };
    }
  });

  app.get('/metrics', async ({ set }) => {
    set.headers['content-type'] = registry.contentType;
    return registry.metrics();
  });

  return { app, env };
};
