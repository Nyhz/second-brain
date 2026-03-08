# AGENTS.md (root) — Second Brain Platform

## Mission
`second-brain` is a local-first, self-hosted personal platform composed of multiple domain apps that share infrastructure, data, and operational tooling.

The current live platform centers on:
- `portal` as the front door and operations entrypoint
- `finances-panel` as the main domain app
- `api` as the shared backend
- `worker` as the background job runner

This repo is structured so an agent can make safe, incremental changes without guessing architecture or deployment conventions.

## Core Principles
1. **Local-first & self-hosted**: the platform must run locally on the home infrastructure.
2. **One platform, many apps**: domain apps can grow independently while reusing shared foundations.
3. **Incremental elegance**: prefer small, clean seams over speculative abstraction.
4. **Data longevity**: finance and platform data must stay durable, inspectable, and migratable.
5. **Automation first**: recurring jobs, imports, snapshots, and operational checks are part of the product.
6. **Docker-first deployment**: production-like local orchestration happens through Docker Compose.

## High-Level Architecture
- **Portal app**: served at `/`, currently a minimal landing page with top navigation to the live app and a dedicated status page at `/status`
- **Finances app**: served at `/finances`, currently the primary live domain app
- **Shared API**: modular backend under `services/api`, currently exposing finances and ops routes
- **Worker**: scheduled jobs for health checks, price sync, valuation snapshots, and derived balances
- **Shared DB**: Postgres with per-domain schemas (`core`, `finances`, and future schemas)
- **Shared packages**: types, config, and DB utilities under `packages/*`
- **Edge gateway**: Caddy routes `/`, `/status`, `/finances`, `/api`, and `/worker`

## Current Platform Surface
- `portal`
  - `/` is a lightweight landing page
  - `/status` is the engineering-oriented operations page
  - supports theme persistence and live ops checks
- `finances-panel`
  - overview dashboard
  - assets
  - accounts
  - transactions
  - taxes
- `api`
  - finances module
  - ops module
- `worker`
  - service health checks
  - Yahoo price sync
  - daily balance computation
  - asset valuation snapshots

## Database Strategy
- Single Postgres cluster for the platform
- One schema per domain/app where appropriate
- Migrations are mandatory for schema changes
- Prefer data models that preserve:
  - historical values
  - auditability
  - clean future migration toward multi-user support

## Deployment Strategy
- Docker Compose is the canonical orchestration layer
- Each app/service runs in its own container
- Services communicate over the internal Docker network
- Expose only what is needed on localhost
- Canonical workflows:
  - `bun run infra:up`
  - `bun run infra:up:build`
  - `bun run infra:ps`

## API Design Rules
- Prefer modular routing by domain, for example:
  - `/finances/...`
  - `/ops/...`
- Validate inputs and outputs with shared Zod schemas
- Standardize error shape as `{ code, message, details? }`
- Keep routes stable even if the UI evolves

## Auth & Security
- Current mode is single-user and localhost-only
- No auth is required in v1
- Do not commit secrets or real personal data
- Avoid introducing irreversible single-user assumptions in data or service boundaries

## Observability & Ops
- Structured JSON logs are preferred for services and workers
- Every long-running service should expose a health endpoint
- The portal status page is the primary human-facing ops surface
- Current ops capabilities include:
  - persisted service health history
  - live `check-now` probes
  - worker-driven recurring health checks

## Agent Rules
1. **Read first**
   - Read this file and the target app’s `AGENTS.md` before making changes.
2. **Prefer repo truth over assumptions**
   - Check the implemented routes, schemas, tests, and UI before describing or extending behavior.
3. **Small, verifiable changes**
   - Keep changes incremental and validate them locally before finalizing.
4. **Respect boundaries**
   - Keep domain logic inside its app/module/schema.
5. **No real personal data**
   - Use synthetic/demo data only.
6. **Document meaningful architectural decisions**
   - New architectural or stack choices should be captured in an ADR when they materially change the platform.
7. **Post-task infra rebuild**
   - For completed code/config/infra tasks, run:
     - `bun run infra:up:build`
     - `bun run infra:ps`
   - For planning-only, discussion-only, or read-only analysis, this is not required.

## Definition of Done
- Relevant local checks pass for the affected app/service
- `bun run infra:up:build` completes successfully for completed implementation tasks
- `bun run infra:ps` shows healthy platform services:
  - `postgres`
  - `api`
  - `worker`
  - `finances-panel`
  - `portal`
  - `caddy`
- New behavior is consistent with the current platform architecture and route ownership

## Runtime & Tooling
- Runtime: **Bun**
- Package manager: **bun**
- Scripts must use `bun run`
- Tests must use `bun test`
- Do not introduce npm, pnpm, or yarn
- If a dependency requires Node-only behavior incompatible with Bun, document that limitation before adding it
