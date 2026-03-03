# ADR 0004: v1 Observability Baseline

## Status
Accepted

## Context
Platform services need basic operability and diagnostics without full tracing overhead.

## Decision
- Expose `/health` and `/ready` endpoints in API and worker.
- Emit structured JSON logs.
- Expose Prometheus-compatible `/metrics` in API and worker.
- Defer OpenTelemetry tracing to v2.

## Consequences
- Reliable local health checks and metrics scraping are available from day one.
- Deep distributed trace correlation is deferred.
