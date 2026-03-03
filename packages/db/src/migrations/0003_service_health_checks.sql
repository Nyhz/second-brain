create table if not exists core.service_health_checks (
  id uuid primary key default gen_random_uuid(),
  service_name varchar(64) not null,
  target_url varchar(512) not null,
  checked_at timestamptz not null default now(),
  status varchar(16) not null,
  http_status integer,
  latency_ms integer,
  error_message varchar(1024),
  source varchar(16) not null default 'scheduled'
);

create index if not exists service_health_checks_service_checked_idx
  on core.service_health_checks (service_name, checked_at desc);

create index if not exists service_health_checks_checked_idx
  on core.service_health_checks (checked_at desc);
