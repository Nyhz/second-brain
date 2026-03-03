import { createDbClient } from '@second-brain/db';

export const seedSyntheticPrices = async (
  databaseUrl: string,
  symbols: string[],
  seed: number,
): Promise<Record<string, unknown>> => {
  const { sql } = createDbClient(databaseUrl);
  const now = new Date();

  let inserted = 0;

  for (const [i, symbol] of symbols.entries()) {
    const base = 50 + (i + 1) * 25;
    const noise = Math.sin(seed + now.getUTCMinutes() + i) * 5;
    const price = Number((base + noise).toFixed(4));

    await sql`
      insert into finances.price_history (symbol, priced_at, price, source)
      values (${symbol}, ${now.toISOString()}, ${price}, 'synthetic')
    `;

    inserted += 1;
  }

  await sql.end();

  return {
    symbols: symbols.length,
    inserted,
    pricedAt: now.toISOString(),
  };
};
