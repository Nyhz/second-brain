alter table calendar.events
  add column if not exists uid varchar(255);

update calendar.events
set uid = id::text
where uid is null;

alter table calendar.events
  alter column uid set not null;

create unique index if not exists calendar_events_uid_uidx
  on calendar.events (uid);

alter table calendar.events
  add column if not exists dtstamp timestamptz;

update calendar.events
set dtstamp = coalesce(updated_at, created_at, now())
where dtstamp is null;

alter table calendar.events
  alter column dtstamp set not null;

alter table calendar.events
  alter column dtstamp set default now();

alter table calendar.events
  add column if not exists sequence integer;

update calendar.events
set sequence = 0
where sequence is null;

alter table calendar.events
  alter column sequence set not null;

alter table calendar.events
  alter column sequence set default 0;

alter table calendar.events
  add constraint calendar_events_sequence_chk
  check (sequence >= 0);

create table if not exists calendar.event_recurrence_exdates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references calendar.events (id) on delete cascade,
  excluded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_event_recurrence_exdates_event_idx
  on calendar.event_recurrence_exdates (event_id);

create unique index if not exists calendar_event_recurrence_exdates_event_excluded_at_uidx
  on calendar.event_recurrence_exdates (event_id, excluded_at);
