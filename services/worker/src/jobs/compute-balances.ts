import { createDbClient } from '@second-brain/db';

export const computeDailyBalances = async (
  databaseUrl: string,
): Promise<Record<string, unknown>> => {
  const { sql } = createDbClient(databaseUrl);

  await sql`
    insert into finances.daily_balances (account_id, balance_date, balance)
    select
      account_id,
      current_date,
      sum(amount)::numeric(18,2) as balance
    from finances.transactions
    group by account_id
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
