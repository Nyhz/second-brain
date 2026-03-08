# Backups

## Current behavior
- The worker creates one Postgres custom-format dump per day.
- Dumps are stored in the worker-mounted `/backups` volume.
- The backup job verifies each dump with `pg_restore --list`.
- Local retention is capped at **2 dump files**. After each successful backup, the oldest dumps beyond the newest two are deleted.
- Metadata for all backup runs remains in `core.backup_runs`, even after old files are deleted.

## Restore
This is a destructive restore of the main database. It drops and recreates the target DB before restoring the dump.

Recommended precondition:
- stop or quiesce write traffic before restoring

Commands:
```bash
bun run db:restore -- latest --force
bun run db:restore -- second-brain-2026-03-08T03-15-00Z.dump --force
```

Behavior:
- resolves the requested dump from `/backups`
- recreates the configured `POSTGRES_DB`
- runs `pg_restore --clean --if-exists --no-owner`

## Restore Verification
This restores a dump into a temporary database, runs basic integrity checks, and then drops the temp DB.

Commands:
```bash
bun run db:verify-restore
bun run db:verify-restore -- second-brain-2026-03-08T03-15-00Z.dump
```

Current verification checks:
- `core` schema exists
- `finances` schema exists
- `finances.accounts` is queryable
- `finances.assets` is queryable
- `finances.asset_transactions` is queryable
- `core.backup_runs` is queryable

## Notes
- Local backups on the same machine are for rollback and operational recovery, not full disaster recovery.
- They help with accidental deletes, bad migrations, and app bugs.
- They do not protect against host disk failure or machine loss.
