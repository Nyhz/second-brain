# AGENTS.md (root) — Second Brain Platform

## Mission
`second-brain` is my local-first personal platform: multiple apps (finances, calendar, tasks, etc.) running 24/7 on my Mac Mini, sharing infrastructure, data, and integrations. The system must be easy to scale and automate, while staying maintainable and consistent.

This repo is designed so that an agent (Codex/AI) can safely implement features with minimal ambiguity.

## Core Principles
1. **Local-first & self-hosted**: Everything must run locally. External APIs are optional integrations (e.g., market prices).
2. **One platform, many apps**: Shared foundations; domain boundaries remain clean.
3. **Incremental elegance**: Start simple; scale via clean seams (schemas, modules, packages).
4. **Data longevity**: Finance data (especially) must be durable, auditable, migratable.
5. **Automation as a first-class citizen**: background jobs, scheduled updates, and future Telegram actions.
6. **Docker-first deployment**: Every service/app runs in containers.

## High-Level Architecture (v1)
- **Apps**: Web UIs per domain (currently `portal` + `finances-panel`, with more domains later).
- **Shared API**: Modular backend that hosts domain modules (finances, calendar, etc.).
- **Shared DB**: One Postgres instance, **one schema per app/domain**.
- **Shared packages**: types, env/config loading, and DB utilities.
- **UI ownership**: app-local UI components/primitives per app; avoid cross-app UI coupling by default.
- **Workers**: background jobs (cron/scheduler) to update pricing, imports, etc.
- **Edge gateway**: Caddy routes traffic (`/`, `/finances`, `/api`, `/worker`) and exposes health.
- **Integrations** (future): Telegram bot gateway shared across apps.

## Database Strategy
- Single Postgres cluster for the platform.
- One schema per domain/app (e.g., `finances`, `calendar`, `core`).
- Migrations are mandatory for schema changes.
- Data model must support:
  - historical data (e.g., price history)
  - auditability (immutable transaction events where relevant)
  - future multi-user/SaaS conversion (add `user_id` later without painful rewrites)

## Deployment Strategy
- Docker Compose for local orchestration, invoked through Bun scripts.
- Each app/service runs in its own container.
- The DB runs as a container with persistent volumes.
- Services talk over an internal Docker network.
- Expose only what is needed to localhost.
- Canonical workflows:
  - `bun run infra:up` (start)
  - `bun run infra:up:build` (rebuild + restart)
  - `bun run infra:ps` (status)

## Suggested Repo Layout (may evolve)
second-brain/
  apps/
    portal/
    finances-panel/
  services/
    api/              # modular API (domain modules)
    worker/           # scheduled jobs
  packages/
    types/            # shared TS types
    db/               # db client, migrations, schema helpers
    config/           # env schema + config loader
  infra/
    docker/           # compose, env templates, scripts
  docs/
    adr/              # architectural decisions
  scripts/

> If the actual folder structure differs, respect it. Create new folders only when needed.

## API Design Rules
- Prefer modular endpoints by domain (`/finances/...`, `/calendar/...`).
- Validate all inputs (e.g., Zod).
- Standardize error shape: `{ code, message, details? }`.
- Versioning: not required in v1, but keep routing structure stable.

## Auth & Security
- v1: **single-user, localhost-only**, no auth.
- However: avoid painting into a corner:
  - Keep models ready for a future `user_id`.
  - Avoid global mutable state tied to “the one user”.
- Never expose secrets in code or commit `.env` values.

## Observability & Ops (v1 minimum)
- Structured logs (JSON) with consistent fields.
- Health endpoints for services (`/health`).
- Portal home includes a live operations status surface (history + check-now).

## Agent Rules (Codex/AI)
1. **Read first**
   - Always read this file and the target app’s `AGENTS.md` before changes.
2. **Small, verifiable changes**
   - Prefer small commits with working state.
3. **Don’t invent requirements**
   - If missing info is blocking, write an “Open Questions” section in the nearest README or create an ADR in `docs/adr/`.
4. **Document decisions**
   - Any new library/stack/architecture choice must be recorded in an ADR.
5. **Respect boundaries**
   - Keep domain logic inside its module/schema. Avoid cross-domain coupling.
6. **No real personal data**
   - Use synthetic seed data only.
7. **Post-task infra rebuild (required for code/config/infra changes)**
   - After finishing any code/config/infra change task, run:
     - `bun run infra:up:build`
     - `bun run infra:ps`
   - Include a brief service health summary in the final update.
   - For planning-only, discussion-only, or read-only review tasks, this rebuild step is not required.

## Definition of Done (platform-level)
- `bun run infra:up:build` starts/rebuilds all required services cleanly.
- `bun run infra:ps` shows platform services healthy (`postgres`, `api`, `worker`, `finances-panel`, `portal`, `caddy`).
- Each service has a health check.
- Migrations are repeatable and documented.
- Portal and finances app can display working MVP flows end-to-end.

## Runtime & Tooling

- Runtime: **Bun** (not Node.js).
- Package manager: **bun** (not npm, pnpm, or yarn).
- Scripts must use `bun run`.
- Dev server must be started with `bun`.
- Tests must be executed with `bun test`.

Agents must not introduce npm, pnpm, or yarn.
If a dependency requires Node-only features incompatible with Bun,
document the limitation before introducing it.
