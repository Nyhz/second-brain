create schema if not exists calendar;

create table if not exists calendar.events (
  id uuid primary key default gen_random_uuid(),
  title varchar(255) not null,
  description text,
  location varchar(255),
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone varchar(64) not null default 'Europe/Madrid',
  is_all_day boolean not null default false,
  status varchar(16) not null default 'confirmed',
  source varchar(16) not null default 'manual',
  external_reference varchar(255),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_time_chk check (end_at > start_at),
  constraint calendar_events_status_chk check (status in ('confirmed', 'cancelled')),
  constraint calendar_events_source_chk check (source in ('manual', 'ai'))
);

create index if not exists calendar_events_start_idx
  on calendar.events (start_at);

create index if not exists calendar_events_status_start_idx
  on calendar.events (status, start_at);

create index if not exists calendar_events_external_reference_idx
  on calendar.events (external_reference);

create table if not exists calendar.event_recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references calendar.events (id) on delete cascade,
  rrule text not null,
  series_starts_at timestamptz not null,
  until_at timestamptz,
  count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_recurrence_count_chk check (count is null or count > 0)
);

create unique index if not exists calendar_event_recurrence_rules_event_uidx
  on calendar.event_recurrence_rules (event_id);

create table if not exists calendar.event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references calendar.events (id) on delete cascade,
  minutes_before_start integer not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint calendar_event_reminders_minutes_chk check (minutes_before_start >= 0)
);

create index if not exists calendar_event_reminders_event_idx
  on calendar.event_reminders (event_id);

create index if not exists calendar_event_reminders_minutes_idx
  on calendar.event_reminders (minutes_before_start);
