create table if not exists finances.account_cash_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references finances.accounts(id) on delete cascade,
  movement_type varchar(32) not null,
  occurred_at timestamptz not null,
  value_date date,
  native_amount numeric(18, 6) not null default 0,
  currency varchar(3) not null,
  fx_rate_to_eur numeric(18, 8),
  cash_impact_eur numeric(18, 2) not null default 0,
  external_reference text,
  row_fingerprint varchar(64),
  source varchar(64) not null default 'manual',
  description text,
  raw_payload jsonb,
  affects_cash_balance boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_cash_movements_account_occurred_idx
  on finances.account_cash_movements (account_id, occurred_at desc);

create index if not exists account_cash_movements_account_external_reference_idx
  on finances.account_cash_movements (account_id, external_reference);

create unique index if not exists account_cash_movements_account_source_row_fingerprint_uidx
  on finances.account_cash_movements (account_id, source, row_fingerprint);

alter table finances.asset_transactions
  add column if not exists linked_transaction_id uuid references finances.asset_transactions(id) on delete set null,
  add column if not exists row_fingerprint varchar(64),
  add column if not exists source varchar(64) not null default 'manual';

drop index if exists finances.asset_transactions_account_external_reference_uidx;

create index if not exists asset_transactions_account_external_reference_idx
  on finances.asset_transactions (account_id, external_reference);

create unique index if not exists asset_transactions_account_source_row_fingerprint_uidx
  on finances.asset_transactions (account_id, source, row_fingerprint);

alter table finances.transaction_import_rows
  add column if not exists row_fingerprint varchar(64),
  add column if not exists row_type varchar(64),
  add column if not exists movement_table varchar(32),
  add column if not exists movement_id uuid;
