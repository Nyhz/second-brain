# ADR 0002: Single Postgres Cluster with Schema per Domain

## Status
Accepted

## Context
The platform hosts multiple domain apps that share infrastructure and need strong data boundaries with future multi-user capability.

## Decision
- Use one Postgres cluster.
- Use one schema per domain/app.
- Initialize `core`, `finances`, `todo`, and `calendar` schemas in v1.
- Require SQL migrations for schema changes.

## Consequences
- Domain boundaries remain explicit.
- Cross-domain joins are possible but discouraged.
- Migration discipline is required for every schema change.
