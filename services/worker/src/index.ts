import { createWorkerApp } from './app';
import { log } from './lib/logger';
import { startScheduler } from './scheduler';

const { app, env } = createWorkerApp();
startScheduler();

app.listen(env.WORKER_PORT);
log('info', 'worker_started', { port: env.WORKER_PORT });
