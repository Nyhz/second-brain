import {
  accounts,
  accountCashMovements,
  and,
  assetPositions,
  assetTransactions,
  assets,
  createDbClient,
  desc,
  eq,
  sql,
  transactionImportRows,
  transactionImports,
} from '@second-brain/db';
import {
  type Asset,
  type AssetPosition,
  type AssetTransaction,
  type AssetType,
  type DegiroAccountStatementAnalyzeResult,
  type DegiroAccountStatementImportResult,
  type CreateAssetTransactionInput,
  type DegiroImportResult,
  type FinancesOverviewResponse,
  type UnifiedTransactionRow,
  type OverviewRange,
  createAssetInputSchema,
  createAssetTransactionInputSchema,
  degiroAccountStatementAnalyzeRequestSchema,
  degiroAccountStatementImportRequestSchema,
  createAccountInputSchema,
  degiroImportRequestSchema,
  overviewRangeSchema,
  updateAssetInputSchema,
  upsertAssetPositionInputSchema,
} from '@second-brain/types';
import type { Elysia } from 'elysia';
import { withTimedDb } from '../../lib/db-timed';
import { ApiHttpError } from '../../lib/errors';
import {
  getDegiroAssetType,
  getDegiroTicker,
  parseDegiroTransactionsCsv,
} from './degiro-import';
import {
  type DegiroAccountStatementRow,
  type DegiroAccountStatementRowType,
  getDegiroStatementAssetType,
  getDegiroStatementTicker,
  parseDegiroAccountStatementCsv,
} from './degiro-account-statement';

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
  linkedTransactionId:
    row.linkedTransactionId === null || row.linkedTransactionId === undefined
      ? null
      : String(row.linkedTransactionId),
  externalReference:
    row.externalReference === null || row.externalReference === undefined
      ? null
      : String(row.externalReference),
  rowFingerprint:
    row.rowFingerprint === null || row.rowFingerprint === undefined
      ? null
      : String(row.rowFingerprint),
  source:
    row.source === null || row.source === undefined ? null : String(row.source),
  notes:
    row.notes === null || row.notes === undefined ? null : String(row.notes),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const round2 = (value: number) => Number(value.toFixed(2));
const EURUSD_FX_SYMBOL = 'EURUSD=X';

