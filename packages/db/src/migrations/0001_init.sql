create extension if not exists pgcrypto;

create schema if not exists core;
create schema if not exists finances;
create schema if not exists todo;
create schema if not exists calendar;

do $$ begin
  create type job_run_status as enum ('success', 'failed', 'skipped');
exception
  when duplicate_object then null;
end $$;

create table if not exists core.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name varchar(128) not null,
  scheduled_at timestamptz not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status job_run_status not null,
  error_message varchar(1024),
  metrics_json jsonb not null default '{}'::jsonb
);

create table if not exists finances.accounts (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  currency varchar(3) not null,
  account_type varchar(32) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finances.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references finances.accounts(id) on delete cascade,
  posted_at timestamptz not null,
  amount numeric(18,2) not null,
  description text not null,
  category varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_account_posted_idx on finances.transactions (account_id, posted_at);

create table if not exists finances.daily_balances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references finances.accounts(id) on delete cascade,
  balance_date date not null,
  balance numeric(18,2) not null,
  created_at timestamptz not null default now(),
  unique (account_id, balance_date)
);

create table if not exists finances.price_history (
  id uuid primary key default gen_random_uuid(),
  symbol varchar(16) not null,
  priced_at timestamptz not null,
  price numeric(18,6) not null,
  source varchar(64) not null default 'synthetic',
  created_at timestamptz not null default now()
);

create index if not exists price_history_symbol_priced_idx on finances.price_history (symbol, priced_at);
