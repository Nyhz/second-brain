# Docker Operations

## Start full platform
`docker compose -f infra/docker/docker-compose.yml up --build`

## Run migrations only
`docker compose -f infra/docker/docker-compose.yml run --rm migrations`

## Seed sample data
`docker compose -f infra/docker/docker-compose.yml run --rm api sh -lc "cd /app/packages/db && bun run seed"`

## URLs
- Finances panel: `http://localhost:3000`
- API: `http://localhost:3001`
- Worker: `http://localhost:3002`

## Health and Metrics
- API: `/health`, `/ready`, `/metrics`
- Worker: `/health`, `/ready`, `/metrics`
