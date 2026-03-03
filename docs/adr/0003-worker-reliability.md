# ADR 0003: Worker Reliability via Advisory Locks and Job Runs

## Status
Accepted

## Context
v1 requires in-process scheduling without external queue/scheduler, while preventing duplicate execution in multi-instance runs.

## Decision
- Use an in-process scheduler in `services/worker`.
- Acquire Postgres advisory locks per job key before execution.
- Persist execution metadata in `core.job_runs`.

## Consequences
- v1 remains simple and local-first.
- Duplicate job execution is mitigated.
- The design can evolve into a DB-backed queue in v2.
