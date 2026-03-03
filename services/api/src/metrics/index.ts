import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'second_brain_api_' });

export const httpRequestsTotal = new Counter({
  name: 'second_brain_api_http_requests_total',
  help: 'Total API HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'second_brain_api_http_request_duration_seconds',
  help: 'API HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const dbQueryDurationSeconds = new Histogram({
  name: 'second_brain_api_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query_name'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
  registers: [registry],
});

export const dbQueryErrorsTotal = new Counter({
  name: 'second_brain_api_db_query_errors_total',
  help: 'Total database query errors',
  labelNames: ['query_name'],
  registers: [registry],
});
