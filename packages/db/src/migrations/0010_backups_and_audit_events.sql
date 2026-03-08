create table if not exists core.backup_runs (
  id uuid primary key default gen_random_uuid(),
  backup_type varchar(64) not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status job_run_status not null,
  file_name varchar(512),
  file_path varchar(1024),
  file_size_bytes integer,
  file_sha256 varchar(64),
  verified_at timestamptz,
  error_message varchar(1024),
  metrics_json jsonb not null default '{}'::jsonb,
  file_deleted_at timestamptz
);

create index if not exists backup_runs_started_idx
  on core.backup_runs (started_at);

create index if not exists backup_runs_status_started_idx
  on core.backup_runs (status, started_at);

create table if not exists finances.audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type varchar(64) not null,
  entity_id uuid not null,
  action varchar(32) not null,
  actor_type varchar(32) not null,
  source varchar(64) not null,
  summary text not null,
  previous_json jsonb,
  next_json jsonb,
  context_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_entity_created_idx
  on finances.audit_events (entity_type, entity_id, created_at);

create index if not exists audit_events_source_created_idx
  on finances.audit_events (source, created_at);

create index if not exists audit_events_created_idx
  on finances.audit_events (created_at);
