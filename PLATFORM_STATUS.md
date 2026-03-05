# Platform Status

Last updated: 2026-03-05

This file is now platform-only.

Finances panel/domain status moved to:
- `FINANCES_PANEL_STATUS.md`

## Current Platform State

- Runtime/tooling:
  - Bun monorepo with `apps/*`, `services/*`, `packages/*`
  - Biome + TypeScript checks working
- Infrastructure:
  - Docker Compose stack running (`postgres`, `migrations`, `api`, `worker`, `finances-panel`, `portal`, `caddy`)
  - Service health/readiness/metrics endpoints active
- Core backend foundations:
  - `core.job_runs` and advisory-lock job execution
  - structured service health checks + timeline API
- Database:
  - schema-per-domain strategy active (`core`, `finances`, placeholders for `todo`/`calendar`)
  - migrations through `0008` applied in finances/core path

## Platform Development Ideas

### Operations and Reliability
- Add automated Postgres backup/restore scripts (local + test restore verification).
- Add one-command diagnostics script (`scripts/platform-check.ts`) to report container health, migration state, and recent failed jobs.
- Add alerting hooks for repeated worker job failures (local notification or Telegram integration later).

### Architecture and Scale
- Introduce queue-backed worker execution for long-running/backfill tasks.
- Add per-job configuration registry (enable/disable, intervals, retry policy) instead of env-only sprawl.
- Prepare `user_id` seams in shared schemas for future multi-user migration.

### Observability
- Add request/job correlation IDs across API + worker logs.
- Add basic tracing (OpenTelemetry) for cross-service requests.
- Add dashboard endpoint for job run summaries and last-success timestamps.

## Validation Snapshot

- `bun run typecheck`: passing
- `bun test`: passing
- Docker stack: healthy/running

## ADRs

- `docs/adr/0001-stack-runtime.md`
- `docs/adr/0002-db-schema-strategy.md`
- `docs/adr/0003-worker-reliability.md`
- `docs/adr/0004-observability-baseline.md`
- `docs/adr/0005-shadcn-frontend-foundation.md`
- `docs/adr/0006-yahoo-finance-pricing-pipeline.md`
