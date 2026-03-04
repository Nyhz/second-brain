import { createDbClient } from '@second-brain/db';

export const computeDailyBalances = async (
  databaseUrl: string,
): Promise<Record<string, unknown>> => {
  const { sql } = createDbClient(databaseUrl);

  await sql`
    insert into finances.daily_balances (account_id, balance_date, balance)
    select
      a.id as account_id,
      current_date,
      (a.opening_balance_eur + coalesce(sum(at.cash_impact_eur), 0))::numeric(18,2) as balance
    from finances.accounts a
    left join finances.asset_transactions at on at.account_id = a.id
    group by a.id, a.opening_balance_eur
    on conflict (account_id, balance_date)
    do update set balance = excluded.balance
  `;

  const [row] =
    await sql`select count(*)::int as cnt from finances.daily_balances where balance_date = current_date`;
  await sql.end();

  return {
    dailyBalancesUpserted: Number(row?.cnt ?? 0),
    forDate: new Date().toISOString().slice(0, 10),
  };
};
