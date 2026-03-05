create table if not exists finances.transaction_imports (
  id uuid primary key default gen_random_uuid(),
  source varchar(32) not null,
  account_id uuid not null references finances.accounts(id) on delete cascade,
  filename text not null,
  file_hash varchar(64) not null,
  dry_run boolean not null default true,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  failed_rows integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transaction_imports_account_created_idx
  on finances.transaction_imports (account_id, created_at desc);

create index if not exists transaction_imports_file_hash_idx
  on finances.transaction_imports (file_hash);

create table if not exists finances.transaction_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references finances.transaction_imports(id) on delete cascade,
  row_number integer not null,
  status varchar(16) not null,
  error_code varchar(64),
  error_message text,
  external_reference text,
  asset_id uuid references finances.assets(id) on delete set null,
  transaction_id uuid references finances.asset_transactions(id) on delete set null,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transaction_import_rows_import_row_idx
  on finances.transaction_import_rows (import_id, row_number);

create index if not exists transaction_import_rows_import_status_idx
  on finances.transaction_import_rows (import_id, status);

create unique index if not exists asset_transactions_account_external_reference_uidx
  on finances.asset_transactions (account_id, external_reference)
  where external_reference is not null;
