alter table finances.assets
  add column if not exists ticker varchar(32),
  add column if not exists isin varchar(12),
  add column if not exists exchange varchar(64),
  add column if not exists provider_symbol varchar(64);

update finances.assets
set ticker = coalesce(ticker, symbol, upper(left(name, 8)))
where ticker is null;

update finances.assets
set isin = coalesce(isin, concat('UNKN', substring(replace(id::text, '-', '') from 1 for 8)))
where isin is null;

alter table finances.assets
  alter column ticker set not null,
  alter column isin set not null;

create unique index if not exists assets_isin_uidx on finances.assets (isin);
create index if not exists assets_ticker_idx on finances.assets (ticker);

create table if not exists finances.asset_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references finances.accounts(id) on delete cascade,
  asset_id uuid not null references finances.assets(id) on delete cascade,
  transaction_type varchar(16) not null,
  traded_at timestamptz not null,
  quantity numeric(24,8) not null,
  unit_price numeric(18,6) not null,
  trade_currency varchar(3) not null,
  fx_rate_to_eur numeric(18,8),
  fees_amount numeric(18,6) not null default 0,
  fees_currency varchar(3),
  external_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_transactions_account_traded_idx
  on finances.asset_transactions (account_id, traded_at desc);
create index if not exists asset_transactions_asset_traded_idx
  on finances.asset_transactions (asset_id, traded_at desc);
create index if not exists asset_transactions_type_traded_idx
  on finances.asset_transactions (transaction_type, traded_at desc);
