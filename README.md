# second-brain

Local-first, self-hosted multi-app platform powered by Bun.

## Quickstart
1. Copy `.env.example` to `.env`.
2. Run `docker compose -f infra/docker/docker-compose.yml up --build`.
3. Open:
- Finances panel: `http://localhost:3000`
- API health: `http://localhost:3001/health`
- Worker health: `http://localhost:3002/health`

## Services
- `apps/finances-panel`: Next.js app for finances dashboard + CRUD.
- `services/api`: Elysia API with domain modules.
- `services/worker`: scheduled jobs with advisory-lock coordination.
- `packages/db`: Drizzle schema, migrations, seed logic.
- `packages/config`: env validation.
- `packages/types`: shared contracts.

## Commands
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run db:migrate`
- `bun run db:seed`
- `bun run infra:up`
- `bun run infra:up:build`
- `bun run infra:ps`
- `bun run infra:logs`
- `bun run infra:down`

## Daily Infra Ops
- Start stack: `bun run infra:up`
- Start with rebuild: `bun run infra:up:build`
- Check status: `bun run infra:ps`
- Follow logs: `bun run infra:logs`
- Stop stack: `bun run infra:down`

## Open Questions
- Backup/restore automation scope for v1.1.
- Queue migration strategy for worker v2.
