import { createDbClient, sql } from '@second-brain/db';
import yahooFinance from 'yahoo-finance2';
import { log } from '../lib/logger';

const PRICE_SOURCE = 'yahoo';
const FX_SOURCE = 'yahoo_fx';
const EURUSD_SYMBOL = 'EURUSD=X';
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 600;
const yahooClient = new yahooFinance();

type SyncYahooPricesOptions = {
  requestDelayMs: number;
  backfillDaysPerRun: number;
  lookbackDays: number;
};

type PricePoint = {
  pricedAt: Date;
  price: number;
};

type SymbolSyncState = {
  symbol: string;
  firstBuyAt: Date | null;
  firstYahooPriceAt: Date | null;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const startOfUtcDay = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

const addUtcDays = (value: Date, days: number) => {
  const out = new Date(value);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
};

const toDateOrNull = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const withRetry = async <T>(label: string, runner: () => Promise<T>) => {
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      return await runner();
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        throw error;
      }
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      log('error', 'yahoo_request_retry', {
        label,
        attempt: attempt + 1,
        delayMs: delay,
        error: String(error),
      });
      await sleep(delay);
      attempt += 1;
    }
  }
  throw new Error(`Unreachable retry branch for ${label}`);
};

const normalizeYahooDate = (value: Date) =>
  new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

const fetchDailyCloses = async (
  symbol: string,
  period1: Date,
  period2: Date,
): Promise<PricePoint[]> => {
  const rows = (await yahooClient.historical(symbol, {
    period1,
    period2,
    interval: '1d',
  })) as Array<{ date?: Date | string; close?: number | null }>;

  const byDay = new Map<string, PricePoint>();
  for (const row of rows) {
    if (row.close === null || row.close === undefined) continue;
    const price = Number(row.close);
    if (!Number.isFinite(price) || price <= 0) continue;

    const rawDate =
      row.date instanceof Date
        ? row.date
        : row.date
          ? new Date(String(row.date))
          : null;
    if (!rawDate || Number.isNaN(rawDate.getTime())) continue;

    const pricedAt = normalizeYahooDate(rawDate);
    byDay.set(pricedAt.toISOString().slice(0, 10), { pricedAt, price });
  }

  return [...byDay.values()].sort(
    (a, b) => a.pricedAt.getTime() - b.pricedAt.getTime(),
  );
};

const upsertPricePoints = async (
  sqlClient: ReturnType<typeof createDbClient>['sql'],
  symbol: string,
  source: string,
  points: PricePoint[],
) => {
  let upserted = 0;
  for (const point of points) {
    await sqlClient`
      insert into finances.price_history (
        symbol,
        priced_at,
        price,
        source
      )
      values (
        ${symbol},
        ${point.pricedAt.toISOString()},
        ${point.price},
        ${source}
      )
      on conflict (symbol, source, priced_date_utc)
      do update set
        priced_at = excluded.priced_at,
        price = excluded.price
    `;
    upserted += 1;
  }
  return upserted;
};

const listSymbolsToSync = async (databaseUrl: string) => {
  const { db, sql: rawSql } = createDbClient(databaseUrl);

  const rows = await db.execute(sql`
    with asset_symbols as (
      select
        upper(
          coalesce(
            nullif(trim(a.provider_symbol), ''),
            nullif(trim(a.symbol), ''),
            nullif(trim(a.ticker), '')
          )
        ) as symbol,
        min(
          case
            when at.transaction_type = 'buy' then at.traded_at
            else null
          end
        ) as first_buy_at
      from finances.assets a
      left join finances.asset_transactions at on at.asset_id = a.id
      where a.is_active = true
      group by 1
    )
    select
      s.symbol,
      s.first_buy_at as "firstBuyAt",
      (
        select min(ph.priced_at)
        from finances.price_history ph
        where ph.symbol = s.symbol
          and ph.source = ${PRICE_SOURCE}
      ) as "firstYahooPriceAt"
    from asset_symbols s
    where s.symbol is not null and s.symbol <> ''
    order by s.symbol asc
  `);

  await rawSql.end();

  return rows.map(
    (row): SymbolSyncState => ({
      symbol: String(row.symbol),
      firstBuyAt: toDateOrNull(row.firstBuyAt),
      firstYahooPriceAt: toDateOrNull(row.firstYahooPriceAt),
    }),
  );
};

export const syncYahooPrices = async (
  databaseUrl: string,
  options: SyncYahooPricesOptions,
): Promise<Record<string, unknown>> => {
  const { sql: sqlClient } = createDbClient(databaseUrl);
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const period2 = addUtcDays(todayStart, 1);
  const lookbackFrom = addUtcDays(
    todayStart,
    -Math.max(1, options.lookbackDays),
  );

  let symbolsProcessed = 0;
  let rowsUpserted = 0;
  let fxRowsUpserted = 0;
  let backfillSymbols = 0;
  let failures = 0;

  try {
    const symbols = await listSymbolsToSync(databaseUrl);

    try {
      const fxPoints = await withRetry(EURUSD_SYMBOL, () =>
        fetchDailyCloses(EURUSD_SYMBOL, lookbackFrom, period2),
      );
      fxRowsUpserted += await upsertPricePoints(
        sqlClient,
        EURUSD_SYMBOL,
        FX_SOURCE,
        fxPoints,
      );
    } catch (error) {
      failures += 1;
      log('error', 'yahoo_fx_sync_failed', {
        symbol: EURUSD_SYMBOL,
        error: String(error),
      });
    }

    for (const [index, item] of symbols.entries()) {
      const symbol = item.symbol;
      symbolsProcessed += 1;

      try {
        const recentPoints = await withRetry(`recent:${symbol}`, () =>
          fetchDailyCloses(symbol, lookbackFrom, period2),
        );
        rowsUpserted += await upsertPricePoints(
          sqlClient,
          symbol,
          PRICE_SOURCE,
          recentPoints,
        );

        const firstBuyAt = item.firstBuyAt
          ? startOfUtcDay(item.firstBuyAt)
          : null;
        const firstKnown =
          item.firstYahooPriceAt !== null
            ? startOfUtcDay(item.firstYahooPriceAt)
            : null;

        if (
          firstBuyAt !== null &&
          (firstKnown === null || firstKnown > firstBuyAt)
        ) {
          const backfillEndExclusive = firstKnown ?? lookbackFrom;
          if (backfillEndExclusive > firstBuyAt) {
            backfillSymbols += 1;
            const chunkFromCandidate = addUtcDays(
              backfillEndExclusive,
              -Math.max(1, options.backfillDaysPerRun),
            );
            const chunkFrom =
              chunkFromCandidate > firstBuyAt ? chunkFromCandidate : firstBuyAt;

            const backfillPoints = await withRetry(`backfill:${symbol}`, () =>
              fetchDailyCloses(symbol, chunkFrom, backfillEndExclusive),
            );
            rowsUpserted += await upsertPricePoints(
              sqlClient,
              symbol,
              PRICE_SOURCE,
              backfillPoints,
            );
          }
        }
      } catch (error) {
        failures += 1;
        log('error', 'yahoo_symbol_sync_failed', {
          symbol,
          error: String(error),
        });
      }

      if (index < symbols.length - 1 && options.requestDelayMs > 0) {
        await sleep(options.requestDelayMs);
      }
    }

    return {
      symbolsProcessed,
      rowsUpserted,
      fxRowsUpserted,
      backfillSymbols,
      failures,
      lookbackDays: options.lookbackDays,
      backfillDaysPerRun: options.backfillDaysPerRun,
      asOf: now.toISOString(),
    };
  } finally {
    await sqlClient.end();
  }
};
