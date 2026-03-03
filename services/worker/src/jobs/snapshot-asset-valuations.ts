import { createDbClient, sql } from '@second-brain/db';

export const snapshotAssetValuations = async (
  databaseUrl: string,
): Promise<Record<string, unknown>> => {
  const { db, sql: rawSql } = createDbClient(databaseUrl);

  const rows = await db.execute(sql`
    with latest_market as (
      select distinct on (symbol)
        symbol,
        price,
        priced_at
      from finances.price_history
      order by symbol, priced_at desc
    )
    select
      a.id as asset_id,
      a.symbol,
      coalesce(ap.quantity, 1)::numeric as quantity,
      ap.manual_price,
      ap.manual_price_as_of,
      lm.price as market_price,
      lm.priced_at as market_priced_at
    from finances.assets a
    left join finances.asset_positions ap on ap.asset_id = a.id
    left join latest_market lm on lm.symbol = a.symbol
    where a.is_active = true
  `);

  let upserted = 0;
  for (const row of rows) {
    const quantity = Number(row.quantity ?? 1);
    const marketPrice =
      row.market_price === null || row.market_price === undefined
        ? null
        : Number(row.market_price);
    const manualPrice =
      row.manual_price === null || row.manual_price === undefined
        ? null
        : Number(row.manual_price);

    const resolvedPrice = marketPrice ?? manualPrice;
    if (resolvedPrice === null) {
      continue;
    }

    const priceSource = marketPrice !== null ? 'market' : 'manual';
    const marketValue = Number((quantity * resolvedPrice).toFixed(2));

    await rawSql`
      insert into finances.asset_valuations (
        asset_id,
        valuation_date,
        quantity,
        unit_price,
        market_value,
        price_source
      )
      values (
        ${String(row.asset_id)},
        current_date,
        ${quantity},
        ${resolvedPrice},
        ${marketValue},
        ${priceSource}
      )
      on conflict (asset_id, valuation_date)
      do update set
        quantity = excluded.quantity,
        unit_price = excluded.unit_price,
        market_value = excluded.market_value,
        price_source = excluded.price_source
    `;
    upserted += 1;
  }

  await rawSql.end();

  return {
    valuationDate: new Date().toISOString().slice(0, 10),
    assetsSnapshotted: upserted,
    activeAssets: rows.length,
  };
};