const OVERVIEW_RANGES: OverviewRange[] = ['1W', '1M', 'YTD', '1Y', 'MAX'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const round6 = (value: number) => Number(value.toFixed(6));
const DEGIRO_ACCOUNT_STATEMENT_SOURCE = 'degiro_account_statement';
const DEGIRO_TRANSACTIONS_SOURCE = 'degiro';

type ImportMovementTable = 'asset_transaction' | 'cash_movement';

type StatementImportRowResult = {
  rowNumber: number;
  rowType: string;
  rowFingerprint: string | null;
  status: 'imported' | 'skipped' | 'failed';
  reason: string | null;
  externalReference: string | null;
  assetId: string | null;
  transactionId: string | null;
  movementTable: ImportMovementTable | null;
  movementId: string | null;
};

const sha256Hex = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

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
  if (range === '1W') {
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
      const assetRows = rows.map((row) => {
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

        return {
          row,
          asset,
          position,
          symbolToPrice:
            asset.providerSymbol ?? asset.symbol ?? asset.ticker ?? null,
        };
      });

      const uniqueSymbols = [
        ...new Set(
          assetRows
            .map((item) => item.symbolToPrice)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const uniqueAssetIds = [
        ...new Set(assetRows.map((item) => item.asset.id).filter(Boolean)),
      ];

      const latestPriceBySymbol = new Map<
        string,
        { price: number; pricedAt: string }
      >();
      if (uniqueSymbols.length > 0) {
        const latestPriceRows = await db.execute(sql`
          with latest as (
            select distinct on (symbol)
              symbol,
              price,
              priced_at
            from finances.price_history
            where symbol in (${sql.join(
              uniqueSymbols.map((symbol) => sql`${symbol}`),
              sql`, `,
            )})
            order by symbol, priced_at desc
          )
          select
            symbol,
            price,
            priced_at as "pricedAt"
          from latest
        `);

        for (const priceRow of latestPriceRows) {
          const symbol = String(priceRow.symbol);
          const price = Number(priceRow.price ?? 0);
          if (!Number.isFinite(price) || price <= 0) {
            continue;
          }
          latestPriceBySymbol.set(symbol, {
            price,
            pricedAt: toIso(priceRow.pricedAt),
          });
        }
      }

      const [marketFxRow] = await db.execute(sql`
        select price
        from finances.price_history
        where symbol = ${EURUSD_FX_SYMBOL}
          and (source = 'yahoo_fx' or source = 'yahoo')
        order by priced_at desc
        limit 1
      `);
      const eurusd = Number(marketFxRow?.price ?? 0);
      const marketUsdToEur =
        Number.isFinite(eurusd) && eurusd > 0 ? 1 / eurusd : null;

      const latestTxFxByAssetCurrency = new Map<string, number>();
      if (uniqueAssetIds.length > 0) {
        const latestFxRows = await db.execute(sql`
          with latest_fx as (
            select distinct on (asset_id, trade_currency)
              asset_id as "assetId",
              trade_currency as "tradeCurrency",
              fx_rate_to_eur as "fxRateToEur"
            from finances.asset_transactions
            where asset_id in (${sql.join(
              uniqueAssetIds.map((assetId) => sql`${assetId}`),
              sql`, `,
            )})
              and fx_rate_to_eur is not null
            order by asset_id, trade_currency, traded_at desc
          )
          select
            "assetId",
            "tradeCurrency",
            "fxRateToEur"
          from latest_fx
        `);

        for (const fxRow of latestFxRows) {
          const assetId = String(fxRow.assetId);
          const tradeCurrency = normalizeCurrency(String(fxRow.tradeCurrency));
          const fxRate = Number(fxRow.fxRateToEur ?? 0);
          if (!Number.isFinite(fxRate) || fxRate <= 0) {
            continue;
          }
          latestTxFxByAssetCurrency.set(`${assetId}:${tradeCurrency}`, fxRate);
        }
      }

      const views = [];
      for (const item of assetRows) {
        const { asset, position, symbolToPrice } = item;
        let resolvedUnitPrice: number | null = null;
        let resolvedPriceSource: 'manual' | 'market' | null = null;
        let resolvedPriceAsOf: string | null = null;

        if (symbolToPrice) {
          const latestPrice = latestPriceBySymbol.get(symbolToPrice);
          if (latestPrice) {
            resolvedUnitPrice = latestPrice.price;
            resolvedPriceSource = 'market';
            resolvedPriceAsOf = latestPrice.pricedAt;
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

        let valuationFxRateToEur: number;
        if (asset.currency === 'EUR') {
          valuationFxRateToEur = 1;
        } else if (asset.currency === 'USD' && marketUsdToEur !== null) {
          valuationFxRateToEur = marketUsdToEur;
        } else {
          const fallbackFx =
            latestTxFxByAssetCurrency.get(`${asset.id}:${asset.currency}`) ?? 1;
          valuationFxRateToEur = fallbackFx > 0 ? fallbackFx : 1;
        }

        const currentValue =
          position && resolvedUnitPrice !== null
            ? Number(
                (
                  position.quantity *
                  resolvedUnitPrice *
                  valuationFxRateToEur
                ).toFixed(2),
              )
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
          (
            a.opening_balance_eur +
            coalesce(at_sum.asset_cash_impact_eur, 0) +
            coalesce(acm_sum.cash_movement_impact_eur, 0)
          )::numeric as "currentCashBalanceEur"
        from finances.accounts a
        left join (
          select
            account_id,
            coalesce(sum(cash_impact_eur), 0)::numeric as asset_cash_impact_eur
          from finances.asset_transactions
          group by account_id
        ) at_sum on at_sum.account_id = a.id
        left join (
          select
            account_id,
            coalesce(sum(cash_impact_eur), 0)::numeric as cash_movement_impact_eur
          from finances.account_cash_movements
          where affects_cash_balance = true
          group by account_id
        ) acm_sum on acm_sum.account_id = a.id
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
          (
            a.opening_balance_eur +
            coalesce(at_sum.asset_cash_impact_eur, 0) +
            coalesce(acm_sum.cash_movement_impact_eur, 0)
          )::numeric as cash_balance
        from finances.accounts a
        left join (
          select
            account_id,
            coalesce(sum(cash_impact_eur), 0)::numeric as asset_cash_impact_eur
          from finances.asset_transactions
          where account_id = ${accountId}
          group by account_id
        ) at_sum on at_sum.account_id = a.id
        left join (
          select
            account_id,
            coalesce(sum(cash_impact_eur), 0)::numeric as cash_movement_impact_eur
          from finances.account_cash_movements
          where account_id = ${accountId}
            and affects_cash_balance = true
          group by account_id
        ) acm_sum on acm_sum.account_id = a.id
        where a.id = ${accountId}
      `);
    });

    if (!row) {
      return null;
    }

    return Number(row.cash_balance ?? 0);
  };

  const createAssetTransactionRecord = async (
    input: CreateAssetTransactionInput,
    options?: {
      cashImpactEurOverride?: number;
      linkedTransactionId?: string | null;
      rowFingerprint?: string | null;
      source?: string | null;
      skipCashBalanceValidation?: boolean;
    },
  ) => {
    const tradeCurrency = normalizeCurrency(input.tradeCurrency);
    const feesCurrency = normalizeCurrency(
      input.feesCurrency ?? input.tradeCurrency,
    );

    const [accountRow] = await withTimedDb(
      'asset_tx_account_exists',
      async () => {
        return db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.id, input.accountId));
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
        .where(eq(assets.id, input.assetId));
    });
    if (!assetRow) {
      throw new ApiHttpError(404, 'ASSET_NOT_FOUND', 'Asset does not exist');
    }
    if (assetRow.assetType !== input.assetType) {
      throw new ApiHttpError(
        400,
        'ASSET_TYPE_MISMATCH',
        'Selected asset does not match selected asset type',
      );
    }

    const tradedAmount = input.quantity * input.unitPrice;
    const tradedAmountEur = convertToEur(
      tradedAmount,
      tradeCurrency,
      input.fxRateToEur ?? null,
    );
    const feesAmountEur = convertToEur(
      input.feesAmount,
      feesCurrency,
      input.fxRateToEur ?? null,
    );

    let cashImpactEur =
      options?.cashImpactEurOverride === undefined
        ? 0
        : options.cashImpactEurOverride;
    if (options?.cashImpactEurOverride === undefined) {
      if (input.transactionType === 'buy') {
        cashImpactEur = -(tradedAmountEur + feesAmountEur);
      } else if (input.transactionType === 'sell') {
        cashImpactEur = tradedAmountEur - feesAmountEur;
      } else if (input.transactionType === 'fee') {
        cashImpactEur = -feesAmountEur;
      } else {
        const dividendNet = input.dividendNet ?? 0;
        cashImpactEur = convertToEur(
          dividendNet,
          tradeCurrency,
          input.fxRateToEur ?? null,
        );
      }
    }

    if (input.transactionType === 'sell') {
      const [holdingRow] = await withTimedDb('asset_tx_holdings', async () => {
        return db.execute(sql`
          select
            coalesce(sum(case
              when transaction_type = 'buy' then quantity
              when transaction_type = 'sell' then -quantity
              else 0
            end), 0)::numeric as quantity
          from finances.asset_transactions
          where account_id = ${input.accountId}
            and asset_id = ${input.assetId}
        `);
      });

      const availableQuantity = Number(holdingRow?.quantity ?? 0);
      if (availableQuantity < input.quantity) {
        throw new ApiHttpError(
          400,
          'INSUFFICIENT_ASSET_QUANTITY',
          `Not enough holdings to sell. Available: ${availableQuantity}`,
        );
      }
    }

    if (!options?.skipCashBalanceValidation) {
      const currentCash = await getAccountCashBalance(input.accountId);
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
    }

    const rows = await withTimedDb('create_asset_transaction', async () => {
      return db
        .insert(assetTransactions)
        .values({
          accountId: input.accountId,
          assetId: input.assetId,
          transactionType: input.transactionType,
          tradedAt: new Date(input.tradedAt),
          quantity: input.quantity.toString(),
          unitPrice: input.unitPrice.toString(),
          tradeCurrency,
          fxRateToEur:
            input.fxRateToEur === undefined || input.fxRateToEur === null
              ? null
              : input.fxRateToEur.toString(),
          cashImpactEur: round2(cashImpactEur).toString(),
          feesAmount: input.feesAmount.toString(),
          feesCurrency: input.feesAmount > 0 ? feesCurrency : null,
          dividendGross:
            input.dividendGross === undefined || input.dividendGross === null
              ? null
              : input.dividendGross.toString(),
          withholdingTax:
            input.withholdingTax === undefined || input.withholdingTax === null
              ? null
              : input.withholdingTax.toString(),
          dividendNet:
            input.dividendNet === undefined || input.dividendNet === null
              ? null
              : input.dividendNet.toString(),
          linkedTransactionId: options?.linkedTransactionId ?? null,
          externalReference: input.externalReference ?? null,
          rowFingerprint: options?.rowFingerprint ?? null,
          source: options?.source ?? 'manual',
          notes: input.notes ?? null,
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

    return serializeAssetTransaction({
      ...(rows[0] as Record<string, unknown>),
      assetType: input.assetType,
    });
  };

  const statementAssetRowTypes = new Set<DegiroAccountStatementRowType>([
    'buy',
    'sell',
    'trade_fee',
    'asset_fee',
    'dividend_gross',
    'dividend_withholding',
  ]);

  const statementAffectsCash = (rowType: DegiroAccountStatementRowType) => {
    if (
      rowType === 'cash_sweep_internal' ||
      rowType === 'fx_internal_credit' ||
      rowType === 'fx_internal_debit'
    ) {
      return false;
    }
    if (rowType === 'informational') {
      return false;
    }
    return true;
  };

  const statementCashMovementType = (rowType: DegiroAccountStatementRowType) => {
    if (rowType === 'deposit') return 'deposit';
    if (rowType === 'connectivity_fee') return 'connectivity_fee';
    if (rowType === 'interest') return 'interest';
    if (rowType === 'generic_credit') return 'credit';
    if (rowType === 'fx_internal_credit') return 'fx_internal_credit';
    if (rowType === 'fx_internal_debit') return 'fx_internal_debit';
    if (rowType === 'cash_sweep_internal') return 'cash_sweep_internal';
    return 'other';
  };

  const buildOrderFxRateResolver = (rows: DegiroAccountStatementRow[]) => {
    const byOrder = new Map<string, DegiroAccountStatementRow[]>();
    for (const row of rows) {
      if (!row.orderId) continue;
      const list = byOrder.get(row.orderId) ?? [];
      list.push(row);
      byOrder.set(row.orderId, list);
    }

    const cache = new Map<string, number | null>();
    const fxRows = rows.filter(
      (candidate) =>
        (candidate.rowType === 'fx_internal_credit' ||
          candidate.rowType === 'fx_internal_debit') &&
        candidate.fxRaw !== null &&
        candidate.fxRaw > 0 &&
        candidate.occurredAtIso !== null,
    );

    const resolve = (
      row: DegiroAccountStatementRow,
      currency: string,
    ): number | null => {
      const normalizedCurrency = normalizeCurrency(currency);
      if (normalizedCurrency === 'EUR') {
        return null;
      }
      const cacheKey = `${row.orderId ?? 'none'}:${normalizedCurrency}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey) ?? null;
      }

      const orderRows = row.orderId ? byOrder.get(row.orderId) ?? [] : [];
      const eurRow = orderRows.find(
        (candidate) =>
          normalizeCurrency(candidate.changeCurrency ?? '') === 'EUR' &&
          candidate.changeAmount !== null &&
          candidate.changeAmount !== 0,
      );
      const nativeRow = orderRows.find(
        (candidate) =>
          normalizeCurrency(candidate.changeCurrency ?? '') ===
            normalizedCurrency &&
          candidate.changeAmount !== null &&
          candidate.changeAmount !== 0,
      );
      if (eurRow && nativeRow) {
        const rate = Math.abs(eurRow.changeAmount! / nativeRow.changeAmount!);
        cache.set(cacheKey, rate);
        return rate;
      }

      const fxRow = orderRows.find(
        (candidate) => candidate.fxRaw !== null && candidate.fxRaw > 0,
      );
      if (fxRow?.fxRaw && fxRow.fxRaw > 0) {
        const rate = 1 / fxRow.fxRaw;
        cache.set(cacheKey, rate);
        return rate;
      }

      if (row.fxRaw && row.fxRaw > 0) {
        const rate = 1 / row.fxRaw;
        cache.set(cacheKey, rate);
        return rate;
      }

      if (row.occurredAtIso) {
        const targetTs = new Date(row.occurredAtIso).getTime();
        const targetAbsAmount = Math.abs(row.changeAmount ?? 0);
        const normalizedCandidates = fxRows.filter(
          (candidate) =>
            normalizeCurrency(candidate.changeCurrency ?? '') ===
            normalizedCurrency,
        );
        normalizedCandidates.sort((a, b) => {
          const aTs = a.occurredAtIso
            ? new Date(a.occurredAtIso).getTime()
            : Number.MAX_SAFE_INTEGER;
          const bTs = b.occurredAtIso
            ? new Date(b.occurredAtIso).getTime()
            : Number.MAX_SAFE_INTEGER;
          const aAmountGap =
            targetAbsAmount > 0
              ? Math.abs(Math.abs(a.changeAmount ?? 0) - targetAbsAmount)
              : 0;
          const bAmountGap =
            targetAbsAmount > 0
              ? Math.abs(Math.abs(b.changeAmount ?? 0) - targetAbsAmount)
              : 0;
          if (aAmountGap !== bAmountGap) {
            return aAmountGap - bAmountGap;
          }
          return Math.abs(aTs - targetTs) - Math.abs(bTs - targetTs);
        });
        const nearest = normalizedCandidates[0];
        if (nearest?.fxRaw && nearest.fxRaw > 0) {
          const rate = 1 / nearest.fxRaw;
          cache.set(cacheKey, rate);
          return rate;
        }
      }

      cache.set(cacheKey, null);
      return null;
    };

    return resolve;
  };

  const convertStatementAmountToEur = (
    amount: number,
    currency: string | null,
    fxRateToEur: number | null,
  ) => {
    const normalizedCurrency = normalizeCurrency(currency ?? 'EUR');
    if (normalizedCurrency === 'EUR') {
      return amount;
    }
    if (!fxRateToEur || fxRateToEur <= 0) {
      return null;
    }
    return amount * fxRateToEur;
  };

  const loadAssetsByIsin = async (isins: string[]) => {
    if (isins.length === 0) {
      return new Map<string, { id: string; assetType: AssetType; name: string }>();
    }
    const rows = await withTimedDb('degiro_statement_assets_by_isin', async () =>
      db.execute(sql`
        select id, isin, asset_type as "assetType", name
        from finances.assets
        where isin in (${sql.join(
          isins.map((isin) => sql`${isin}`),
          sql`, `,
        )})
      `),
    );
    return new Map(
      rows.map((row) => [
        String(row.isin),
        {
          id: String(row.id),
          assetType: String(row.assetType) as AssetType,
          name: String(row.name),
        },
      ]),
    );
  };

  const loadExistingStatementFingerprints = async (accountId: string) => {
    const rows = await withTimedDb(
      'degiro_statement_existing_fingerprints',
      async () =>
        db.execute(sql`
          select row_fingerprint as "rowFingerprint"
          from finances.asset_transactions
          where account_id = ${accountId}
            and source = ${DEGIRO_ACCOUNT_STATEMENT_SOURCE}
            and row_fingerprint is not null
          union
          select row_fingerprint as "rowFingerprint"
          from finances.account_cash_movements
          where account_id = ${accountId}
            and source = ${DEGIRO_ACCOUNT_STATEMENT_SOURCE}
            and row_fingerprint is not null
        `),
    );
    return new Set(rows.map((row) => String(row.rowFingerprint)));
  };

  const createAccountCashMovementRecord = async (input: {
    accountId: string;
    movementType: string;
    occurredAt: string;
    valueDate: string | null;
    nativeAmount: number;
    currency: string;
    fxRateToEur: number | null;
    cashImpactEur: number;
    externalReference?: string | null;
    rowFingerprint?: string | null;
    source?: string;
    description?: string | null;
    rawPayload?: Record<string, unknown>;
    affectsCashBalance: boolean;
  }) => {
    const [created] = await withTimedDb('create_account_cash_movement', async () =>
      db
        .insert(accountCashMovements)
        .values({
          accountId: input.accountId,
          movementType: input.movementType,
          occurredAt: new Date(input.occurredAt),
          valueDate: input.valueDate ?? null,
          nativeAmount: input.nativeAmount.toString(),
          currency: normalizeCurrency(input.currency),
          fxRateToEur:
            input.fxRateToEur === null || input.fxRateToEur === undefined
              ? null
              : input.fxRateToEur.toString(),
          cashImpactEur: round2(input.cashImpactEur).toString(),
          externalReference: input.externalReference ?? null,
          rowFingerprint: input.rowFingerprint ?? null,
          source: input.source ?? 'manual',
          description: input.description ?? null,
          rawPayload: input.rawPayload ?? null,
          affectsCashBalance: input.affectsCashBalance,
        })
        .returning({ id: accountCashMovements.id }),
    );

    if (!created?.id) {
      throw new ApiHttpError(
        500,
        'INTERNAL_ERROR',
        'Failed to create account cash movement',
      );
    }
    return String(created.id);
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

  app.delete('/finances/accounts/:id', async ({ params, set }) => {
    const rows = await withTimedDb('delete_account', async () => {
      return db
        .delete(accounts)
        .where(eq(accounts.id, params.id))
        .returning({ id: accounts.id });
    });
    if (rows.length === 0) {
      throw new ApiHttpError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Account does not exist',
      );
    }
    set.status = 204;
    return;
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

  app.get('/finances/transactions', async ({ query }) => {
    const accountId = query.accountId as string | undefined;
    const whereSql =
      accountId && UUID_RE.test(accountId)
        ? sql`where account_id = ${accountId}`
        : sql``;

    const rows = await withTimedDb('list_unified_transactions', async () => {
      return db.execute(sql`
        with asset_rows as (
          select
            at.id,
            'asset_transaction'::text as "rowKind",
            at.account_id as "accountId",
            at.traded_at as "occurredAt",
            null::date as "valueDate",
            at.transaction_type as "transactionType",
            null::text as "movementType",
            at.asset_id as "assetId",
            a.asset_type as "assetType",
            (coalesce(a.symbol, a.ticker) || ' · ' || a.name)::text as "assetLabel",
            at.quantity as quantity,
            at.unit_price as "unitPrice",
            case
              when at.transaction_type = 'buy' then -(at.quantity * at.unit_price)
              when at.transaction_type = 'sell' then (at.quantity * at.unit_price)
              when at.transaction_type = 'dividend' then coalesce(at.dividend_net, 0)
              when at.transaction_type = 'fee' then -abs(coalesce(at.fees_amount, 0))
              else 0
            end::numeric as "amountNative",
            at.trade_currency as currency,
            at.fx_rate_to_eur as "fxRateToEur",
            at.cash_impact_eur as "cashImpactEur",
            at.linked_transaction_id as "linkedTransactionId",
            at.notes,
            at.external_reference as "externalReference",
            at.source
          from finances.asset_transactions at
          inner join finances.assets a on a.id = at.asset_id
          ${whereSql}
        ),
        cash_rows as (
          select
            acm.id,
            'cash_movement'::text as "rowKind",
            acm.account_id as "accountId",
            acm.occurred_at as "occurredAt",
            acm.value_date as "valueDate",
            null::text as "transactionType",
            acm.movement_type as "movementType",
            null::uuid as "assetId",
            null::text as "assetType",
            acm.description as "assetLabel",
            null::numeric as quantity,
            null::numeric as "unitPrice",
            acm.native_amount as "amountNative",
            acm.currency,
            acm.fx_rate_to_eur as "fxRateToEur",
            acm.cash_impact_eur as "cashImpactEur",
            null::uuid as "linkedTransactionId",
            acm.description as notes,
            acm.external_reference as "externalReference",
            acm.source
          from finances.account_cash_movements acm
          ${whereSql}
        )
        select *
        from asset_rows
        union all
        select *
        from cash_rows
        order by "occurredAt" desc, id desc
      `);
    });

    return rows.map(
      (row): UnifiedTransactionRow => ({
        id: String(row.id),
        rowKind: String(row.rowKind) as UnifiedTransactionRow['rowKind'],
        accountId: String(row.accountId),
        occurredAt: toIso(row.occurredAt),
        valueDate:
          row.valueDate === null || row.valueDate === undefined
            ? null
            : String(row.valueDate),
        transactionType:
          row.transactionType === null || row.transactionType === undefined
            ? null
            : (String(row.transactionType) as UnifiedTransactionRow['transactionType']),
        movementType:
          row.movementType === null || row.movementType === undefined
            ? null
            : String(row.movementType),
        assetId:
          row.assetId === null || row.assetId === undefined
            ? null
            : String(row.assetId),
        assetType:
          row.assetType === null || row.assetType === undefined
            ? null
            : (String(row.assetType) as UnifiedTransactionRow['assetType']),
        assetLabel:
          row.assetLabel === null || row.assetLabel === undefined
            ? null
            : String(row.assetLabel),
        quantity:
          row.quantity === null || row.quantity === undefined
            ? null
            : Number(row.quantity),
        unitPrice:
          row.unitPrice === null || row.unitPrice === undefined
            ? null
            : Number(row.unitPrice),
        amountNative: Number(row.amountNative ?? 0),
        currency: String(row.currency ?? 'EUR'),
        fxRateToEur:
          row.fxRateToEur === null || row.fxRateToEur === undefined
            ? null
            : Number(row.fxRateToEur),
        cashImpactEur: Number(row.cashImpactEur ?? 0),
        linkedTransactionId:
          row.linkedTransactionId === null ||
          row.linkedTransactionId === undefined
            ? null
            : String(row.linkedTransactionId),
        notes:
          row.notes === null || row.notes === undefined ? null : String(row.notes),
        externalReference:
          row.externalReference === null || row.externalReference === undefined
            ? null
            : String(row.externalReference),
        source:
          row.source === null || row.source === undefined
            ? null
            : String(row.source),
      }),
    );
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

    const created = await createAssetTransactionRecord(parsed.data);
    set.status = 201;
    return created;
  });

  app.delete('/finances/asset-transactions/:id', async ({ params, set }) => {
    const rows = await withTimedDb('delete_asset_transaction', async () => {
      return db
        .delete(assetTransactions)
        .where(eq(assetTransactions.id, params.id))
        .returning({ id: assetTransactions.id });
    });
    if (rows.length === 0) {
      throw new ApiHttpError(
        404,
        'ASSET_TRANSACTION_NOT_FOUND',
        'Asset transaction does not exist',
      );
    }
    set.status = 204;
    return;
  });

  app.post('/finances/import/degiro-transactions', async ({ body }) => {
    const parsed = degiroImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid DEGIRO import payload',
        parsed.error.format(),
      );
    }

    const csvBytes = new TextEncoder().encode(parsed.data.csvText).byteLength;
    if (csvBytes > 5 * 1024 * 1024) {
      throw new ApiHttpError(
        400,
        'CSV_TOO_LARGE',
        'CSV file is larger than 5MB limit.',
      );
    }

    const [accountRow] = await withTimedDb(
      'degiro_import_account_exists',
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

    const fileHash = await sha256Hex(parsed.data.csvText);

    const [importRun] = await withTimedDb(
      'degiro_create_import_run',
      async () => {
        return db
          .insert(transactionImports)
          .values({
            source: DEGIRO_TRANSACTIONS_SOURCE,
            accountId: parsed.data.accountId,
            filename: parsed.data.fileName,
            fileHash,
            dryRun: parsed.data.dryRun,
          })
          .returning();
      },
    );

    if (!importRun) {
      throw new ApiHttpError(
        500,
        'INTERNAL_ERROR',
        'Failed to initialize import run',
      );
    }

    let parsedCsv: ReturnType<typeof parseDegiroTransactionsCsv>;
    try {
      parsedCsv = parseDegiroTransactionsCsv(parsed.data.csvText);
    } catch (error) {
      await withTimedDb('degiro_import_mark_failed_parse', async () => {
        return db
          .update(transactionImports)
          .set({
            totalRows: 0,
            importedRows: 0,
            skippedRows: 0,
            failedRows: 1,
            updatedAt: new Date(),
          })
          .where(eq(transactionImports.id, importRun.id));
      });
      throw new ApiHttpError(
        400,
        'UNSUPPORTED_DEGIRO_CSV',
        error instanceof Error
          ? error.message
          : 'Unsupported DEGIRO CSV format.',
      );
    }

    const results: DegiroImportResult['results'] = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    const assetByIsin = new Map<string, { id: string; assetType: AssetType }>();
    const resolveAsset = async (
      isin: string,
      product: string,
      currency: string,
    ) => {
      const cached = assetByIsin.get(isin);
      if (cached) {
        return cached;
      }

      const [existing] = await withTimedDb(
        'degiro_import_asset_lookup',
        async () => {
          return db
            .select({ id: assets.id, assetType: assets.assetType })
            .from(assets)
            .where(eq(assets.isin, isin));
        },
      );

      if (existing) {
        const value = {
          id: String(existing.id),
          assetType: String(existing.assetType) as AssetType,
        };
        assetByIsin.set(isin, value);
        return value;
      }

      if (parsed.data.dryRun) {
        return null;
      }

      const guessedAssetType = getDegiroAssetType(product);
      const ticker = getDegiroTicker(product, isin);
      const [created] = await withTimedDb(
        'degiro_import_asset_create',
        async () => {
          return db
            .insert(assets)
            .values({
              name: product,
              assetType: guessedAssetType,
              ticker,
              isin,
              currency,
              symbol: null,
              subtype: 'degiro-import',
              exchange: null,
              providerSymbol: null,
              notes: 'Auto-created from DEGIRO CSV import.',
            })
            .onConflictDoNothing()
            .returning({ id: assets.id, assetType: assets.assetType });
        },
      );

      if (created) {
        const value = {
          id: String(created.id),
          assetType: String(created.assetType) as AssetType,
        };
        assetByIsin.set(isin, value);
        return value;
      }

      const [createdByOther] = await withTimedDb(
        'degiro_import_asset_lookup_after_create',
        async () => {
          return db
            .select({ id: assets.id, assetType: assets.assetType })
            .from(assets)
            .where(eq(assets.isin, isin));
        },
      );

      if (!createdByOther) {
        return null;
      }

      const value = {
        id: String(createdByOther.id),
        assetType: String(createdByOther.assetType) as AssetType,
      };
      assetByIsin.set(isin, value);
      return value;
    };

    for (const parsedRow of parsedCsv.rows) {
      if (!parsedRow.normalized || parsedRow.error) {
        failedRows += 1;
        results.push({
          rowNumber: parsedRow.rowNumber,
          status: 'failed',
          reason: parsedRow.error ?? 'Invalid row.',
          externalReference: parsedRow.normalized?.externalReference ?? null,
          assetId: null,
          transactionId: null,
        });
        continue;
      }

      const asset = await resolveAsset(
        parsedRow.normalized.isin,
        parsedRow.normalized.product,
        parsedRow.normalized.tradeCurrency,
      );
      if (!asset) {
        failedRows += 1;
        results.push({
          rowNumber: parsedRow.rowNumber,
          status: 'failed',
          reason: parsed.data.dryRun
            ? 'Asset not found (dry run does not create placeholders).'
            : 'Unable to resolve or create asset.',
          externalReference: parsedRow.normalized.externalReference,
          assetId: null,
          transactionId: null,
        });
        continue;
      }

      if (parsedRow.normalized.externalReference) {
        const [existingTx] = await withTimedDb(
          'degiro_import_dedupe_ref',
          async () => {
            return db
              .select({ id: assetTransactions.id })
              .from(assetTransactions)
              .where(
                and(
                  eq(assetTransactions.accountId, parsed.data.accountId),
                  eq(
                    assetTransactions.externalReference,
                    parsedRow.normalized?.externalReference ?? '',
                  ),
                ),
              );
          },
        );

        if (existingTx) {
          skippedRows += 1;
          results.push({
            rowNumber: parsedRow.rowNumber,
            status: 'skipped',
            reason: 'Duplicate external reference for this account.',
            externalReference: parsedRow.normalized.externalReference,
            assetId: asset.id,
            transactionId: String(existingTx.id),
          });
          continue;
        }
      }

      const payload: CreateAssetTransactionInput = {
        accountId: parsed.data.accountId,
        assetId: asset.id,
        assetType: asset.assetType,
        transactionType: parsedRow.normalized.transactionType,
        tradedAt: parsedRow.normalized.tradedAt,
        quantity: parsedRow.normalized.quantity,
        unitPrice: parsedRow.normalized.unitPrice,
        tradeCurrency: parsedRow.normalized.tradeCurrency,
        fxRateToEur: parsedRow.normalized.fxRateToEur,
        feesAmount: parsedRow.normalized.feesAmount,
        feesCurrency: parsedRow.normalized.feesCurrency,
        externalReference: parsedRow.normalized.externalReference,
        notes: `Imported from DEGIRO CSV (${parsed.data.fileName}).`,
      };

      const validation = createAssetTransactionInputSchema.safeParse(payload);
      if (!validation.success) {
        failedRows += 1;
        results.push({
          rowNumber: parsedRow.rowNumber,
          status: 'failed',
          reason: 'Normalized row failed validation.',
          externalReference: parsedRow.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
        continue;
      }

      if (parsed.data.dryRun) {
        skippedRows += 1;
        results.push({
          rowNumber: parsedRow.rowNumber,
          status: 'skipped',
          reason: 'Dry run: row validated but not inserted.',
          externalReference: parsedRow.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
        continue;
      }

      try {
        const created = await createAssetTransactionRecord(validation.data, {
          cashImpactEurOverride: round2(parsedRow.normalized.totalEur),
          source: DEGIRO_TRANSACTIONS_SOURCE,
        });
        importedRows += 1;
        results.push({
          rowNumber: parsedRow.rowNumber,
          status: 'imported',
          reason: null,
          externalReference: parsedRow.normalized.externalReference,
          assetId: asset.id,
          transactionId: created.id,
        });
      } catch (error) {
        failedRows += 1;
        results.push({
          rowNumber: parsedRow.rowNumber,
          status: 'failed',
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to create transaction.',
          externalReference: parsedRow.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
      }
    }

    if (results.length > 0) {
      await withTimedDb('degiro_import_rows_insert', async () => {
        return db.insert(transactionImportRows).values(
          results.map((result) => ({
            importId: importRun.id,
            rowNumber: result.rowNumber,
            status: result.status,
            errorCode:
              result.status === 'failed'
                ? 'ROW_IMPORT_FAILED'
                : result.status === 'skipped'
                  ? 'ROW_SKIPPED'
                  : null,
            errorMessage: result.reason ?? null,
            externalReference: result.externalReference ?? null,
            assetId: result.assetId ?? null,
            transactionId: result.transactionId ?? null,
            rawPayload:
              parsedCsv.rows.find((row) => row.rowNumber === result.rowNumber)
                ?.raw ?? {},
          })),
        );
      });
    }

    await withTimedDb('degiro_import_run_finalize', async () => {
      return db
        .update(transactionImports)
        .set({
          totalRows: parsedCsv.rows.length,
          importedRows,
          skippedRows,
          failedRows,
          updatedAt: new Date(),
        })
        .where(eq(transactionImports.id, importRun.id));
    });

    return {
      importId: String(importRun.id),
      source: DEGIRO_TRANSACTIONS_SOURCE,
      fileName: parsed.data.fileName,
      fileHash,
      dryRun: parsed.data.dryRun,
      totalRows: parsedCsv.rows.length,
      importedRows,
      skippedRows,
      failedRows,
      results,
    } satisfies DegiroImportResult;
  });

  app.post(
    '/finances/import/degiro-account-statement/analyze',
    async ({ body }): Promise<DegiroAccountStatementAnalyzeResult> => {
      const parsed = degiroAccountStatementAnalyzeRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiHttpError(
          400,
          'VALIDATION_ERROR',
          'Invalid DEGIRO Account Statement analyze payload',
          parsed.error.format(),
        );
      }

      const csvBytes = new TextEncoder().encode(parsed.data.csvText).byteLength;
      if (csvBytes > 5 * 1024 * 1024) {
        throw new ApiHttpError(
          400,
          'CSV_TOO_LARGE',
          'CSV file is larger than 5MB limit.',
        );
      }

      const [accountRow] = await withTimedDb(
        'degiro_statement_analyze_account_exists',
        async () =>
          db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.id, parsed.data.accountId)),
      );
      if (!accountRow) {
        throw new ApiHttpError(
          404,
          'ACCOUNT_NOT_FOUND',
          'Account does not exist',
        );
      }

      const fileHash = await sha256Hex(parsed.data.csvText);
      const parsedCsv = await parseDegiroAccountStatementCsv(parsed.data.csvText);
      const resolveOrderFxRate = buildOrderFxRateResolver(parsedCsv.rows);

      const statementIsins = [
        ...new Set(
          parsedCsv.rows
            .filter((row) => statementAssetRowTypes.has(row.rowType))
            .map((row) => row.isin)
            .filter((isin): isin is string => Boolean(isin)),
        ),
      ];
      const assetByIsin = await loadAssetsByIsin(statementIsins);

      const unresolvedByIsin = new Map<
        string,
        {
          isin: string;
          name: string;
          symbolHint: string | null;
          currencyHint: string;
          typeHint: AssetType;
        }
      >();

      const categoryBreakdown = new Map<string, number>();
      const previewRows: DegiroAccountStatementAnalyzeResult['previewRows'] = [];
      let readyRows = 0;
      let unresolvedRows = 0;
      let failedRows = 0;
      let ignoredRows = 0;
      let computedFinalCashEur = 0;

      for (const row of parsedCsv.rows) {
        categoryBreakdown.set(
          row.rowType,
          (categoryBreakdown.get(row.rowType) ?? 0) + 1,
        );

        let status: 'ready' | 'unresolved' | 'failed' | 'ignored' = 'ready';
        let reason: string | null = null;

        if (row.rowType === 'informational') {
          status = 'ignored';
          reason = 'Informational statement row.';
        } else if (row.rowType === 'unknown') {
          status = 'failed';
          reason = 'Unsupported row type.';
        } else if (!row.occurredAtIso) {
          status = 'failed';
          reason = 'Invalid Date/Time.';
        } else if (
          (row.rowType === 'buy' || row.rowType === 'sell') &&
          (!row.trade || row.changeAmount === null)
        ) {
          status = 'failed';
          reason = 'Trade row missing quantity, unit price, or amount.';
        } else if (
          (row.rowType === 'trade_fee' ||
            row.rowType === 'asset_fee' ||
            row.rowType === 'deposit' ||
            row.rowType === 'connectivity_fee' ||
            row.rowType === 'interest' ||
            row.rowType === 'generic_credit' ||
            row.rowType === 'fx_internal_credit' ||
            row.rowType === 'fx_internal_debit' ||
            row.rowType === 'cash_sweep_internal' ||
            row.rowType === 'dividend_gross' ||
            row.rowType === 'dividend_withholding') &&
          row.changeAmount === null
        ) {
          status = 'failed';
          reason = 'Row is missing monetary Change amount.';
        } else if (statementAssetRowTypes.has(row.rowType)) {
          if (!row.isin || row.isin.length !== 12) {
            status = 'failed';
            reason = 'Asset row missing valid ISIN.';
          } else if (!assetByIsin.has(row.isin)) {
            status = 'unresolved';
            reason = 'Asset with ISIN not found.';
            if (!unresolvedByIsin.has(row.isin)) {
              unresolvedByIsin.set(row.isin, {
                isin: row.isin,
                name: row.product || row.description,
                symbolHint: getDegiroStatementTicker(row.product, row.isin),
                currencyHint: normalizeCurrency(row.changeCurrency ?? 'EUR'),
                typeHint: getDegiroStatementAssetType(row.product),
              });
            }
          }
        }

        if (status === 'ready') {
          readyRows += 1;
        } else if (status === 'unresolved') {
          unresolvedRows += 1;
        } else if (status === 'failed') {
          failedRows += 1;
        } else {
          ignoredRows += 1;
        }

        if (
          status === 'ready' &&
          statementAffectsCash(row.rowType) &&
          row.changeAmount !== null
        ) {
          const fxRate = resolveOrderFxRate(
            row,
            normalizeCurrency(row.changeCurrency ?? 'EUR'),
          );
          const eurAmount = convertStatementAmountToEur(
            row.changeAmount,
            row.changeCurrency ?? 'EUR',
            fxRate,
          );
          if (eurAmount !== null) {
            computedFinalCashEur += eurAmount;
          }
        }

        previewRows.push({
          rowNumber: row.rowNumber,
          rowType: row.rowType,
          status,
          reason,
          description: row.description || null,
          externalReference: row.orderId,
          rowFingerprint: row.rowFingerprint,
        });
      }

      const expectedFinalCashEur =
        parsedCsv.rows.find(
          (row) =>
            normalizeCurrency(row.balanceCurrency ?? '') === 'EUR' &&
            row.balanceAmount !== null,
        )?.balanceAmount ?? round2(computedFinalCashEur);

      return {
        source: DEGIRO_ACCOUNT_STATEMENT_SOURCE,
        fileHash,
        totals: {
          totalRows: parsedCsv.rows.length,
          readyRows,
          unresolvedRows,
          failedRows,
          ignoredRows,
          expectedFinalCashEur: round2(expectedFinalCashEur),
          computedFinalCashEur: round2(computedFinalCashEur),
          deltaEur: round2(expectedFinalCashEur - computedFinalCashEur),
        },
        categoryBreakdown: Object.fromEntries(categoryBreakdown.entries()),
        unresolvedAssets: [...unresolvedByIsin.values()],
        previewRows,
        warnings: parsedCsv.warnings,
        errors: [],
      };
    },
  );

  app.post(
    '/finances/import/degiro-account-statement',
    async ({ body }): Promise<DegiroAccountStatementImportResult> => {
      const parsed = degiroAccountStatementImportRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiHttpError(
          400,
          'VALIDATION_ERROR',
          'Invalid DEGIRO Account Statement import payload',
          parsed.error.format(),
        );
      }

      const csvBytes = new TextEncoder().encode(parsed.data.csvText).byteLength;
      if (csvBytes > 5 * 1024 * 1024) {
        throw new ApiHttpError(
          400,
          'CSV_TOO_LARGE',
          'CSV file is larger than 5MB limit.',
        );
      }

      const [accountRow] = await withTimedDb(
        'degiro_statement_import_account_exists',
        async () =>
          db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.id, parsed.data.accountId)),
      );
      if (!accountRow) {
        throw new ApiHttpError(
          404,
          'ACCOUNT_NOT_FOUND',
          'Account does not exist',
        );
      }

      const fileHash = await sha256Hex(parsed.data.csvText);
      const parsedCsv = await parseDegiroAccountStatementCsv(parsed.data.csvText);
      const resolveOrderFxRate = buildOrderFxRateResolver(parsedCsv.rows);
      const existingFingerprints = await loadExistingStatementFingerprints(
        parsed.data.accountId,
      );

      const statementIsins = [
        ...new Set(
          parsedCsv.rows
            .filter((row) => statementAssetRowTypes.has(row.rowType))
            .map((row) => row.isin)
            .filter((isin): isin is string => Boolean(isin)),
        ),
      ];
      const assetByIsin = await loadAssetsByIsin(statementIsins);

      const unresolvedAssets = [
        ...new Set(
          parsedCsv.rows
            .filter((row) => statementAssetRowTypes.has(row.rowType))
            .filter((row) => row.isin && !assetByIsin.has(row.isin))
            .map((row) => row.isin as string),
        ),
      ];
      if (unresolvedAssets.length > 0) {
        throw new ApiHttpError(
          400,
          'UNRESOLVED_ASSETS',
          'Some statement assets are missing. Run analyze and create unresolved assets first.',
          { unresolvedIsins: unresolvedAssets },
        );
      }

      const [importRun] = await withTimedDb(
        'degiro_statement_create_import_run',
        async () =>
          db
            .insert(transactionImports)
            .values({
              source: DEGIRO_ACCOUNT_STATEMENT_SOURCE,
              accountId: parsed.data.accountId,
              filename: parsed.data.fileName,
              fileHash,
              dryRun: parsed.data.dryRun,
            })
            .returning(),
      );
      if (!importRun) {
        throw new ApiHttpError(
          500,
          'INTERNAL_ERROR',
          'Failed to initialize import run',
        );
      }

      const orderRowsById = new Map<string, DegiroAccountStatementRow[]>();
      for (const row of parsedCsv.rows) {
        if (!row.orderId) continue;
        const list = orderRowsById.get(row.orderId) ?? [];
        list.push(row);
        orderRowsById.set(row.orderId, list);
      }

      const linkedTradeByOrder = new Map<string, string>();
      const findLinkedTrade = async (orderId: string) => {
        const cached = linkedTradeByOrder.get(orderId);
        if (cached) {
          return cached;
        }
        const [existing] = await withTimedDb('degiro_statement_linked_trade', async () =>
          db.execute(sql`
            select id
            from finances.asset_transactions
            where account_id = ${parsed.data.accountId}
              and external_reference = ${orderId}
              and transaction_type in ('buy', 'sell')
            order by traded_at desc
            limit 1
          `),
        );
        if (!existing?.id) {
          return null;
        }
        const value = String(existing.id);
        linkedTradeByOrder.set(orderId, value);
        return value;
      };

      const resultsByRow = new Map<number, StatementImportRowResult>();
      let importedRows = 0;
      let skippedRows = 0;
      let failedRows = 0;
      let linkedFeeRows = 0;
      let createdCashMovements = 0;
      let createdAssetTransactions = 0;
      let appliedCashImpactEur = 0;

      const setResult = (
        row: DegiroAccountStatementRow,
        value: Omit<StatementImportRowResult, 'rowNumber' | 'rowType'>,
      ) => {
        resultsByRow.set(row.rowNumber, {
          rowNumber: row.rowNumber,
          rowType: row.rowType,
          ...value,
        });
      };

      const sortedRows = [...parsedCsv.rows].sort((a, b) => {
        const aTs = a.occurredAtIso ? new Date(a.occurredAtIso).getTime() : 0;
        const bTs = b.occurredAtIso ? new Date(b.occurredAtIso).getTime() : 0;
        if (aTs !== bTs) return aTs - bTs;
        if (a.rowType === 'buy' || a.rowType === 'sell') return -1;
        if (b.rowType === 'buy' || b.rowType === 'sell') return 1;
        return a.rowNumber - b.rowNumber;
      });

      for (const row of sortedRows) {
        if (row.rowType !== 'buy' && row.rowType !== 'sell') {
          continue;
        }
        if (resultsByRow.has(row.rowNumber)) continue;

        if (existingFingerprints.has(row.rowFingerprint)) {
          skippedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'skipped',
            reason: 'Duplicate row fingerprint.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        const asset = row.isin ? assetByIsin.get(row.isin) : null;
        if (!asset) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'Asset with ISIN not found.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }
        if (!row.occurredAtIso || !row.trade || row.changeAmount === null) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'Trade row is missing required fields.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        const tradeCurrency = normalizeCurrency(
          row.trade.tradeCurrency ?? row.changeCurrency ?? 'EUR',
        );
        const fxRateToEur = resolveOrderFxRate(row, tradeCurrency);
        const cashImpactEur = convertStatementAmountToEur(
          row.changeAmount,
          row.changeCurrency ?? tradeCurrency,
          resolveOrderFxRate(
            row,
            normalizeCurrency(row.changeCurrency ?? tradeCurrency),
          ),
        );
        if (cashImpactEur === null) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'FX rate to EUR is missing for non-EUR trade.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        const payload: CreateAssetTransactionInput = {
          accountId: parsed.data.accountId,
          assetId: asset.id,
          assetType: asset.assetType,
          transactionType: row.rowType,
          tradedAt: row.occurredAtIso,
          quantity: row.trade.quantity,
          unitPrice: row.trade.unitPrice,
          tradeCurrency,
          fxRateToEur,
          feesAmount: 0,
          feesCurrency: 'EUR',
          externalReference: row.orderId,
          notes: `Imported from DEGIRO Account Statement (${parsed.data.fileName}).`,
        };

        const validation = createAssetTransactionInputSchema.safeParse(payload);
        if (!validation.success) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'Trade row failed schema validation.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        if (parsed.data.dryRun) {
          skippedRows += 1;
          appliedCashImpactEur += cashImpactEur;
          existingFingerprints.add(row.rowFingerprint);
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'skipped',
            reason: 'Dry run: row validated but not inserted.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: 'asset_transaction',
            movementId: null,
          });
          continue;
        }

        try {
          const created = await createAssetTransactionRecord(validation.data, {
            cashImpactEurOverride: cashImpactEur,
            rowFingerprint: row.rowFingerprint,
            source: DEGIRO_ACCOUNT_STATEMENT_SOURCE,
            skipCashBalanceValidation: true,
          });
          importedRows += 1;
          createdAssetTransactions += 1;
          appliedCashImpactEur += cashImpactEur;
          existingFingerprints.add(row.rowFingerprint);
          if (row.orderId) {
            linkedTradeByOrder.set(row.orderId, created.id);
          }
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'imported',
            reason: null,
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: created.id,
            movementTable: 'asset_transaction',
            movementId: created.id,
          });
        } catch (error) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason:
              error instanceof Error
                ? error.message
                : 'Failed to import trade row.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
        }
      }

      for (const row of sortedRows) {
        if (row.rowType !== 'trade_fee' && row.rowType !== 'asset_fee') {
          continue;
        }
        if (resultsByRow.has(row.rowNumber)) continue;

        if (existingFingerprints.has(row.rowFingerprint)) {
          skippedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'skipped',
            reason: 'Duplicate row fingerprint.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        const asset = row.isin ? assetByIsin.get(row.isin) : null;
        if (!asset) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'Fee row requires an existing asset ISIN.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }
        if (!row.occurredAtIso || row.changeAmount === null) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'Fee row is missing required fields.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        const tradeCurrency = normalizeCurrency(row.changeCurrency ?? 'EUR');
        const fxRateToEur = resolveOrderFxRate(row, tradeCurrency);
        const cashImpactEur = convertStatementAmountToEur(
          row.changeAmount,
          row.changeCurrency ?? tradeCurrency,
          resolveOrderFxRate(
            row,
            normalizeCurrency(row.changeCurrency ?? tradeCurrency),
          ),
        );
        if (cashImpactEur === null) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'FX rate to EUR is missing for non-EUR fee.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        const linkedTransactionId =
          row.rowType === 'trade_fee' && row.orderId
            ? ((linkedTradeByOrder.get(row.orderId) ??
                (await findLinkedTrade(row.orderId))) as string | null)
            : null;

        const payload: CreateAssetTransactionInput = {
          accountId: parsed.data.accountId,
          assetId: asset.id,
          assetType: asset.assetType,
          transactionType: 'fee',
          tradedAt: row.occurredAtIso,
          quantity: 0,
          unitPrice: 0,
          tradeCurrency,
          fxRateToEur,
          feesAmount: Math.abs(row.changeAmount),
          feesCurrency: tradeCurrency,
          externalReference: row.orderId,
          notes: `Imported from DEGIRO Account Statement (${parsed.data.fileName}).`,
        };

        const validation = createAssetTransactionInputSchema.safeParse(payload);
        if (!validation.success) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'Fee row failed schema validation.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        if (parsed.data.dryRun) {
          skippedRows += 1;
          appliedCashImpactEur += cashImpactEur;
          existingFingerprints.add(row.rowFingerprint);
          if (linkedTransactionId) {
            linkedFeeRows += 1;
          }
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'skipped',
            reason: 'Dry run: row validated but not inserted.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: 'asset_transaction',
            movementId: null,
          });
          continue;
        }

        try {
          const created = await createAssetTransactionRecord(validation.data, {
            cashImpactEurOverride: cashImpactEur,
            linkedTransactionId,
            rowFingerprint: row.rowFingerprint,
            source: DEGIRO_ACCOUNT_STATEMENT_SOURCE,
            skipCashBalanceValidation: true,
          });
          importedRows += 1;
          createdAssetTransactions += 1;
          appliedCashImpactEur += cashImpactEur;
          existingFingerprints.add(row.rowFingerprint);
          if (linkedTransactionId) {
            linkedFeeRows += 1;
          }
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'imported',
            reason: null,
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: created.id,
            movementTable: 'asset_transaction',
            movementId: created.id,
          });
        } catch (error) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason:
              error instanceof Error ? error.message : 'Failed to import fee row.',
            externalReference: row.orderId,
            assetId: asset.id,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
        }
      }

      const dividendRows = parsedCsv.rows.filter(
        (row) =>
          row.rowType === 'dividend_gross' ||
          row.rowType === 'dividend_withholding',
      );
      const dividendGroupMap = new Map<string, DegiroAccountStatementRow[]>();
      for (const row of dividendRows) {
        const key = [
          row.isin ?? 'unknown',
          row.valueDate ?? row.date,
          normalizeCurrency(row.changeCurrency ?? 'EUR'),
          row.orderId ?? '',
        ].join('|');
        const list = dividendGroupMap.get(key) ?? [];
        list.push(row);
        dividendGroupMap.set(key, list);
      }

      for (const groupRows of dividendGroupMap.values()) {
        const ordered = [...groupRows].sort((a, b) => a.rowNumber - b.rowNumber);
        if (ordered.every((row) => resultsByRow.has(row.rowNumber))) {
          continue;
        }

        const first = ordered[0];
        if (!first) continue;

        const allDuplicate = ordered.every((row) =>
          existingFingerprints.has(row.rowFingerprint),
        );
        if (allDuplicate) {
          for (const row of ordered) {
            if (resultsByRow.has(row.rowNumber)) continue;
            skippedRows += 1;
            setResult(row, {
              rowFingerprint: row.rowFingerprint,
              status: 'skipped',
              reason: 'Duplicate row fingerprint.',
              externalReference: row.orderId,
              assetId: null,
              transactionId: null,
              movementTable: null,
              movementId: null,
            });
          }
          continue;
        }

        const asset = first.isin ? assetByIsin.get(first.isin) : null;
        if (!asset || !first.occurredAtIso) {
          for (const row of ordered) {
            if (resultsByRow.has(row.rowNumber)) continue;
            failedRows += 1;
            setResult(row, {
              rowFingerprint: row.rowFingerprint,
              status: 'failed',
              reason: 'Dividend row missing asset or timestamp.',
              externalReference: row.orderId,
              assetId: asset?.id ?? null,
              transactionId: null,
              movementTable: null,
              movementId: null,
            });
          }
          continue;
        }

        const currency = normalizeCurrency(first.changeCurrency ?? 'EUR');
        const gross = ordered
          .filter((row) => row.rowType === 'dividend_gross')
          .reduce((sum, row) => sum + Math.abs(row.changeAmount ?? 0), 0);
        const withholding = ordered
          .filter((row) => row.rowType === 'dividend_withholding')
          .reduce((sum, row) => sum + Math.abs(row.changeAmount ?? 0), 0);
        const net = gross - withholding;
        if (gross <= 0 || net <= 0) {
          for (const row of ordered) {
            if (resultsByRow.has(row.rowNumber)) continue;
            failedRows += 1;
            setResult(row, {
              rowFingerprint: row.rowFingerprint,
              status: 'failed',
              reason: 'Dividend gross/net could not be derived.',
              externalReference: row.orderId,
              assetId: asset.id,
              transactionId: null,
              movementTable: null,
              movementId: null,
            });
          }
          continue;
        }

        const fxRateToEur = resolveOrderFxRate(first, currency);
        const netEur = convertStatementAmountToEur(net, currency, fxRateToEur);
        if (netEur === null) {
          for (const row of ordered) {
            if (resultsByRow.has(row.rowNumber)) continue;
            failedRows += 1;
            setResult(row, {
              rowFingerprint: row.rowFingerprint,
              status: 'failed',
              reason: 'FX rate to EUR is missing for non-EUR dividend.',
              externalReference: row.orderId,
              assetId: asset.id,
              transactionId: null,
              movementTable: null,
              movementId: null,
            });
          }
          continue;
        }

        const groupFingerprint = await sha256Hex(
          ordered
            .map((row) => row.rowFingerprint)
            .sort((a, b) => a.localeCompare(b))
            .join('|'),
        );

        const payload: CreateAssetTransactionInput = {
          accountId: parsed.data.accountId,
          assetId: asset.id,
          assetType: asset.assetType,
          transactionType: 'dividend',
          tradedAt: first.occurredAtIso,
          quantity: 0,
          unitPrice: 0,
          tradeCurrency: currency,
          fxRateToEur,
          feesAmount: 0,
          feesCurrency: 'EUR',
          dividendGross: round6(gross),
          withholdingTax: round6(withholding),
          dividendNet: round6(net),
          externalReference: first.orderId,
          notes: `Imported from DEGIRO Account Statement (${parsed.data.fileName}).`,
        };

        const validation = createAssetTransactionInputSchema.safeParse(payload);
        if (!validation.success) {
          for (const row of ordered) {
            if (resultsByRow.has(row.rowNumber)) continue;
            failedRows += 1;
            setResult(row, {
              rowFingerprint: row.rowFingerprint,
              status: 'failed',
              reason: 'Dividend row failed schema validation.',
              externalReference: row.orderId,
              assetId: asset.id,
              transactionId: null,
              movementTable: null,
              movementId: null,
            });
          }
          continue;
        }

        if (parsed.data.dryRun) {
          for (const row of ordered) {
            if (resultsByRow.has(row.rowNumber)) continue;
            skippedRows += 1;
            existingFingerprints.add(row.rowFingerprint);
            setResult(row, {
              rowFingerprint: row.rowFingerprint,
              status: 'skipped',
              reason: 'Dry run: row validated but not inserted.',
              externalReference: row.orderId,
              assetId: asset.id,
              transactionId: null,
              movementTable: 'asset_transaction',
              movementId: null,
            });
          }
          existingFingerprints.add(groupFingerprint);
          appliedCashImpactEur += netEur;
          continue;
        }

        try {
          const created = await createAssetTransactionRecord(validation.data, {
            cashImpactEurOverride: netEur,
            rowFingerprint: groupFingerprint,
            source: DEGIRO_ACCOUNT_STATEMENT_SOURCE,
            skipCashBalanceValidation: true,
          });
          importedRows += 1;
          createdAssetTransactions += 1;
          appliedCashImpactEur += netEur;
          existingFingerprints.add(groupFingerprint);
          for (const row of ordered) {
            if (resultsByRow.has(row.rowNumber)) continue;
            existingFingerprints.add(row.rowFingerprint);
            setResult(row, {
              rowFingerprint: row.rowFingerprint,
              status: 'imported',
              reason: null,
              externalReference: row.orderId,
              assetId: asset.id,
              transactionId: created.id,
              movementTable: 'asset_transaction',
              movementId: created.id,
            });
          }
        } catch (error) {
          for (const row of ordered) {
            if (resultsByRow.has(row.rowNumber)) continue;
            failedRows += 1;
            setResult(row, {
              rowFingerprint: row.rowFingerprint,
              status: 'failed',
              reason:
                error instanceof Error
                  ? error.message
                  : 'Failed to import dividend row.',
              externalReference: row.orderId,
              assetId: asset.id,
              transactionId: null,
              movementTable: null,
              movementId: null,
            });
          }
        }
      }

      for (const row of sortedRows) {
        if (resultsByRow.has(row.rowNumber)) continue;

        if (row.rowType === 'informational') {
          skippedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'skipped',
            reason: 'Informational row not imported.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        if (row.rowType === 'unknown') {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'Unsupported row type.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        const isCashMovementRow =
          row.rowType === 'deposit' ||
          row.rowType === 'connectivity_fee' ||
          row.rowType === 'interest' ||
          row.rowType === 'generic_credit' ||
          row.rowType === 'fx_internal_credit' ||
          row.rowType === 'fx_internal_debit' ||
          row.rowType === 'cash_sweep_internal';
        if (!isCashMovementRow) {
          continue;
        }

        if (existingFingerprints.has(row.rowFingerprint)) {
          skippedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'skipped',
            reason: 'Duplicate row fingerprint.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        if (!row.occurredAtIso || row.changeAmount === null) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'Cash movement row is missing timestamp or amount.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        const currency = normalizeCurrency(row.changeCurrency ?? 'EUR');
        const affectsCashBalance = statementAffectsCash(row.rowType);
        const fxRateToEur = resolveOrderFxRate(row, currency);
        const cashImpactEur = affectsCashBalance
          ? convertStatementAmountToEur(row.changeAmount, currency, fxRateToEur)
          : 0;
        if (cashImpactEur === null) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason: 'FX rate to EUR is missing for non-EUR cash movement.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
          continue;
        }

        if (parsed.data.dryRun) {
          skippedRows += 1;
          existingFingerprints.add(row.rowFingerprint);
          if (affectsCashBalance) {
            appliedCashImpactEur += cashImpactEur;
          }
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'skipped',
            reason: 'Dry run: row validated but not inserted.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: 'cash_movement',
            movementId: null,
          });
          continue;
        }

        try {
          const createdId = await createAccountCashMovementRecord({
            accountId: parsed.data.accountId,
            movementType: statementCashMovementType(row.rowType),
            occurredAt: row.occurredAtIso,
            valueDate: row.valueDate,
            nativeAmount: row.changeAmount,
            currency,
            fxRateToEur: affectsCashBalance ? fxRateToEur : null,
            cashImpactEur,
            externalReference: row.orderId,
            rowFingerprint: row.rowFingerprint,
            source: DEGIRO_ACCOUNT_STATEMENT_SOURCE,
            description: row.description || null,
            rawPayload: row.raw,
            affectsCashBalance,
          });
          importedRows += 1;
          createdCashMovements += 1;
          existingFingerprints.add(row.rowFingerprint);
          if (affectsCashBalance) {
            appliedCashImpactEur += cashImpactEur;
          }
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'imported',
            reason: null,
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: 'cash_movement',
            movementId: createdId,
          });
        } catch (error) {
          failedRows += 1;
          setResult(row, {
            rowFingerprint: row.rowFingerprint,
            status: 'failed',
            reason:
              error instanceof Error
                ? error.message
                : 'Failed to import cash movement row.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          });
        }
      }

      const results = parsedCsv.rows
        .map((row) => {
          const result = resultsByRow.get(row.rowNumber);
          if (result) {
            return result;
          }
          return {
            rowNumber: row.rowNumber,
            rowType: row.rowType,
            rowFingerprint: row.rowFingerprint,
            status: 'failed' as const,
            reason: 'Row was not processed.',
            externalReference: row.orderId,
            assetId: null,
            transactionId: null,
            movementTable: null,
            movementId: null,
          };
        })
        .sort((a, b) => a.rowNumber - b.rowNumber);

      const failedMissing = results.filter((row) => row.status === 'failed').length;
      if (failedMissing > failedRows) {
        failedRows = failedMissing;
      }

      await withTimedDb('degiro_statement_import_rows_insert', async () =>
        db.insert(transactionImportRows).values(
          results.map((result) => ({
            importId: importRun.id,
            rowNumber: result.rowNumber,
            status: result.status,
            errorCode:
              result.status === 'failed'
                ? 'ROW_IMPORT_FAILED'
                : result.status === 'skipped'
                  ? 'ROW_SKIPPED'
                  : null,
            errorMessage: result.reason,
            externalReference: result.externalReference,
            rowFingerprint: result.rowFingerprint,
            rowType: result.rowType,
            movementTable: result.movementTable,
            movementId: result.movementId,
            assetId: result.assetId,
            transactionId: result.transactionId,
            rawPayload:
              parsedCsv.rows.find((row) => row.rowNumber === result.rowNumber)
                ?.raw ?? {},
          })),
        ),
      );

      await withTimedDb('degiro_statement_import_run_finalize', async () =>
        db
          .update(transactionImports)
          .set({
            totalRows: parsedCsv.rows.length,
            importedRows,
            skippedRows,
            failedRows,
            updatedAt: new Date(),
          })
          .where(eq(transactionImports.id, importRun.id)),
      );

      const expectedFinalCashEur =
        parsedCsv.rows.find(
          (row) =>
            normalizeCurrency(row.balanceCurrency ?? '') === 'EUR' &&
            row.balanceAmount !== null,
        )?.balanceAmount ?? 0;

      const currentCash = await getAccountCashBalance(parsed.data.accountId);
      const computedFinalCashEur =
        parsed.data.dryRun || currentCash === null
          ? round2((currentCash ?? 0) + appliedCashImpactEur)
          : round2(currentCash);

      return {
        importId: String(importRun.id),
        source: DEGIRO_ACCOUNT_STATEMENT_SOURCE,
        fileName: parsed.data.fileName,
        fileHash,
        dryRun: parsed.data.dryRun,
        totalRows: parsedCsv.rows.length,
        importedRows,
        skippedRows,
        failedRows,
        linkedFeeRows,
        createdCashMovements,
        createdAssetTransactions,
        expectedFinalCashEur: round2(expectedFinalCashEur),
        computedFinalCashEur,
        deltaEur: round2(expectedFinalCashEur - computedFinalCashEur),
        results,
      };
    },
  );

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
        throw new ApiHttpError(
          404,
          'ACCOUNT_NOT_FOUND',
          'Account does not exist',
        );
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
              at.trade_currency as "tradeCurrency",
              at.fx_rate_to_eur as "fxRateToEur",
              at.cash_impact_eur as "cashImpactEur",
              a.name as "assetName",
              coalesce(a.provider_symbol, a.symbol, a.ticker) as symbol
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
            at.trade_currency as "tradeCurrency",
            at.fx_rate_to_eur as "fxRateToEur",
            at.cash_impact_eur as "cashImpactEur",
            a.name as "assetName",
            coalesce(a.provider_symbol, a.symbol, a.ticker) as symbol
          from finances.asset_transactions at
          inner join finances.assets a on a.id = at.asset_id
          where at.account_id = ${selectedAccountId}
          order by at.traded_at asc
        `);
      });

      const cashMovementRows = await withTimedDb(
        'overview_cash_movements',
        async () => {
          if (selectedAccountId === 'all') {
            return db.execute(sql`
              select
                account_id as "accountId",
                occurred_at as "occurredAt",
                movement_type as "movementType",
                cash_impact_eur as "cashImpactEur"
              from finances.account_cash_movements
              where affects_cash_balance = true
              order by occurred_at asc
            `);
          }
          return db.execute(sql`
            select
              account_id as "accountId",
              occurred_at as "occurredAt",
              movement_type as "movementType",
              cash_impact_eur as "cashImpactEur"
            from finances.account_cash_movements
            where account_id = ${selectedAccountId}
              and affects_cash_balance = true
            order by occurred_at asc
          `);
        },
      );

      const assetRows = await withTimedDb('overview_assets', async () => {
        return db.execute(sql`
          select
            a.id as "assetId",
            a.name as "assetName",
            a.asset_type as "assetType",
            coalesce(a.provider_symbol, a.symbol, a.ticker) as symbol,
            a.currency as currency,
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

      const tx = txRows.map((row) => ({
        accountId: String(row.accountId),
        assetId: String(row.assetId),
        symbol: String(row.symbol),
        assetName: String(row.assetName),
        transactionType: String(row.transactionType),
        tradedAtMs: new Date(String(row.tradedAt)).getTime(),
        quantity: Number(row.quantity ?? 0),
        unitPrice: Number(row.unitPrice ?? 0),
        tradeCurrency: normalizeCurrency(String(row.tradeCurrency ?? 'EUR')),
        fxRateToEur: toNullableNumber(row.fxRateToEur),
        cashImpactEur: Number(row.cashImpactEur ?? 0),
      }));

      const cashMovements = cashMovementRows.map((row) => ({
        accountId: String(row.accountId),
        occurredAtMs: new Date(String(row.occurredAt)).getTime(),
        movementType: String(row.movementType ?? 'other'),
        cashImpactEur: Number(row.cashImpactEur ?? 0),
      }));

      const assetMetaById = new Map<
        string,
        {
          assetType: AssetType;
          symbol: string;
          name: string;
          currency: string;
          manualPrice: number | null;
        }
      >();
      for (const row of assetRows) {
        assetMetaById.set(String(row.assetId), {
          assetType: String(row.assetType) as AssetType,
          symbol: String(row.symbol),
          name: String(row.assetName),
          currency: normalizeCurrency(String(row.currency ?? 'EUR')),
          manualPrice:
            row.manualPrice === null || row.manualPrice === undefined
              ? null
              : Number(row.manualPrice),
        });
      }

      const txTimestamps = tx
        .map((row) => row.tradedAtMs)
        .filter((value) => Number.isFinite(value));
      const cashTimestamps = cashMovements
        .map((row) => row.occurredAtMs)
        .filter((value) => Number.isFinite(value));
      const minTransactionTimestampMs =
        txTimestamps.length === 0 && cashTimestamps.length === 0
          ? null
          : Math.min(...txTimestamps, ...cashTimestamps);

      const symbols = [...symbolSet];
      let minPriceTimestampMs: number | null = null;
      let latestPriceTimestampMs: number | null = null;
      let previousAsOfMs: number | null = null;

      if (symbols.length > 0) {
        const [priceBounds] = await withTimedDb(
          'overview_price_bounds',
          async () => {
            return db.execute(sql`
            select
              min(priced_at) as "minPricedAt",
              max(priced_at) as "maxPricedAt"
            from finances.price_history
            where symbol in (${sql.join(
              symbols.map((symbol) => sql`${symbol}`),
              sql`, `,
            )})
          `);
          },
        );

        const minPriceAt = priceBounds?.minPricedAt;
        const maxPriceAt = priceBounds?.maxPricedAt;
        if (minPriceAt) {
          const minMs = new Date(String(minPriceAt)).getTime();
          if (Number.isFinite(minMs)) {
            minPriceTimestampMs = minMs;
          }
        }
        if (maxPriceAt) {
          const maxMs = new Date(String(maxPriceAt)).getTime();
          if (Number.isFinite(maxMs)) {
            latestPriceTimestampMs = maxMs;
          }
        }

        const latestPriceTimes = await withTimedDb(
          'overview_previous_asof',
          async () => {
            return db.execute(sql`
              select distinct priced_at as "pricedAt"
              from finances.price_history
              where symbol in (${sql.join(
                symbols.map((symbol) => sql`${symbol}`),
                sql`, `,
              )})
              order by priced_at desc
              limit 2
            `);
          },
        );

        const latestTime = latestPriceTimes[0]?.pricedAt;
        if (latestTime) {
          const latestTimeMs = new Date(String(latestTime)).getTime();
          if (Number.isFinite(latestTimeMs)) {
            latestPriceTimestampMs = latestTimeMs;
          }
        }

        const previousTime = latestPriceTimes[1]?.pricedAt;
        if (previousTime) {
          const previousTimeMs = new Date(String(previousTime)).getTime();
          if (Number.isFinite(previousTimeMs)) {
            previousAsOfMs = previousTimeMs;
          }
        }
      }

      const minTimestampMs =
        minTransactionTimestampMs === null
          ? minPriceTimestampMs
          : minPriceTimestampMs === null
            ? minTransactionTimestampMs
            : Math.min(minTransactionTimestampMs, minPriceTimestampMs);

      const usdToEurAt = (tsMs: number): number | null => {
        if (fxRows.length === 0) return null;
        let eurusd: number | null = null;
        for (const point of fxRows) {
          if (point.pricedAtMs <= tsMs) {
            eurusd = point.eurusd;
          } else {
            break;
          }
        }
        if (eurusd === null) {
          eurusd = fxRows[0]?.eurusd ?? null;
        }
        if (eurusd === null || eurusd <= 0) return null;
        return 1 / eurusd;
      };

      const fxRateForAssetAt = (assetId: string, tsMs: number): number => {
        const meta = assetMetaById.get(assetId);
        if (!meta || meta.currency === 'EUR') {
          return 1;
        }

        if (meta.currency === 'USD') {
          const marketUsdToEur = usdToEurAt(tsMs);
          if (marketUsdToEur !== null && marketUsdToEur > 0) {
            return marketUsdToEur;
          }
        }

        let latestBeforeTs: number | null = null;
        let latestAny: number | null = null;
        for (const row of tx) {
          if (row.assetId !== assetId) continue;
          if (row.tradeCurrency !== meta.currency) continue;
          if (!row.fxRateToEur || row.fxRateToEur <= 0) continue;
          latestAny = row.fxRateToEur;
          if (row.tradedAtMs <= tsMs) {
            latestBeforeTs = row.fxRateToEur;
          }
        }

        const selected = latestBeforeTs ?? latestAny ?? 1;
        return selected > 0 ? selected : 1;
      };

      const now = new Date();
      const rangeStartAnchorMs =
        range === 'MAX'
          ? (minTransactionTimestampMs ?? minTimestampMs)
          : minTimestampMs;
      const rangeStart = clampRangeStart(range, now, rangeStartAnchorMs);
      const rangeStartMs = rangeStart.getTime();

      const asOfMs = latestPriceTimestampMs ?? now.getTime();

      const querySymbols = [...new Set([...symbols, EURUSD_FX_SYMBOL])];
      const priceWindowRows =
        querySymbols.length === 0
          ? []
          : await withTimedDb('overview_prices_window', async () => {
              return db.execute(sql`
                select
                  symbol,
                  priced_at as "pricedAt",
                  price,
                  source
                from finances.price_history
                where symbol in (${sql.join(
                  querySymbols.map((symbol) => sql`${symbol}`),
                  sql`, `,
                )})
                  and priced_at >= ${rangeStart.toISOString()}
                  and priced_at <= ${new Date(asOfMs).toISOString()}
                order by priced_at asc
              `);
            });

      const priceAnchorRows =
        querySymbols.length === 0
          ? []
          : await withTimedDb('overview_prices_anchor', async () => {
              return db.execute(sql`
                select distinct on (symbol)
                  symbol,
                  priced_at as "pricedAt",
                  price,
                  source
                from finances.price_history
                where symbol in (${sql.join(
                  querySymbols.map((symbol) => sql`${symbol}`),
                  sql`, `,
                )})
                  and priced_at < ${rangeStart.toISOString()}
                order by symbol, priced_at desc
              `);
            });

      const combinedPriceRows = [...priceAnchorRows, ...priceWindowRows];

      const fxRows = combinedPriceRows
        .filter(
          (row) =>
            String(row.symbol) === EURUSD_FX_SYMBOL &&
            (String(row.source) === 'yahoo_fx' ||
              String(row.source) === 'yahoo'),
        )
        .map((row) => ({
          pricedAtMs: new Date(String(row.pricedAt)).getTime(),
          eurusd: Number(row.price),
        }))
        .filter((row) => Number.isFinite(row.pricedAtMs) && row.eurusd > 0)
        .sort((a, b) => a.pricedAtMs - b.pricedAtMs);

      const relevantPrices = combinedPriceRows
        .filter(
          (row) =>
            String(row.symbol) !== EURUSD_FX_SYMBOL &&
            symbolSet.has(String(row.symbol)),
        )
        .map((row) => ({
          symbol: String(row.symbol),
          pricedAtMs: new Date(String(row.pricedAt)).getTime(),
          price: Number(row.price),
        }))
        .filter((row) => Number.isFinite(row.pricedAtMs) && row.price > 0);

      const distinctPriceTimes = [
        ...new Set(
          relevantPrices
            .map((row) => row.pricedAtMs)
            .filter((tsMs) => Number.isFinite(tsMs)),
        ),
      ].sort((a, b) => a - b);

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
        return value;
      };

      const priceAtOrAfter = (symbol: string, tsMs: number): number | null => {
        const list = pricesBySymbol.get(symbol);
        if (!list || list.length === 0) return null;
        for (const point of list) {
          if (point.pricedAtMs >= tsMs) {
            return point.price;
          }
        }
        return null;
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
        for (const row of cashMovements) {
          if (row.occurredAtMs <= tsMs) {
            value += row.cashImpactEur;
          }
        }
        return value;
      };

      const avgBuyUnitEurAt = (
        assetId: string,
        tsMs: number,
      ): number | null => {
        let totalQty = 0;
        let totalCostEur = 0;
        for (const row of tx) {
          if (row.assetId !== assetId) continue;
          if (row.transactionType !== 'buy') continue;
          if (row.tradedAtMs > tsMs) continue;
          if (row.quantity <= 0) continue;
          totalQty += row.quantity;
          totalCostEur += Math.abs(row.cashImpactEur);
        }
        if (totalQty <= 0) {
          return null;
        }
        return totalCostEur / totalQty;
      };

      const portfolioTotalAt = (
        tsMs: number,
        fallbackToCurrentPrice: boolean,
      ) => {
        const quantities = quantityByAssetAt(tsMs);
        let total = cashAt(tsMs);
        for (const [assetId, quantity] of quantities.entries()) {
          if (quantity <= 0) continue;
          const meta = assetMetaById.get(assetId);
          if (!meta) continue;
          let unitPriceEur: number | null = null;
          const marketUnitPrice = priceAtOrBefore(meta.symbol, tsMs);
          if (marketUnitPrice !== null) {
            unitPriceEur = marketUnitPrice * fxRateForAssetAt(assetId, tsMs);
          } else if (
            fallbackToCurrentPrice &&
            meta.manualPrice !== null &&
            meta.manualPrice > 0
          ) {
            unitPriceEur = meta.manualPrice * fxRateForAssetAt(assetId, tsMs);
          } else {
            unitPriceEur = avgBuyUnitEurAt(assetId, tsMs);
          }
          if (unitPriceEur !== null) {
            total += quantity * unitPriceEur;
          }
        }
        return round2(total);
      };

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
      const totalValue = series[series.length - 1]?.value ?? portfolioTotalAt(asOfMs, true);
      const baselineTotalValue = series[0]?.value ?? totalValue;
      const deltaValue = round2(totalValue - baselineTotalValue);
      const pctDenominator = Math.abs(baselineTotalValue);
      const deltaPct =
        pctDenominator === 0
          ? 0
          : round2((deltaValue / pctDenominator) * 100);

      const currentQuantities = quantityByAssetAt(asOfMs);
      const buyStatsByAsset = new Map<string, { qty: number; total: number }>();
      for (const row of tx) {
        if (row.transactionType !== 'buy') continue;
        const current = buyStatsByAsset.get(row.assetId) ?? {
          qty: 0,
          total: 0,
        };
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

          const currentMarketOrManualUnit =
            priceAtOrBefore(meta.symbol, asOfMs) ?? meta.manualPrice;
          const startMarketOrManualUnit =
            priceAtOrBefore(meta.symbol, rangeStartMs) ??
            priceAtOrAfter(meta.symbol, rangeStartMs) ??
            currentMarketOrManualUnit;
          const currentFxToEur = fxRateForAssetAt(assetId, asOfMs);
          const startFxToEur = fxRateForAssetAt(assetId, rangeStartMs);
          const currentUnitEur =
            currentMarketOrManualUnit !== null
              ? currentMarketOrManualUnit * currentFxToEur
              : (avgBuyUnitEur ?? 0);
          const startUnitEur =
            startMarketOrManualUnit !== null
              ? startMarketOrManualUnit * startFxToEur
              : (avgBuyUnitEur ?? currentUnitEur);
          const currentUnitQuote =
            currentMarketOrManualUnit !== null
              ? currentMarketOrManualUnit
              : avgBuyUnitEur !== null && currentFxToEur > 0
                ? avgBuyUnitEur / currentFxToEur
                : (avgBuyUnitEur ?? 0);

          const currentTotal = round2(quantity * currentUnitEur);
          const periodPnlValueEur = round2(
            quantity * (currentUnitEur - startUnitEur),
          );
          const periodPnlPct =
            startUnitEur <= 0
              ? 0
              : round2(((currentUnitEur - startUnitEur) / startUnitEur) * 100);

          return {
            assetId,
            assetType: meta.assetType,
            symbol: meta.symbol,
            name: meta.name,
            quoteCurrency: meta.currency,
            quantity: round6(quantity),
            currentUnitQuote: round6(currentUnitQuote),
            avgBuyUnitEur:
              avgBuyUnitEur === null ? null : round6(avgBuyUnitEur),
            avgBuyTotalEur,
            currentUnitEur: round6(currentUnitEur),
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
        previousAsOfIso: new Date(rangeStartMs).toISOString(),
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
            coalesce(
              sum(
                a.opening_balance_eur +
                coalesce(at_sum.asset_cash_impact_eur, 0) +
                coalesce(acm_sum.cash_movement_impact_eur, 0)
              ),
              0
            )::numeric as total_balance
          from finances.accounts a
          left join (
            select
              account_id,
              coalesce(sum(cash_impact_eur), 0)::numeric as asset_cash_impact_eur
            from finances.asset_transactions
            group by account_id
          ) at_sum on at_sum.account_id = a.id
          left join (
            select
              account_id,
              coalesce(sum(cash_impact_eur), 0)::numeric as cash_movement_impact_eur
            from finances.account_cash_movements
            where affects_cash_balance = true
            group by account_id
          ) acm_sum on acm_sum.account_id = a.id
        ),
        tx as (
          select
            coalesce(sum(case when cash_impact_eur > 0 and traded_at >= date_trunc('month', now()) then cash_impact_eur else 0 end), 0)::numeric as monthly_inflow,
            coalesce(sum(case when cash_impact_eur < 0 and traded_at >= date_trunc('month', now()) then cash_impact_eur else 0 end), 0)::numeric as monthly_outflow,
            count(*)::int as transaction_count
          from finances.asset_transactions
        ),
        cash_tx as (
          select
            coalesce(sum(case when cash_impact_eur > 0 and occurred_at >= date_trunc('month', now()) and affects_cash_balance then cash_impact_eur else 0 end), 0)::numeric as monthly_inflow,
            coalesce(sum(case when cash_impact_eur < 0 and occurred_at >= date_trunc('month', now()) and affects_cash_balance then cash_impact_eur else 0 end), 0)::numeric as monthly_outflow,
            count(*)::int as transaction_count
          from finances.account_cash_movements
        ),
        ac as (
          select count(*)::int as account_count
          from finances.accounts
        )
        select
          account_cash.total_balance,
          (tx.monthly_inflow + cash_tx.monthly_inflow)::numeric as monthly_inflow,
          (tx.monthly_outflow + cash_tx.monthly_outflow)::numeric as monthly_outflow,
          (tx.transaction_count + cash_tx.transaction_count)::int as transaction_count,
          ac.account_count
        from account_cash, tx, cash_tx, ac
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
