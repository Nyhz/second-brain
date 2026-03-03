import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'second_brain_worker_' });

export const jobRunsTotal = new Counter({
  name: 'second_brain_worker_job_runs_total',
  help: 'Worker job runs total',
  labelNames: ['job_name', 'status'],
  registers: [registry],
});

export const jobDurationSeconds = new Histogram({
  name: 'second_brain_worker_job_duration_seconds',
  help: 'Worker job execution duration in seconds',
  labelNames: ['job_name'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const jobLastSuccessTimestamp = new Gauge({
  name: 'second_brain_worker_job_last_success_timestamp',
  help: 'Unix timestamp of the last successful run',
  labelNames: ['job_name'],
  registers: [registry],
});
