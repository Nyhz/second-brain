# ADR 0001: Runtime and Application Stack

## Status
Accepted

## Context
The platform requires local-first operation, containerized deployment, and fast iteration across multiple services.

## Decision
- Runtime and package manager: Bun
- API framework: Elysia
- Frontend framework: Next.js App Router
- Database: Postgres
- ORM/migrations: Drizzle ORM + Drizzle migrations
- Lint/format: Biome

## Consequences
- Single runtime across apps and services reduces toolchain variance.
- Next.js may require Node compatibility in some ecosystem tools; we constrain dependencies to Bun-compatible options.
