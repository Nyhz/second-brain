alter table finances.asset_transactions
  add column if not exists trade_gross_amount numeric(18, 6) not null default 0,
  add column if not exists trade_gross_amount_eur numeric(18, 2) not null default 0,
  add column if not exists fees_amount_eur numeric(18, 2) not null default 0,
  add column if not exists net_amount_eur numeric(18, 2) not null default 0,
  add column if not exists settlement_date date,
  add column if not exists raw_payload jsonb;

update finances.asset_transactions
set
  trade_gross_amount = case
    when transaction_type in ('buy', 'sell') then round((quantity * unit_price)::numeric, 6)
    else 0
  end,
  trade_gross_amount_eur = case
    when transaction_type in ('buy', 'sell') then round(
      (
        case
          when trade_currency = 'EUR' then (quantity * unit_price)
          else (quantity * unit_price) * coalesce(fx_rate_to_eur, 0)
        end
      )::numeric,
      2
    )
    else 0
  end,
  fees_amount_eur = round(
    (
      case
        when coalesce(fees_amount, 0) = 0 then 0
        when coalesce(fees_currency, trade_currency, 'EUR') = 'EUR' then coalesce(fees_amount, 0)
        else coalesce(fees_amount, 0) * coalesce(fx_rate_to_eur, 0)
      end
    )::numeric,
    2
  ),
  net_amount_eur = round(
    (
      case
        when transaction_type = 'buy' then abs(coalesce(cash_impact_eur, 0))
        when transaction_type = 'sell' then abs(coalesce(cash_impact_eur, 0))
        when transaction_type = 'fee' then abs(coalesce(cash_impact_eur, 0))
        when transaction_type = 'dividend' then coalesce(cash_impact_eur, 0)
        else abs(coalesce(cash_impact_eur, 0))
      end
    )::numeric,
    2
  );
