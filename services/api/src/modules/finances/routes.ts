import {
  accounts,
  and,
  assetPositions,
  assetTransactions,
  assets,
  createDbClient,
  desc,
  eq,
  sql,
} from '@second-brain/db';
import {
  type Asset,
  type AssetPosition,
  type AssetTransaction,
  type AssetType,
  type FinancesOverviewResponse,
  type OverviewRange,
  createAccountInputSchema,
  createAssetInputSchema,
  createAssetTransactionInputSchema,
  overviewRangeSchema,
  updateAssetInputSchema,
  upsertAssetPositionInputSchema,
} from '@second-brain/types';
import type { Elysia } from 'elysia';
import { withTimedDb } from '../../lib/db-timed';
import { ApiHttpError } from '../../lib/errors';

const normalizeCurrency = (value: string) => value.trim().toUpperCase();

const toIso = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
};

const toNumber = (value: unknown) => Number(value ?? 0);

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
};

const requiredIsinForType = new Set<AssetType>([
  'stock',
  'etf',
  'mutual_fund',
  'retirement_fund',
]);

const fallbackIsin = (ticker: string) =>
  `ZZ${ticker
    .replace(/[^A-Z0-9]/g, '')
    .padEnd(10, 'X')
    .slice(0, 10)}`;

const convertToEur = (
  amount: number,
  currency: string,
  fxRateToEur: number | null | undefined,
) => {
  if (currency === 'EUR') {
    return amount;
  }
  if (!fxRateToEur || fxRateToEur <= 0) {
    throw new ApiHttpError(
      400,
      'FX_RATE_REQUIRED',
      `fxRateToEur is required for ${currency} transactions`,
    );
  }
  return amount * fxRateToEur;
};

