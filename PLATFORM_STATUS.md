# Platform Status (v1)

Last updated: 2026-03-03

This document tracks execution progress against the initial infrastructure plan (Bun + Elysia + Next.js + Drizzle, Docker-first, finances-first MVP).

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
- Root scripts for lint/typecheck/test/migrate/seed and infra lifecycle added.

### 2) Shared Packages
- `packages/types`: shared API/domain schemas and types.
- `packages/config`: environment loading/validation.
- `packages/db`: Drizzle schema exports, migration runner, seed runner.
- `packages/ui`: shared dashboard design system components and chart wrappers.

### 3) Database + Migrations
- Postgres schema-per-domain setup implemented:
  - `core`
  - `finances`
  - `todo` (placeholder)
  - `calendar` (placeholder)
- Migrations include:
  - `core.job_runs`
  - `finances.accounts`
  - `finances.transactions`
  - `finances.daily_balances`
  - `finances.price_history`
  - `finances.assets`
  - `finances.asset_positions`
  - `finances.asset_valuations`

### 4) API Service (`services/api`)
- Elysia service running with:
  - `/health`
  - `/ready`
  - `/metrics`
- Finances module endpoints:
  - accounts list/create
  - transactions list/create/update/delete
  - assets list/create/update/deactivate
  - asset positions upsert
  - portfolio summary
  - markets latest prices
  - finances summary
- Operations module endpoints:
  - `GET /ops/status/history?hours=24`
  - `POST /ops/status/check-now` (live, non-persistent)
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
  - snapshot asset valuations
  - hourly service health probes for API/Worker/Caddy
- Retention policy implemented for ops checks:
  - keep latest 24 checks per service in `core.service_health_checks`

### 6) Finances Panel (`apps/finances-panel`)
- Full dark-theme dashboard shell implemented with shared UI package.
- App routes implemented:
  - `/` (overview)
  - `/portfolio`
  - `/markets`
  - `/assets`
  - `/accounts`
  - `/transactions`
  - `/settings`
- Data loading upgraded to API-first with mock fallback.
- Assets workflow supports create, position updates, metadata updates, and deactivate.
- Transactions workflow supports create, update, and delete.
- Accounts workflow supports create + list.

### 7) Docker Runtime
- Full Compose stack created and running:
  - postgres
  - migrations
  - api
  - worker
  - finances-panel
  - portal
  - caddy (reverse proxy)
- Healthchecks configured for all services.
- LAN routing unified under one base domain:
  - `https://secondbrain.lan/`
  - `https://secondbrain.lan/finances`
  - `https://secondbrain.lan/api`
  - `https://secondbrain.lan/worker`
- Legacy hostnames redirect to unified paths:
  - `finances.lan`
  - `api.lan`
  - `worker.lan`
- LAN HTTPS enabled via Caddy internal CA (`tls internal`).
- Postgres exposure hardened to localhost only.
- Caddy internal health endpoint exposed for intra-network probing:
  - `http://caddy:8080/__caddy/healthz`

### 8) Portal + Ops Visibility (`apps/portal`)
- Landing page is active at `https://secondbrain.lan/`.
- Operations section includes:
  - per-service current status chips
  - 24h timeline graph sourced from persisted checks
  - explicit time axis and status color legend
  - `Check now` action with modal showing immediate service status
### 9) Verification Status
- `bun run lint` passes.
- `bun run typecheck` passes.
- `bun run test` passes.
- `cd apps/finances-panel && bun test` passes.
- API integration coverage includes assets, portfolio summary, and latest markets routes.

## Next

### Near-Term (v1.2 hardening)
- Keep strengthening API integration tests for financial math edge cases.
- Add worker failure-path tests (lock contention, retries, failure metrics).
- Add deterministic seed dataset variants for demo scenarios.
- Add UI-level tests for asset metadata edit and tab flows.

### Operations
- Add backup/restore scripts for Postgres volumes.
- Add make-like helper scripts (`scripts/`) for common ops workflows.
- Add scripted cert export/install docs per OS for LAN HTTPS onboarding.

### Domain Expansion
- Scaffold `todo` and `calendar` modules in API and panel routing.
- Add first basic CRUD endpoint + schema for one new domain.

### v2 Candidates
- Queue-backed worker execution model (evolution from scheduler + advisory locks).
- OpenTelemetry tracing for multi-service diagnostics.
- Auth/user model introduction (`user_id`-ready migration path).

## Current Definition of Done Check

- [x] `docker compose up` starts required services.
- [x] Services expose health checks.
- [x] Migrations are repeatable and documented.
- [x] Finances MVP works end-to-end.
