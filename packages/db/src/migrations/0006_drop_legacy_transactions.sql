-- Preserve historical cash effect from legacy finances.transactions
-- by folding per-account totals into opening_balance_eur.
with legacy_totals as (
  select
    account_id,
    coalesce(sum(amount), 0)::numeric(18,2) as total_amount
  from finances.transactions
  group by account_id
)
update finances.accounts a
set opening_balance_eur = a.opening_balance_eur + lt.total_amount
from legacy_totals lt
where a.id = lt.account_id;

drop table if exists finances.transactions;
