create table if not exists finances.assets (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  asset_type varchar(32) not null,
  subtype varchar(64),
  symbol varchar(32),
  currency varchar(3) not null default 'USD',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assets_type_active_idx on finances.assets (asset_type, is_active);
create index if not exists assets_symbol_idx on finances.assets (symbol);

create table if not exists finances.asset_positions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references finances.assets(id) on delete cascade,
  quantity numeric(24,8) not null default 1,
  average_cost numeric(18,6),
  manual_price numeric(18,6),
  manual_price_as_of timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_positions_asset_id_idx on finances.asset_positions (asset_id);

create table if not exists finances.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references finances.assets(id) on delete cascade,
  valuation_date date not null,
  quantity numeric(24,8) not null,
  unit_price numeric(18,6) not null,
  market_value numeric(18,2) not null,
  price_source varchar(32) not null,
  created_at timestamptz not null default now(),
  unique (asset_id, valuation_date)
);

create index if not exists asset_valuations_asset_date_idx on finances.asset_valuations (asset_id, valuation_date desc);
create index if not exists asset_valuations_date_idx on finances.asset_valuations (valuation_date);

