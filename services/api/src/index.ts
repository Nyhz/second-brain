import { createApiApp } from './app';
import { log } from './lib/logger';

const { app, env } = createApiApp();

app.listen(env.API_PORT);
log('info', 'api_started', { port: env.API_PORT });
