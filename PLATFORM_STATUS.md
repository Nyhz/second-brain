# Platform Status (v1)

Last updated: 2026-03-03

This document tracks execution progress against the initial infrastructure plan defined in our kickoff planning session (Bun + Elysia + Next.js + Drizzle, Docker-first, finances-first MVP).

## Initial Plan Reference

The initial plan goals were:
- Bootstrap Bun monorepo and shared packages.
- Create shared Postgres + schema-per-domain strategy with migrations.
- Build API + worker + finances panel as the first vertical slice.
- Run all services via Docker Compose with health/readiness/metrics.
- Validate a working finances MVP flow end-to-end.

Architecture decisions are recorded in:
- `docs/adr/0001-stack-runtime.md`
- `docs/adr/0002-db-schema-strategy.md`
- `docs/adr/0003-worker-reliability.md`
- `docs/adr/0004-observability-baseline.md`

## Completed

### 1) Monorepo + Tooling
- Bun workspace initialized (`apps/*`, `services/*`, `packages/*`).
- Biome lint/format configured.
- Shared TypeScript base config added.
- Root scripts for lint/typecheck/test/migrate/seed added.

### 2) Shared Packages
- `packages/types`: shared API/domain schemas and types.
- `packages/config`: environment loading/validation.
- `packages/db`: Drizzle schema exports, migration runner, seed runner.

### 3) Database + Migrations
- Postgres schema-per-domain setup implemented:
  - `core`
  - `finances`
  - `todo` (placeholder)
  - `calendar` (placeholder)
- Initial migration includes:
  - `core.job_runs`
  - `finances.accounts`
  - `finances.transactions`
  - `finances.daily_balances`
  - `finances.price_history`

### 4) API Service (`services/api`)
- Elysia service running with:
  - `/health`
  - `/ready`
  - `/metrics`
- Finances module endpoints:
  - account list/create
  - transaction list/create/update/delete
  - summary endpoint
- Standardized error handling and JSON logging.

### 5) Worker Service (`services/worker`)
- In-process scheduler implemented.
- Postgres advisory-lock execution guard implemented.
- `core.job_runs` persistence implemented.
- Worker endpoints:
  - `/health`
  - `/ready`
  - `/metrics`
- Jobs implemented:
  - synthetic price seeding
  - daily balance computation

### 6) Finances Panel (`apps/finances-panel`)
- Next.js App Router app created.
- Dashboard view implemented.
- Accounts management page implemented.
- Transactions management page implemented.

### 7) Docker Runtime
- Full Compose stack created and running:
  - postgres
  - migrations
  - api
  - worker
  - finances-panel
- Healthchecks configured.
- Docker runtime issues resolved (workspace dependency linking and env resolution).

### 8) Verification Status
- `bun run lint` passes.
- `bun run typecheck` passes.
- `bun run test` passes.
- Docker stack boots healthy.
- End-to-end sanity flow validated (create account + transaction, summary updates, worker job runs recorded).

## Next

### Near-Term (v1.1 hardening)
- Add stronger API integration tests for finances routes and summary math edge cases.
- Add worker failure-path tests (lock contention, retries, failure metrics).
- Prevent framework auto-modification of tsconfig during container boot.
- Add seed script variants for deterministic demo datasets.

### Domain Expansion
- Scaffold `todo` and `calendar` modules in API and panel routing.
- Add first basic CRUD endpoint + schema for one new domain.

### Operations
- Add backup/restore scripts for Postgres volumes.
- Add a small status/diagnostics page consuming health + metrics.
- Add make-like helper scripts (`scripts/`) for common ops workflows.

### v2 Candidates
- Queue-backed worker execution model (evolution from scheduler + advisory locks).
- OpenTelemetry tracing for multi-service diagnostics.
- Auth/user model introduction (`user_id`-ready migration path).

## Current Definition of Done Check

- [x] `docker compose up` starts required services.
- [x] Services expose health checks.
- [x] Migrations are repeatable and documented.
- [x] Finances MVP works end-to-end.
