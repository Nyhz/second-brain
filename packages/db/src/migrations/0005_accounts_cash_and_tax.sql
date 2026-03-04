alter table finances.accounts
  add column if not exists base_currency varchar(3) not null default 'EUR',
  add column if not exists opening_balance_eur numeric(18,2) not null default 0;

update finances.accounts
set base_currency = 'EUR'
where base_currency is null;

update finances.accounts
set opening_balance_eur = 0
where opening_balance_eur is null;

alter table finances.asset_transactions
  add column if not exists cash_impact_eur numeric(18,2) not null default 0,
  add column if not exists dividend_gross numeric(18,6),
  add column if not exists withholding_tax numeric(18,6),
  add column if not exists dividend_net numeric(18,6);

create index if not exists asset_transactions_account_asset_traded_idx
  on finances.asset_transactions (account_id, asset_id, traded_at desc);