const serializeAsset = (row: Record<string, unknown>): Asset => ({
  id: String(row.id),
  name: String(row.name),
  assetType: String(row.assetType) as AssetType,
  subtype:
    row.subtype === null || row.subtype === undefined
      ? null
      : String(row.subtype),
  symbol:
    row.symbol === null || row.symbol === undefined ? null : String(row.symbol),
  ticker: String(row.ticker),
  isin: String(row.isin),
  exchange:
    row.exchange === null || row.exchange === undefined
      ? null
      : String(row.exchange),
  providerSymbol:
    row.providerSymbol === null || row.providerSymbol === undefined
      ? null
      : String(row.providerSymbol),
  currency: String(row.currency),
  isActive: Boolean(row.isActive),
  notes:
    row.notes === null || row.notes === undefined ? null : String(row.notes),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const serializeAssetPosition = (
  row: Record<string, unknown>,
): AssetPosition => ({
  id: String(row.id),
  assetId: String(row.assetId),
  quantity: toNumber(row.quantity),
  averageCost: toNullableNumber(row.averageCost),
  manualPrice: toNullableNumber(row.manualPrice),
  manualPriceAsOf:
    row.manualPriceAsOf === null || row.manualPriceAsOf === undefined
      ? null
      : toIso(row.manualPriceAsOf),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const serializeAssetTransaction = (
  row: Record<string, unknown>,
): AssetTransaction => ({
  id: String(row.id),
  accountId: String(row.accountId),
  assetId: String(row.assetId),
  assetType: String(row.assetType) as AssetType,
  transactionType: row.transactionType as AssetTransaction['transactionType'],
  tradedAt: toIso(row.tradedAt),
  quantity: toNumber(row.quantity),
  unitPrice: toNumber(row.unitPrice),
  tradeCurrency: String(row.tradeCurrency),
  fxRateToEur: toNullableNumber(row.fxRateToEur),
  cashImpactEur: toNumber(row.cashImpactEur),
  feesAmount: toNumber(row.feesAmount),
  feesCurrency:
    row.feesCurrency === null || row.feesCurrency === undefined
      ? null
      : String(row.feesCurrency),
  dividendGross: toNullableNumber(row.dividendGross),
  withholdingTax: toNullableNumber(row.withholdingTax),
  dividendNet: toNullableNumber(row.dividendNet),
  externalReference:
    row.externalReference === null || row.externalReference === undefined
      ? null
      : String(row.externalReference),
  notes:
    row.notes === null || row.notes === undefined ? null : String(row.notes),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const round2 = (value: number) => Number(value.toFixed(2));

const OVERVIEW_RANGES: OverviewRange[] = ['1D', '1W', '1M', 'YTD', '1Y', 'MAX'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const round6 = (value: number) => Number(value.toFixed(6));

const startOfUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const clampRangeStart = (
  range: OverviewRange,
  now: Date,
  minTimestampMs: number | null,
) => {
  const start = new Date(now);
  if (range === '1D') {
    start.setUTCDate(start.getUTCDate() - 1);
  } else if (range === '1W') {
    start.setUTCDate(start.getUTCDate() - 7);
  } else if (range === '1M') {
    start.setUTCMonth(start.getUTCMonth() - 1);
  } else if (range === 'YTD') {
    start.setUTCMonth(0, 1);
    start.setUTCHours(0, 0, 0, 0);
  } else if (range === '1Y') {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  } else if (range === 'MAX') {
    if (minTimestampMs !== null) {
      return new Date(minTimestampMs);
    }
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  }

  if (minTimestampMs === null) {
    return start;
  }
  return new Date(Math.max(start.getTime(), minTimestampMs));
};

export const registerFinancesRoutes = (app: Elysia, databaseUrl: string) => {
  const { db } = createDbClient(databaseUrl);

  const listAssetViews = async (filters?: {
    type?: string;
    active?: boolean;
  }) => {
    const whereClauses: ReturnType<typeof eq>[] = [];
    if (filters?.type) {
      whereClauses.push(eq(assets.assetType, filters.type));
    }
    if (filters?.active !== undefined) {
      whereClauses.push(eq(assets.isActive, filters.active));
    }

    const rows = await withTimedDb('list_assets_with_positions', async () => {
      const query = db
        .select({
          id: assets.id,
          name: assets.name,
          assetType: assets.assetType,
          subtype: assets.subtype,
          symbol: assets.symbol,
          ticker: assets.ticker,
          isin: assets.isin,
          exchange: assets.exchange,
          providerSymbol: assets.providerSymbol,
          currency: assets.currency,
          isActive: assets.isActive,
          notes: assets.notes,
          createdAt: assets.createdAt,
          updatedAt: assets.updatedAt,
          positionId: assetPositions.id,
          quantity: assetPositions.quantity,
          averageCost: assetPositions.averageCost,
          manualPrice: assetPositions.manualPrice,
          manualPriceAsOf: assetPositions.manualPriceAsOf,
          positionCreatedAt: assetPositions.createdAt,
          positionUpdatedAt: assetPositions.updatedAt,
        })
        .from(assets)
        .leftJoin(assetPositions, eq(assetPositions.assetId, assets.id));
      if (whereClauses.length === 0) {
        return query.orderBy(desc(assets.updatedAt));
      }
      return query.where(and(...whereClauses)).orderBy(desc(assets.updatedAt));
    });

    return withTimedDb('resolve_asset_prices', async () => {
      const views = [];
      for (const row of rows) {
        const asset = serializeAsset(row as Record<string, unknown>);
        const position =
          row.positionId === null || row.positionId === undefined
            ? null
            : serializeAssetPosition({
                id: row.positionId,
                assetId: row.id,
                quantity: row.quantity ?? 1,
                averageCost: row.averageCost ?? null,
                manualPrice: row.manualPrice ?? null,
                manualPriceAsOf: row.manualPriceAsOf ?? null,
                createdAt: row.positionCreatedAt ?? row.createdAt,
                updatedAt: row.positionUpdatedAt ?? row.updatedAt,
              });

        let resolvedUnitPrice: number | null = null;
        let resolvedPriceSource: 'manual' | 'market' | null = null;
        let resolvedPriceAsOf: string | null = null;

        const symbolToPrice = asset.symbol ?? asset.ticker;
        if (symbolToPrice) {
          const [priceRow] = await db.execute(sql`
            select
              price,
              priced_at as "pricedAt"
            from finances.price_history
            where symbol = ${symbolToPrice}
            order by priced_at desc
            limit 1
          `);

          if (priceRow) {
            resolvedUnitPrice = Number(priceRow.price);
            resolvedPriceSource = 'market';
            resolvedPriceAsOf = toIso(priceRow.pricedAt);
          }
        }

        if (
          resolvedUnitPrice === null &&
          position?.manualPrice !== null &&
          position?.manualPrice !== undefined
        ) {
          resolvedUnitPrice = position.manualPrice;
          resolvedPriceSource = 'manual';
          resolvedPriceAsOf = position.manualPriceAsOf;
        }

        const currentValue =
          position && resolvedUnitPrice !== null
            ? Number((position.quantity * resolvedUnitPrice).toFixed(2))
            : null;

        views.push({
          ...asset,
          position,
          resolvedUnitPrice,
          resolvedPriceSource,
          resolvedPriceAsOf,
          currentValue,
        });
      }

      return views;
    });
  };

  const listAccountsWithCash = async () => {
    const rows = await withTimedDb('list_accounts_with_cash', async () => {
      return db.execute(sql`
        select
          a.id,
          a.name,
          a.currency,
          a.base_currency as "baseCurrency",
          a.opening_balance_eur as "openingBalanceEur",
          a.account_type as "accountType",
          a.created_at as "createdAt",
          a.updated_at as "updatedAt",
          (a.opening_balance_eur + coalesce(sum(at.cash_impact_eur), 0))::numeric as "currentCashBalanceEur"
        from finances.accounts a
        left join finances.asset_transactions at on at.account_id = a.id
        group by a.id
        order by a.created_at desc
      `);
    });

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      currency: String(row.currency),
      baseCurrency: String(row.baseCurrency),
      openingBalanceEur: Number(row.openingBalanceEur ?? 0),
      accountType: String(row.accountType),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      currentCashBalanceEur: Number(row.currentCashBalanceEur ?? 0),
    }));
  };

  const getAccountCashBalance = async (accountId: string) => {
    const [row] = await withTimedDb('get_account_cash_balance', async () => {
      return db.execute(sql`
        select
          a.id,
          (a.opening_balance_eur + coalesce(sum(at.cash_impact_eur), 0))::numeric as cash_balance
        from finances.accounts a
        left join finances.asset_transactions at on at.account_id = a.id
        where a.id = ${accountId}
        group by a.id
      `);
    });

    if (!row) {
      return null;
    }

    return Number(row.cash_balance ?? 0);
  };

  app.get('/finances/accounts', async () => {
    return listAccountsWithCash();
  });

  app.post('/finances/accounts', async ({ body, set }) => {
    const parsed = createAccountInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid account payload',
        parsed.error.format(),
      );
    }

    await withTimedDb('create_account', async () => {
      return db.insert(accounts).values({
        name: parsed.data.name,
        currency: normalizeCurrency(parsed.data.currency),
        baseCurrency: 'EUR',
        openingBalanceEur: parsed.data.openingBalanceEur.toString(),
        accountType: parsed.data.accountType,
      });
    });

    const rows = await listAccountsWithCash();
    const created = rows.find((row) => row.name === parsed.data.name);
    set.status = 201;
    return created ?? rows[0];
  });

  app.get('/finances/asset-transactions', async ({ query }) => {
    const accountId = query.accountId as string | undefined;
    const assetId = query.assetId as string | undefined;
    const assetType = query.assetType as string | undefined;
    const transactionType = query.transactionType as string | undefined;

    const whereClauses: ReturnType<typeof eq>[] = [];
    if (accountId)
      whereClauses.push(eq(assetTransactions.accountId, accountId));
    if (assetId) whereClauses.push(eq(assetTransactions.assetId, assetId));
    if (transactionType)
      whereClauses.push(eq(assetTransactions.transactionType, transactionType));

    const txRows = await withTimedDb('list_asset_transactions', async () => {
      const queryBuilder = db.select().from(assetTransactions);
      if (whereClauses.length === 0) {
        return queryBuilder.orderBy(desc(assetTransactions.tradedAt));
      }
      if (whereClauses.length === 1) {
        return queryBuilder
          .where(whereClauses[0] as ReturnType<typeof eq>)
          .orderBy(desc(assetTransactions.tradedAt));
      }
      return queryBuilder
        .where(and(...whereClauses))
        .orderBy(desc(assetTransactions.tradedAt));
    });

    const assetRows = await withTimedDb(
      'list_asset_transactions_assets',
      async () => db.select().from(assets),
    );
    const assetTypeById = new Map(
      assetRows.map((row) => [String(row.id), String(row.assetType)]),
    );

    const rows = txRows
      .map((row) => ({
        ...(row as Record<string, unknown>),
        assetType: assetTypeById.get(String(row.assetId)) ?? 'other',
      }))
      .filter((row) => (assetType ? row.assetType === assetType : true));

    return rows.map((row) => serializeAssetTransaction(row));
  });

  app.post('/finances/asset-transactions', async ({ body, set }) => {
    const parsed = createAssetTransactionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid asset transaction payload',
        parsed.error.format(),
      );
    }

    const tradeCurrency = normalizeCurrency(parsed.data.tradeCurrency);
    const feesCurrency = normalizeCurrency(
      parsed.data.feesCurrency ?? parsed.data.tradeCurrency,
    );

    const [accountRow] = await withTimedDb(
      'asset_tx_account_exists',
      async () => {
        return db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.id, parsed.data.accountId));
      },
    );
    if (!accountRow) {
      throw new ApiHttpError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Account does not exist',
      );
    }

    const [assetRow] = await withTimedDb('asset_tx_asset_exists', async () => {
      return db
        .select({ id: assets.id, assetType: assets.assetType })
        .from(assets)
        .where(eq(assets.id, parsed.data.assetId));
    });
    if (!assetRow) {
      throw new ApiHttpError(404, 'ASSET_NOT_FOUND', 'Asset does not exist');
    }
    if (assetRow.assetType !== parsed.data.assetType) {
      throw new ApiHttpError(
        400,
        'ASSET_TYPE_MISMATCH',
        'Selected asset does not match selected asset type',
      );
    }

    const tradedAmount = parsed.data.quantity * parsed.data.unitPrice;
    const tradedAmountEur = convertToEur(
      tradedAmount,
      tradeCurrency,
      parsed.data.fxRateToEur ?? null,
    );
    const feesAmountEur = convertToEur(
      parsed.data.feesAmount,
      feesCurrency,
      parsed.data.fxRateToEur ?? null,
    );

    let cashImpactEur = 0;
    if (parsed.data.transactionType === 'buy') {
      cashImpactEur = -(tradedAmountEur + feesAmountEur);
    } else if (parsed.data.transactionType === 'sell') {
      cashImpactEur = tradedAmountEur - feesAmountEur;
    } else if (parsed.data.transactionType === 'fee') {
      cashImpactEur = -feesAmountEur;
    } else {
      const dividendNet = parsed.data.dividendNet ?? 0;
      cashImpactEur = convertToEur(
        dividendNet,
        tradeCurrency,
        parsed.data.fxRateToEur ?? null,
      );
    }

    if (parsed.data.transactionType === 'sell') {
      const [holdingRow] = await withTimedDb('asset_tx_holdings', async () => {
        return db.execute(sql`
          select
            coalesce(sum(case
              when transaction_type = 'buy' then quantity
              when transaction_type = 'sell' then -quantity
              else 0
            end), 0)::numeric as quantity
          from finances.asset_transactions
          where account_id = ${parsed.data.accountId}
            and asset_id = ${parsed.data.assetId}
        `);
      });

      const availableQuantity = Number(holdingRow?.quantity ?? 0);
      if (availableQuantity < parsed.data.quantity) {
        throw new ApiHttpError(
          400,
          'INSUFFICIENT_ASSET_QUANTITY',
          `Not enough holdings to sell. Available: ${availableQuantity}`,
        );
      }
    }

    const currentCash = await getAccountCashBalance(parsed.data.accountId);
    if (currentCash === null) {
      throw new ApiHttpError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Account does not exist',
      );
    }
    if (currentCash + cashImpactEur < 0) {
      throw new ApiHttpError(
        400,
        'INSUFFICIENT_CASH',
        'Transaction would make account cash balance negative',
      );
    }

    const rows = await withTimedDb('create_asset_transaction', async () => {
      return db
        .insert(assetTransactions)
        .values({
          accountId: parsed.data.accountId,
          assetId: parsed.data.assetId,
          transactionType: parsed.data.transactionType,
          tradedAt: new Date(parsed.data.tradedAt),
          quantity: parsed.data.quantity.toString(),
          unitPrice: parsed.data.unitPrice.toString(),
          tradeCurrency,
          fxRateToEur:
            parsed.data.fxRateToEur === undefined ||
            parsed.data.fxRateToEur === null
              ? null
              : parsed.data.fxRateToEur.toString(),
          cashImpactEur: round2(cashImpactEur).toString(),
          feesAmount: parsed.data.feesAmount.toString(),
          feesCurrency: parsed.data.feesAmount > 0 ? feesCurrency : null,
          dividendGross:
            parsed.data.dividendGross === undefined ||
            parsed.data.dividendGross === null
              ? null
              : parsed.data.dividendGross.toString(),
          withholdingTax:
            parsed.data.withholdingTax === undefined ||
            parsed.data.withholdingTax === null
              ? null
              : parsed.data.withholdingTax.toString(),
          dividendNet:
            parsed.data.dividendNet === undefined ||
            parsed.data.dividendNet === null
              ? null
              : parsed.data.dividendNet.toString(),
          externalReference: parsed.data.externalReference ?? null,
          notes: parsed.data.notes ?? null,
        })
        .returning();
    });

    const createdId = rows[0]?.id;
    if (!createdId) {
      throw new ApiHttpError(
        500,
        'INTERNAL_ERROR',
        'Failed to create asset transaction',
      );
    }

    set.status = 201;
    return serializeAssetTransaction({
      ...(rows[0] as Record<string, unknown>),
      assetType: parsed.data.assetType,
    });
  });

  app.get('/finances/tax/yearly-summary', async ({ query }) => {
    const yearRaw = Number(query.year ?? new Date().getUTCFullYear());
    const year = Number.isFinite(yearRaw)
      ? Math.max(2000, Math.min(2100, Math.trunc(yearRaw)))
      : new Date().getUTCFullYear();

    const from = new Date(`${year}-01-01T00:00:00.000Z`);
    const to = new Date(`${year + 1}-01-01T00:00:00.000Z`);
    const fromIsoBound = from.toISOString();
    const toIsoBound = to.toISOString();

    const rows = await withTimedDb('tax_yearly_rows', async () => {
      return db.execute(sql`
        select
          at.id,
          at.account_id as "accountId",
          at.asset_id as "assetId",
          a.name as "assetName",
          a.ticker as "assetTicker",
          at.transaction_type as "transactionType",
          at.traded_at as "tradedAt",
          at.quantity,
          at.unit_price as "unitPrice",
          at.trade_currency as "tradeCurrency",
          at.fx_rate_to_eur as "fxRateToEur",
          at.fees_amount as "feesAmount",
          at.fees_currency as "feesCurrency",
          at.dividend_gross as "dividendGross",
          at.withholding_tax as "withholdingTax",
          at.dividend_net as "dividendNet"
        from finances.asset_transactions at
        inner join finances.assets a on a.id = at.asset_id
        where at.traded_at >= ${fromIsoBound}::timestamptz
          and at.traded_at < ${toIsoBound}::timestamptz
        order by at.asset_id asc, at.traded_at asc, at.created_at asc
      `);
    });

    type Lot = { quantity: number; unitCostEur: number };

    const lotsByAsset = new Map<string, Lot[]>();
    const realizedRows: Array<{
      transactionId: string;
      tradedAt: string;
      assetId: string;
      assetTicker: string;
      assetName: string;
      quantitySold: number;
      proceedsEur: number;
      costBasisEur: number;
      realizedGainLossEur: number;
    }> = [];

    let realizedGainLossEur = 0;
    let dividendsGrossEur = 0;
    let dividendsWithholdingEur = 0;
    let dividendsNetEur = 0;

    for (const row of rows) {
      const transactionType = String(row.transactionType);
      const assetId = String(row.assetId);
      const quantity = Number(row.quantity ?? 0);
      const unitPrice = Number(row.unitPrice ?? 0);
      const tradeCurrency = normalizeCurrency(
        String(row.tradeCurrency ?? 'EUR'),
      );
      const fxRateToEur =
        row.fxRateToEur === null || row.fxRateToEur === undefined
          ? null
          : Number(row.fxRateToEur);
      const feesAmount = Number(row.feesAmount ?? 0);
      const feesCurrency = normalizeCurrency(
        String(row.feesCurrency ?? row.tradeCurrency ?? 'EUR'),
      );

      const lots = lotsByAsset.get(assetId) ?? [];

      if (transactionType === 'buy') {
        const totalGrossEur = convertToEur(
          quantity * unitPrice,
          tradeCurrency,
          fxRateToEur,
        );
        const totalFeesEur = convertToEur(
          feesAmount,
          feesCurrency,
          fxRateToEur,
        );
        const lotUnitCost =
          quantity > 0 ? (totalGrossEur + totalFeesEur) / quantity : 0;
        lots.push({ quantity, unitCostEur: lotUnitCost });
        lotsByAsset.set(assetId, lots);
      }

      if (transactionType === 'sell') {
        let remaining = quantity;
        let costBasisEur = 0;

        while (remaining > 0 && lots.length > 0) {
          const current = lots[0];
          if (!current) {
            break;
          }
          const matched = Math.min(current.quantity, remaining);
          costBasisEur += matched * current.unitCostEur;
          current.quantity -= matched;
          remaining -= matched;
          if (current.quantity <= 0) {
            lots.shift();
          }
        }

        const proceedsGrossEur = convertToEur(
          quantity * unitPrice,
          tradeCurrency,
          fxRateToEur,
        );
        const proceedsFeesEur = convertToEur(
          feesAmount,
          feesCurrency,
          fxRateToEur,
        );
        const proceedsEur = proceedsGrossEur - proceedsFeesEur;
        const realized = proceedsEur - costBasisEur;
        realizedGainLossEur += realized;

        realizedRows.push({
          transactionId: String(row.id),
          tradedAt: toIso(row.tradedAt),
          assetId,
          assetTicker: String(row.assetTicker),
          assetName: String(row.assetName),
          quantitySold: quantity,
          proceedsEur: round2(proceedsEur),
          costBasisEur: round2(costBasisEur),
          realizedGainLossEur: round2(realized),
        });

        lotsByAsset.set(assetId, lots);
      }

      if (transactionType === 'dividend') {
        const gross = Number(row.dividendGross ?? 0);
        const withholding = Number(row.withholdingTax ?? 0);
        const net = Number(row.dividendNet ?? 0);

        dividendsGrossEur += convertToEur(gross, tradeCurrency, fxRateToEur);
        dividendsWithholdingEur += convertToEur(
          withholding,
          tradeCurrency,
          fxRateToEur,
        );
        dividendsNetEur += convertToEur(net, tradeCurrency, fxRateToEur);
      }
    }

    return {
      year,
      realizedGainLossEur: round2(realizedGainLossEur),
      dividendsGrossEur: round2(dividendsGrossEur),
      dividendsWithholdingEur: round2(dividendsWithholdingEur),
      dividendsNetEur: round2(dividendsNetEur),
      operations: {
        sells: realizedRows.length,
        detailedRows: realizedRows,
      },
    };
  });

  app.get('/finances/assets', async ({ query }) => {
    const type = query.type as string | undefined;
    const activeRaw = query.active as string | boolean | undefined;
    const active =
      activeRaw === undefined
        ? true
        : String(activeRaw).toLowerCase() === 'true';
    return listAssetViews(type ? { type, active } : { active });
  });

  app.post('/finances/assets', async ({ body, set }) => {
    const parsed = createAssetInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid asset payload',
        parsed.error.format(),
      );
    }

    const normalizedSymbol = parsed.data.symbol?.trim().toUpperCase();
    const normalizedSubtype = parsed.data.subtype?.trim();
    const normalizedNotes = parsed.data.notes?.trim();
    const normalizedTicker = parsed.data.ticker.trim().toUpperCase();
    const normalizedIsin = (
      parsed.data.isin?.trim().toUpperCase() ?? fallbackIsin(normalizedTicker)
    ).slice(0, 12);

    if (requiredIsinForType.has(parsed.data.assetType) && !parsed.data.isin) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'ISIN is required for this asset type',
      );
    }

    const [assetRow] = await withTimedDb('create_asset', async () => {
      return db
        .insert(assets)
        .values({
          name: parsed.data.name,
          assetType: parsed.data.assetType,
          subtype: normalizedSubtype || null,
          symbol: normalizedSymbol || null,
          ticker: normalizedTicker,
          isin: normalizedIsin,
          exchange: parsed.data.exchange?.trim().toUpperCase() || null,
          providerSymbol:
            parsed.data.providerSymbol?.trim().toUpperCase() || null,
          currency: parsed.data.currency.toUpperCase(),
          notes: normalizedNotes || null,
        })
        .returning();
    });
    if (!assetRow) {
      throw new ApiHttpError(500, 'INTERNAL_ERROR', 'Failed to create asset');
    }

    await withTimedDb('create_asset_position', async () => {
      return db.insert(assetPositions).values({
        assetId: assetRow.id,
        quantity: parsed.data.quantity.toString(),
        averageCost:
          parsed.data.averageCost === undefined
            ? null
            : parsed.data.averageCost.toString(),
        manualPrice:
          parsed.data.manualPrice === undefined
            ? null
            : parsed.data.manualPrice.toString(),
        manualPriceAsOf: parsed.data.manualPriceAsOf
          ? new Date(parsed.data.manualPriceAsOf)
          : null,
      });
    });

    const [created] = await listAssetViews().then((rows) =>
      rows.filter((row) => row.id === assetRow.id),
    );

    set.status = 201;
    return created;
  });

  app.patch('/finances/assets/:id', async ({ params, body }) => {
    const parsed = updateAssetInputSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid asset update payload',
        parsed.success ? undefined : parsed.error.format(),
      );
    }

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) values.name = parsed.data.name;
    if (parsed.data.assetType !== undefined)
      values.assetType = parsed.data.assetType;
    if (parsed.data.subtype !== undefined) {
      values.subtype = parsed.data.subtype ? parsed.data.subtype.trim() : null;
    }
    if (parsed.data.symbol !== undefined) {
      values.symbol = parsed.data.symbol
        ? parsed.data.symbol.trim().toUpperCase()
        : null;
    }
    if (parsed.data.ticker !== undefined) {
      values.ticker = parsed.data.ticker.trim().toUpperCase();
    }
    if (parsed.data.isin !== undefined) {
      values.isin = parsed.data.isin
        ? parsed.data.isin.trim().toUpperCase()
        : null;
    }
    if (parsed.data.exchange !== undefined) {
      values.exchange = parsed.data.exchange
        ? parsed.data.exchange.trim().toUpperCase()
        : null;
    }
    if (parsed.data.providerSymbol !== undefined) {
      values.providerSymbol = parsed.data.providerSymbol
        ? parsed.data.providerSymbol.trim().toUpperCase()
        : null;
    }
    if (parsed.data.currency !== undefined) {
      values.currency = parsed.data.currency.toUpperCase();
    }
    if (parsed.data.notes !== undefined) {
      values.notes = parsed.data.notes ? parsed.data.notes.trim() : null;
    }
    if (parsed.data.isActive !== undefined)
      values.isActive = parsed.data.isActive;

    const rows = await withTimedDb('update_asset', async () => {
      return db
        .update(assets)
        .set(values)
        .where(eq(assets.id, params.id))
        .returning();
    });

    if (rows.length === 0) {
      throw new ApiHttpError(404, 'ASSET_NOT_FOUND', 'Asset does not exist');
    }

    const [updated] = await listAssetViews().then((rows) =>
      rows.filter((row) => row.id === params.id),
    );
    return updated;
  });

  app.put('/finances/assets/:id/position', async ({ params, body }) => {
    const parsed = upsertAssetPositionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid asset position payload',
        parsed.error.format(),
      );
    }

    const [assetRow] = await withTimedDb('asset_exists', async () => {
      return db
        .select({ id: assets.id })
        .from(assets)
        .where(eq(assets.id, params.id));
    });

    if (!assetRow) {
      throw new ApiHttpError(404, 'ASSET_NOT_FOUND', 'Asset does not exist');
    }

    const [existing] = await withTimedDb('get_asset_position', async () => {
      return db
        .select()
        .from(assetPositions)
        .where(eq(assetPositions.assetId, params.id));
    });

    const baseValues = {
      quantity: parsed.data.quantity.toString(),
      averageCost:
        parsed.data.averageCost === undefined ||
        parsed.data.averageCost === null
          ? null
          : parsed.data.averageCost.toString(),
      manualPrice:
        parsed.data.manualPrice === undefined ||
        parsed.data.manualPrice === null
          ? null
          : parsed.data.manualPrice.toString(),
      manualPriceAsOf:
        parsed.data.manualPriceAsOf === undefined ||
        parsed.data.manualPriceAsOf === null
          ? null
          : new Date(parsed.data.manualPriceAsOf),
      updatedAt: new Date(),
    };

    if (!existing) {
      await withTimedDb('insert_asset_position', async () => {
        return db
          .insert(assetPositions)
          .values({
            assetId: params.id,
            ...baseValues,
          })
          .returning();
      });
    } else {
      await withTimedDb('update_asset_position', async () => {
        return db
          .update(assetPositions)
          .set(baseValues)
          .where(eq(assetPositions.assetId, params.id))
          .returning();
      });
    }

    const [updated] = await listAssetViews().then((rows) =>
      rows.filter((row) => row.id === params.id),
    );
    return updated;
  });

  app.delete('/finances/assets/:id', async ({ params, set }) => {
    const rows = await withTimedDb('deactivate_asset', async () => {
      return db
        .update(assets)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(assets.id, params.id))
        .returning({ id: assets.id });
    });
    if (rows.length === 0) {
      throw new ApiHttpError(404, 'ASSET_NOT_FOUND', 'Asset does not exist');
    }
    set.status = 204;
    return;
  });

  app.get('/finances/portfolio/summary', async () => {
    const [cashFromAccounts] = await withTimedDb(
      'portfolio_cash_summary_accounts',
      async () => {
        return db.execute(sql`
          select
            coalesce(sum(a.opening_balance_eur), 0)::numeric +
            coalesce(sum(at.cash_impact_eur), 0)::numeric as cash_balance
          from finances.accounts a
          left join finances.asset_transactions at on at.account_id = a.id
        `);
      },
    );

    const assetViews = await listAssetViews({ active: true });
    const pricedAssets = assetViews.filter(
      (asset) =>
        asset.currentValue !== null && asset.currentValue !== undefined,
    );
    const assetValue = pricedAssets.reduce(
      (sum, asset) => sum + Number(asset.currentValue ?? 0),
      0,
    );
    const cashBalance = Number(cashFromAccounts?.cash_balance ?? 0);
    const netWorth = Number((cashBalance + assetValue).toFixed(2));

    const totalsByType = new Map<AssetType, number>();
    for (const asset of pricedAssets) {
      const current = totalsByType.get(asset.assetType as AssetType) ?? 0;
      totalsByType.set(
        asset.assetType as AssetType,
        current + Number(asset.currentValue ?? 0),
      );
    }

    const allocationByType = [...totalsByType.entries()]
      .map(([assetType, value]) => ({
        assetType,
        value: Number(value.toFixed(2)),
        percent:
          assetValue === 0
            ? 0
            : Number(((value / assetValue) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);

    return {
      cashBalance: Number(cashBalance.toFixed(2)),
      assetValue: Number(assetValue.toFixed(2)),
      netWorth,
      assetCount: assetViews.filter((asset) => asset.isActive).length,
      allocationByType,
    };
  });

  app.get('/finances/markets/latest', async ({ query }) => {
    const limitRaw = Number(query.limit ?? 30);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(500, Math.floor(limitRaw)))
      : 30;

    const rows = await withTimedDb('markets_latest', async () => {
      return db.execute(sql`
        with latest as (
          select distinct on (symbol)
            symbol,
            price,
            priced_at,
            source
          from finances.price_history
          order by symbol, priced_at desc
        )
        select
          symbol,
          price,
          priced_at,
          source
        from latest
        order by symbol asc
        limit ${limit}
      `);
    });

    return rows.map((row) => ({
      symbol: String(row.symbol),
      price: Number(row.price),
      pricedAt: toIso(row.priced_at),
      source: String(row.source),
    }));
  });

  app.get(
    '/finances/overview',
    async ({ query }): Promise<FinancesOverviewResponse> => {
      const rangeRaw = String(query.range ?? '1M').toUpperCase();
      if (!OVERVIEW_RANGES.includes(rangeRaw as OverviewRange)) {
        throw new ApiHttpError(
          400,
          'VALIDATION_ERROR',
          `range must be one of ${OVERVIEW_RANGES.join(', ')}`,
        );
      }
      const range = overviewRangeSchema.parse(rangeRaw);

      const accountIdRaw = String(query.accountId ?? 'all');
      if (accountIdRaw !== 'all' && !UUID_RE.test(accountIdRaw)) {
        throw new ApiHttpError(
          400,
          'VALIDATION_ERROR',
          'accountId must be "all" or a valid UUID',
        );
      }

      const accountRows = await withTimedDb('overview_accounts', async () => {
        return db.execute(sql`
          select id, name, opening_balance_eur as "openingBalanceEur"
          from finances.accounts
          order by name asc
        `);
      });

      if (
        accountIdRaw !== 'all' &&
        !accountRows.some((row) => String(row.id) === accountIdRaw)
      ) {
        throw new ApiHttpError(404, 'ACCOUNT_NOT_FOUND', 'Account does not exist');
      }

      const selectedAccountId = accountIdRaw;
      const filteredAccountRows =
        selectedAccountId === 'all'
          ? accountRows
          : accountRows.filter((row) => String(row.id) === selectedAccountId);
      const openingCash = filteredAccountRows.reduce(
        (sum, row) => sum + Number(row.openingBalanceEur ?? 0),
        0,
      );

      const txRows = await withTimedDb('overview_transactions', async () => {
        if (selectedAccountId === 'all') {
          return db.execute(sql`
            select
              at.account_id as "accountId",
              at.asset_id as "assetId",
              at.transaction_type as "transactionType",
              at.traded_at as "tradedAt",
              at.quantity,
              at.unit_price as "unitPrice",
              at.cash_impact_eur as "cashImpactEur",
              a.name as "assetName",
              coalesce(a.symbol, a.ticker) as symbol
            from finances.asset_transactions at
            inner join finances.assets a on a.id = at.asset_id
            order by at.traded_at asc
          `);
        }
        return db.execute(sql`
          select
            at.account_id as "accountId",
            at.asset_id as "assetId",
            at.transaction_type as "transactionType",
            at.traded_at as "tradedAt",
            at.quantity,
            at.unit_price as "unitPrice",
            at.cash_impact_eur as "cashImpactEur",
            a.name as "assetName",
            coalesce(a.symbol, a.ticker) as symbol
          from finances.asset_transactions at
          inner join finances.assets a on a.id = at.asset_id
          where at.account_id = ${selectedAccountId}
          order by at.traded_at asc
        `);
      });

      const assetRows = await withTimedDb('overview_assets', async () => {
        return db.execute(sql`
          select
            a.id as "assetId",
            a.name as "assetName",
            coalesce(a.symbol, a.ticker) as symbol,
            ap.manual_price as "manualPrice"
          from finances.assets a
          left join finances.asset_positions ap on ap.asset_id = a.id
          where a.is_active = true
          order by a.name asc
        `);
      });

      const symbolSet = new Set<string>();
      for (const row of txRows) {
        if (row.symbol) {
          symbolSet.add(String(row.symbol));
        }
      }
      for (const row of assetRows) {
        if (row.symbol) {
          symbolSet.add(String(row.symbol));
        }
      }

      const allPriceRows = await withTimedDb('overview_prices', async () => {
        return db.execute(sql`
          select symbol, priced_at as "pricedAt", price
          from finances.price_history
          order by priced_at asc
        `);
      });

      const relevantPrices = allPriceRows
        .filter((row) => symbolSet.has(String(row.symbol)))
        .map((row) => ({
          symbol: String(row.symbol),
          pricedAtMs: new Date(String(row.pricedAt)).getTime(),
          price: Number(row.price),
        }))
        .filter((row) => Number.isFinite(row.pricedAtMs) && row.price > 0);

      const pricesBySymbol = new Map<
        string,
        Array<{ pricedAtMs: number; price: number }>
      >();
      for (const row of relevantPrices) {
        const list = pricesBySymbol.get(row.symbol) ?? [];
        list.push({ pricedAtMs: row.pricedAtMs, price: row.price });
        pricesBySymbol.set(row.symbol, list);
      }
      for (const list of pricesBySymbol.values()) {
        list.sort((a, b) => a.pricedAtMs - b.pricedAtMs);
      }

      const tx = txRows.map((row) => ({
        accountId: String(row.accountId),
        assetId: String(row.assetId),
        symbol: String(row.symbol),
        assetName: String(row.assetName),
        transactionType: String(row.transactionType),
        tradedAtMs: new Date(String(row.tradedAt)).getTime(),
        quantity: Number(row.quantity ?? 0),
        unitPrice: Number(row.unitPrice ?? 0),
        cashImpactEur: Number(row.cashImpactEur ?? 0),
      }));

      const assetMetaById = new Map<
        string,
        { symbol: string; name: string; manualPrice: number | null }
      >();
      for (const row of assetRows) {
        assetMetaById.set(String(row.assetId), {
          symbol: String(row.symbol),
          name: String(row.assetName),
          manualPrice:
            row.manualPrice === null || row.manualPrice === undefined
              ? null
              : Number(row.manualPrice),
        });
      }

      const txTimestamps = tx
        .map((row) => row.tradedAtMs)
        .filter((value) => Number.isFinite(value));
      const priceTimestamps = relevantPrices.map((row) => row.pricedAtMs);
      const allTimestamps = [...txTimestamps, ...priceTimestamps].sort(
        (a, b) => a - b,
      );
      const minTimestampMs = allTimestamps[0] ?? null;
      const now = new Date();
      const rangeStart = clampRangeStart(range, now, minTimestampMs);
      const rangeStartMs = rangeStart.getTime();

      const latestPriceAt = Math.max(...priceTimestamps, Number.NaN);
      const hasPriceData = Number.isFinite(latestPriceAt);
      const asOfMs = hasPriceData ? latestPriceAt : now.getTime();

      const distinctPriceTimes = [...new Set(priceTimestamps)].sort((a, b) => a - b);
      const previousAsOfMs: number | null =
        distinctPriceTimes.length > 1
          ? (distinctPriceTimes[distinctPriceTimes.length - 2] ?? null)
          : null;

      const priceAtOrBefore = (symbol: string, tsMs: number): number | null => {
        const list = pricesBySymbol.get(symbol);
        if (!list || list.length === 0) return null;
        let value: number | null = null;
        for (const point of list) {
          if (point.pricedAtMs <= tsMs) {
            value = point.price;
          } else {
            break;
          }
        }
        if (value !== null) return value;
        const firstAfter = list.find((point) => point.pricedAtMs > tsMs);
        return firstAfter?.price ?? null;
      };

      const quantityByAssetAt = (tsMs: number) => {
        const quantities = new Map<string, number>();
        for (const row of tx) {
          if (row.tradedAtMs > tsMs) continue;
          const direction =
            row.transactionType === 'sell'
              ? -1
              : row.transactionType === 'buy'
                ? 1
                : 0;
          if (direction === 0) continue;
          const current = quantities.get(row.assetId) ?? 0;
          quantities.set(row.assetId, current + direction * row.quantity);
        }
        return quantities;
      };

      const cashAt = (tsMs: number) => {
        let value = openingCash;
        for (const row of tx) {
          if (row.tradedAtMs <= tsMs) {
            value += row.cashImpactEur;
          }
        }
        return value;
      };

      const portfolioTotalAt = (tsMs: number, fallbackToCurrentPrice: boolean) => {
        const quantities = quantityByAssetAt(tsMs);
        let total = cashAt(tsMs);
        for (const [assetId, quantity] of quantities.entries()) {
          if (quantity <= 0) continue;
          const meta = assetMetaById.get(assetId);
          if (!meta) continue;
          let unitPrice = priceAtOrBefore(meta.symbol, tsMs);
          if (
            unitPrice === null &&
            fallbackToCurrentPrice &&
            meta.manualPrice !== null
          ) {
            unitPrice = meta.manualPrice;
          }
          if (unitPrice !== null) {
            total += quantity * unitPrice;
          }
        }
        return round2(total);
      };

      const totalValue = portfolioTotalAt(asOfMs, true);
      const previousTotalValue =
        previousAsOfMs === null ? totalValue : portfolioTotalAt(previousAsOfMs, true);
      const deltaValue = round2(totalValue - previousTotalValue);
      const deltaPct =
        previousTotalValue === 0
          ? 0
          : round2((deltaValue / previousTotalValue) * 100);

      const rangePointTimes = [
        ...new Set(
          distinctPriceTimes.filter((ts) => ts >= rangeStartMs && ts <= asOfMs),
        ),
      ].sort((a, b) => a - b);
      if (rangePointTimes.length === 0) {
        rangePointTimes.push(asOfMs);
      } else if (rangePointTimes[rangePointTimes.length - 1] !== asOfMs) {
        rangePointTimes.push(asOfMs);
      }

      const series = rangePointTimes.map((tsMs) => ({
        tsIso: new Date(tsMs).toISOString(),
        value: portfolioTotalAt(tsMs, true),
      }));

      const currentQuantities = quantityByAssetAt(asOfMs);
      const buyStatsByAsset = new Map<string, { qty: number; total: number }>();
      for (const row of tx) {
        if (row.transactionType !== 'buy') continue;
        const current = buyStatsByAsset.get(row.assetId) ?? { qty: 0, total: 0 };
        const rowTotal = Math.abs(row.cashImpactEur);
        buyStatsByAsset.set(row.assetId, {
          qty: current.qty + row.quantity,
          total: current.total + rowTotal,
        });
      }

      const positions = [...currentQuantities.entries()]
        .filter(([, quantity]) => quantity > 0)
        .map(([assetId, quantity]) => {
          const meta = assetMetaById.get(assetId);
          if (!meta) {
            return null;
          }
          const buyStats = buyStatsByAsset.get(assetId) ?? { qty: 0, total: 0 };
          const avgBuyUnitEur =
            buyStats.qty > 0 ? round6(buyStats.total / buyStats.qty) : null;
          const avgBuyTotalEur =
            avgBuyUnitEur === null ? null : round2(avgBuyUnitEur * quantity);

          const currentUnit =
            priceAtOrBefore(meta.symbol, asOfMs) ??
            meta.manualPrice ??
            avgBuyUnitEur ??
            0;
          const startUnit =
            priceAtOrBefore(meta.symbol, rangeStartMs) ?? currentUnit;

          const currentTotal = round2(quantity * currentUnit);
          const periodPnlValueEur = round2(quantity * (currentUnit - startUnit));
          const periodPnlPct =
            startUnit <= 0
              ? 0
              : round2(((currentUnit - startUnit) / startUnit) * 100);

          return {
            assetId,
            symbol: meta.symbol,
            name: meta.name,
            quantity: round6(quantity),
            avgBuyUnitEur: avgBuyUnitEur === null ? null : round6(avgBuyUnitEur),
            avgBuyTotalEur,
            currentUnitEur: round6(currentUnit),
            currentTotalEur: currentTotal,
            periodPnlValueEur,
            periodPnlPct,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => b.currentTotalEur - a.currentTotalEur);

      return {
        range,
        rangeStartIso: rangeStart.toISOString(),
        accountId: selectedAccountId,
        asOfIso: new Date(asOfMs).toISOString(),
        previousAsOfIso:
          previousAsOfMs === null ? null : new Date(previousAsOfMs).toISOString(),
        totalValue,
        deltaValue,
        deltaPct,
        accounts: accountRows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
        })),
        series,
        positions,
      };
    },
  );

  app.get('/finances/summary', async () => {
    const [result] = await withTimedDb('finances_summary', async () => {
      return db.execute(sql`
        with account_cash as (
          select
            coalesce(sum(a.opening_balance_eur), 0)::numeric +
            coalesce(sum(at.cash_impact_eur), 0)::numeric as total_balance
          from finances.accounts a
          left join finances.asset_transactions at on at.account_id = a.id
        ),
        tx as (
          select
            coalesce(sum(case when cash_impact_eur > 0 and traded_at >= date_trunc('month', now()) then cash_impact_eur else 0 end), 0)::numeric as monthly_inflow,
            coalesce(sum(case when cash_impact_eur < 0 and traded_at >= date_trunc('month', now()) then cash_impact_eur else 0 end), 0)::numeric as monthly_outflow,
            count(*)::int as transaction_count
          from finances.asset_transactions
        ),
        ac as (
          select count(*)::int as account_count
          from finances.accounts
        )
        select
          account_cash.total_balance,
          tx.monthly_inflow,
          tx.monthly_outflow,
          tx.transaction_count,
          ac.account_count
        from account_cash, tx, ac
      `);
    });
    const safeResult = result ?? {
      total_balance: 0,
      account_count: 0,
      transaction_count: 0,
      monthly_inflow: 0,
      monthly_outflow: 0,
    };

    return {
      totalBalance: Number(safeResult.total_balance ?? 0),
      accountCount: Number(safeResult.account_count ?? 0),
      transactionCount: Number(safeResult.transaction_count ?? 0),
      monthlyInflow: Number(safeResult.monthly_inflow ?? 0),
      monthlyOutflow: Number(safeResult.monthly_outflow ?? 0),
    };
  });
};
