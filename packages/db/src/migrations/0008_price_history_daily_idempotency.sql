alter table finances.price_history
  add column if not exists priced_date_utc date
  generated always as ((priced_at at time zone 'UTC')::date) stored;

create unique index if not exists price_history_symbol_source_priced_date_uidx
  on finances.price_history (symbol, source, priced_date_utc);
