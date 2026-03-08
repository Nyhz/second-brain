import {
  accountCashMovements,
  accounts,
  and,
  auditEvents,
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
  type Account,
  type Asset,
  type AssetPosition,
  type AssetTransaction,
  type AssetType,
  type BinanceImportResult,
  type CobasImportResult,
  type CreateAccountCashMovementInput,
  type CreateAssetTransactionInput,
  type DegiroAccountStatementAnalyzeResult,
  type DegiroAccountStatementImportResult,
  type DegiroImportResult,
  type FinanceAuditEvent,
  type FinancesOverviewResponse,
  type OverviewRange,
  type TaxYearlySummary,
  type UnifiedTransactionRow,
  binanceImportRequestSchema,
  cobasImportRequestSchema,
  createAccountCashMovementInputSchema,
  createAccountInputSchema,
  createAssetInputSchema,
  createAssetTransactionInputSchema,
  degiroAccountStatementAnalyzeRequestSchema,
  degiroAccountStatementImportRequestSchema,
  degiroImportRequestSchema,
  overviewRangeSchema,
  updateAssetInputSchema,
  upsertAssetPositionInputSchema,
} from '@second-brain/types';
import type { Elysia } from 'elysia';
import { withTimedDb } from '../../lib/db-timed';
import { ApiHttpError } from '../../lib/errors';
import { renderPlainTextPdf } from '../../lib/simple-pdf';
import {
  buildAccountStatementPdf,
  buildAccountTransactionLedgerPdf,
} from './account-pdf';
import { parseBinanceTransactionsCsv } from './binance-import';
import { parseCobasTransactionsCsv } from './cobas-import';
import {
  type DegiroAccountStatementRow,
  type DegiroAccountStatementRowType,
  getDegiroStatementAssetType,
  getDegiroStatementTicker,
  parseDegiroAccountStatementCsv,
} from './degiro-account-statement';
import { parseDegiroTransactionsCsv } from './degiro-import';

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

const toNullableDate = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

const normalizeAuditJson = (value: unknown): Record<string, unknown> | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
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

const computeTransactionEconomics = (
  input: Pick<
    CreateAssetTransactionInput,
    | 'transactionType'
    | 'quantity'
    | 'unitPrice'
    | 'tradeCurrency'
    | 'fxRateToEur'
    | 'feesAmount'
    | 'feesCurrency'
    | 'dividendNet'
  >,
) => {
  const tradeCurrency = normalizeCurrency(input.tradeCurrency);
  const feesCurrency = normalizeCurrency(
    input.feesCurrency ?? input.tradeCurrency,
  );
  const tradeGrossAmount =
    input.transactionType === 'buy' || input.transactionType === 'sell'
      ? round6(input.quantity * input.unitPrice)
      : 0;
  const tradeGrossAmountEur =
    input.transactionType === 'buy' || input.transactionType === 'sell'
      ? round2(
          convertToEur(tradeGrossAmount, tradeCurrency, input.fxRateToEur ?? null),
        )
      : 0;
  const feesAmountEur = round2(
    convertToEur(input.feesAmount, feesCurrency, input.fxRateToEur ?? null),
  );

  if (input.transactionType === 'buy') {
    return {
      tradeCurrency,
      feesCurrency,
      tradeGrossAmount,
      tradeGrossAmountEur,
      feesAmountEur,
      netAmountEur: round2(tradeGrossAmountEur + feesAmountEur),
      cashImpactEur: round2(-(tradeGrossAmountEur + feesAmountEur)),
    };
  }
  if (input.transactionType === 'sell') {
    return {
      tradeCurrency,
      feesCurrency,
      tradeGrossAmount,
      tradeGrossAmountEur,
      feesAmountEur,
      netAmountEur: round2(Math.max(0, tradeGrossAmountEur - feesAmountEur)),
      cashImpactEur: round2(tradeGrossAmountEur - feesAmountEur),
    };
  }
  if (input.transactionType === 'fee') {
    return {
      tradeCurrency,
      feesCurrency,
      tradeGrossAmount: 0,
      tradeGrossAmountEur: 0,
      feesAmountEur,
      netAmountEur: round2(feesAmountEur),
      cashImpactEur: round2(-feesAmountEur),
    };
  }

  const dividendNetEur = round2(
    convertToEur(input.dividendNet ?? 0, tradeCurrency, input.fxRateToEur ?? null),
  );
  return {
    tradeCurrency,
    feesCurrency,
    tradeGrossAmount: 0,
    tradeGrossAmountEur: 0,
    feesAmountEur,
    netAmountEur: dividendNetEur,
    cashImpactEur: dividendNetEur,
  };
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
  tradeGrossAmount: toNumber(row.tradeGrossAmount),
  tradeGrossAmountEur: toNumber(row.tradeGrossAmountEur),
  cashImpactEur: toNumber(row.cashImpactEur),
  feesAmount: toNumber(row.feesAmount),
  feesCurrency:
    row.feesCurrency === null || row.feesCurrency === undefined
      ? null
      : String(row.feesCurrency),
  feesAmountEur: toNumber(row.feesAmountEur),
  netAmountEur: toNumber(row.netAmountEur),
  dividendGross: toNullableNumber(row.dividendGross),
  withholdingTax: toNullableNumber(row.withholdingTax),
  dividendNet: toNullableNumber(row.dividendNet),
  settlementDate: toNullableDate(row.settlementDate),
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
  rawPayload: normalizeAuditJson(row.rawPayload),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const serializeFinanceAuditEvent = (
  row: Record<string, unknown>,
): FinanceAuditEvent => ({
  id: String(row.id),
  entityType: String(row.entityType),
  entityId: String(row.entityId),
  action: String(row.action),
  actorType: String(row.actorType),
  source: String(row.source),
  summary: String(row.summary),
  previousJson: normalizeAuditJson(row.previousJson),
  nextJson: normalizeAuditJson(row.nextJson),
  contextJson: normalizeAuditJson(row.contextJson),
  createdAt: toIso(row.createdAt),
});

const round2 = (value: number) => Number(value.toFixed(2));
const EURUSD_FX_SYMBOL = 'EURUSD=X';
const MAX_RANGE_TREND_POINTS = 120;
const RETURN_PCT_MIN_BASELINE_EUR = 1;
const INVESTMENT_ACCOUNT_TYPES = new Set([
  'brokerage',
  'crypto_exchange',
  'investment_platform',
  'retirement_plan',
]);
const SAVINGS_ACCOUNT_TYPE = 'savings';

const OVERVIEW_RANGES: OverviewRange[] = ['1W', '1M', 'YTD', '1Y', 'MAX'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const round6 = (value: number) => Number(value.toFixed(6));
const DEGIRO_ACCOUNT_STATEMENT_SOURCE = 'degiro_account_statement';
const DEGIRO_TRANSACTIONS_SOURCE = 'degiro';
const BINANCE_TRANSACTIONS_SOURCE = 'binance';
const COBAS_TRANSACTIONS_SOURCE = 'cobas';

const isInvestmentAccountType = (accountType: string | null | undefined) =>
  accountType !== null &&
  accountType !== undefined &&
  INVESTMENT_ACCOUNT_TYPES.has(accountType);

const isSavingsAccountType = (accountType: string | null | undefined) =>
  accountType === SAVINGS_ACCOUNT_TYPE;

const formatReportMoney = (value: number) => value.toFixed(2);
const formatDateOnly = (value: Date) => value.toISOString().slice(0, 10);

const filenameSafe = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

const startOfUtcMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));

const startOfUtcYear = (year: number) =>
  new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));

const addUtcMonths = (value: Date, months: number) =>
  new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + months,
      1,
      0,
      0,
      0,
      0,
    ),
  );

const normalizePeriodMode = (value: unknown) =>
  value === 'month' || value === 'ytd' ? value : null;

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

  const recordAuditEvent = async (input: {
    entityType: string;
    entityId: string;
    action: string;
    actorType: 'user' | 'system';
    source: string;
    summary: string;
    previous?: Record<string, unknown> | null;
    next?: Record<string, unknown> | null;
    context?: Record<string, unknown> | null;
  }) => {
    await withTimedDb('record_audit_event', async () =>
      db.insert(auditEvents).values({
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorType: input.actorType,
        source: input.source,
        summary: input.summary,
        previousJson: input.previous ?? null,
        nextJson: input.next ?? null,
        contextJson: input.context ?? null,
      }),
    );
  };

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

  const listAssetHoldings = async () => {
    const rows = await withTimedDb('list_asset_holdings', async () => {
      return db.execute(sql`
        select
          asset_id as "assetId",
          coalesce(
            sum(
              case
                when transaction_type = 'buy' then quantity
                when transaction_type = 'sell' then -quantity
                else 0
              end
            ),
            0
          )::numeric as quantity
        from finances.asset_transactions
        group by asset_id
      `);
    });

    return Object.fromEntries(
      rows
        .map((row) => [String(row.assetId), Number(row.quantity ?? 0)] as const)
        .filter(([, quantity]) => Number.isFinite(quantity)),
    );
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
            case
              when a.account_type = ${SAVINGS_ACCOUNT_TYPE}
                then a.opening_balance_eur + coalesce(acm_sum.cash_movement_impact_eur, 0)
              else 0
            end
          )::numeric as "currentCashBalanceEur"
        from finances.accounts a
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
            case
              when a.account_type = ${SAVINGS_ACCOUNT_TYPE}
                then a.opening_balance_eur + coalesce(acm_sum.cash_movement_impact_eur, 0)
              else 0
            end
          )::numeric as cash_balance
        from finances.accounts a
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

  const getAccountById = async (accountId: string) => {
    const rows = await listAccountsWithCash();
    const account = rows.find((row) => row.id === accountId);
    if (!account) {
      return null;
    }
    return {
      ...account,
      accountType: account.accountType as Account['accountType'],
    };
  };

  const resolveAccountPdfPeriod = (query: Record<string, unknown>) => {
    const periodMode = normalizePeriodMode(query.periodMode);
    if (!periodMode) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'periodMode must be "month" or "ytd"',
      );
    }

    const generatedAt = new Date();
    if (periodMode === 'ytd') {
      const year = generatedAt.getUTCFullYear();
      return {
        mode: 'ytd' as const,
        label: `Year to Date ${year}`,
        start: startOfUtcYear(year),
        end: generatedAt,
        generatedAt,
      };
    }

    const year = Number(query.year);
    const month = Number(query.month);
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'month exports require a valid year and month',
      );
    }

    const start = startOfUtcMonth(year, month);
    const end = addUtcMonths(start, 1);
    return {
      mode: 'month' as const,
      label: `${start.toLocaleString('en-US', {
        month: 'long',
        timeZone: 'UTC',
      })} ${year}`,
      start,
      end,
      generatedAt,
    };
  };

  const listUnifiedTransactionsForAccountPeriod = async (
    accountId: string,
    start: Date,
    end: Date,
  ) => {
    const rows = await withTimedDb('list_unified_transactions_pdf', async () => {
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
            (coalesce(a.symbol, a.ticker) || ' - ' || a.name)::text as "assetLabel",
            at.quantity as quantity,
            at.unit_price as "unitPrice",
            case
              when at.transaction_type = 'buy' then -coalesce(at.trade_gross_amount, at.quantity * at.unit_price)
              when at.transaction_type = 'sell' then coalesce(at.trade_gross_amount, at.quantity * at.unit_price)
              when at.transaction_type = 'dividend' then coalesce(at.dividend_net, 0)
              when at.transaction_type = 'fee' then -abs(coalesce(at.fees_amount, 0))
              else 0
            end::numeric as "amountNative",
            at.trade_gross_amount as "tradeGrossAmount",
            at.trade_currency as currency,
            at.fx_rate_to_eur as "fxRateToEur",
            at.cash_impact_eur as "cashImpactEur",
            at.fees_amount as "feesAmount",
            at.fees_currency as "feesCurrency",
            at.fees_amount_eur as "feesAmountEur",
            at.net_amount_eur as "netAmountEur",
            at.linked_transaction_id as "linkedTransactionId",
            at.notes,
            at.external_reference as "externalReference",
            at.source
          from finances.asset_transactions at
          inner join finances.assets a on a.id = at.asset_id
          where at.account_id = ${accountId}
            and at.traded_at >= ${start.toISOString()}
            and at.traded_at < ${end.toISOString()}
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
            coalesce(acm.description, 'Cash movement') as "assetLabel",
            null::numeric as quantity,
            null::numeric as "unitPrice",
            acm.native_amount as "amountNative",
            null::numeric as "tradeGrossAmount",
            acm.currency,
            acm.fx_rate_to_eur as "fxRateToEur",
            acm.cash_impact_eur as "cashImpactEur",
            null::numeric as "feesAmount",
            null::text as "feesCurrency",
            null::numeric as "feesAmountEur",
            null::numeric as "netAmountEur",
            null::uuid as "linkedTransactionId",
            acm.description as notes,
            acm.external_reference as "externalReference",
            acm.source
          from finances.account_cash_movements acm
          where acm.account_id = ${accountId}
            and acm.occurred_at >= ${start.toISOString()}
            and acm.occurred_at < ${end.toISOString()}
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
            : (String(
                row.transactionType,
              ) as UnifiedTransactionRow['transactionType']),
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
        tradeGrossAmount:
          row.tradeGrossAmount === null || row.tradeGrossAmount === undefined
            ? null
            : Number(row.tradeGrossAmount),
        currency: String(row.currency ?? 'EUR'),
        fxRateToEur:
          row.fxRateToEur === null || row.fxRateToEur === undefined
            ? null
            : Number(row.fxRateToEur),
        cashImpactEur: Number(row.cashImpactEur ?? 0),
        feesAmount:
          row.feesAmount === null || row.feesAmount === undefined
            ? null
            : Number(row.feesAmount),
        feesCurrency:
          row.feesCurrency === null || row.feesCurrency === undefined
            ? null
            : String(row.feesCurrency),
        feesAmountEur:
          row.feesAmountEur === null || row.feesAmountEur === undefined
            ? null
            : Number(row.feesAmountEur),
        netAmountEur:
          row.netAmountEur === null || row.netAmountEur === undefined
            ? null
            : Number(row.netAmountEur),
        linkedTransactionId:
          row.linkedTransactionId === null || row.linkedTransactionId === undefined
            ? null
            : String(row.linkedTransactionId),
        notes:
          row.notes === null || row.notes === undefined ? null : String(row.notes),
        externalReference:
          row.externalReference === null || row.externalReference === undefined
            ? null
            : String(row.externalReference),
        source:
          row.source === null || row.source === undefined ? null : String(row.source),
      }),
    );
  };

  const getDailyBalanceAtOrBefore = async (accountId: string, cutoff: Date) => {
    const [row] = await withTimedDb('account_pdf_daily_balance', async () => {
      return db.execute(sql`
        select balance
        from finances.daily_balances
        where account_id = ${accountId}
          and balance_date < ${cutoff.toISOString()}
        order by balance_date desc
        limit 1
      `);
    });
    return row ? Number(row.balance ?? 0) : null;
  };

  const listStatementHoldings = async (accountId: string, end: Date) => {
    const rows = await withTimedDb('account_pdf_holdings', async () => {
      return db.execute(sql`
        select
          at.asset_id as "assetId",
          a.name as "assetName",
          a.asset_type as "assetType",
          coalesce(a.symbol, a.ticker) as symbol,
          coalesce(
            sum(
              case
                when at.transaction_type = 'buy' then at.quantity
                when at.transaction_type = 'sell' then -at.quantity
                else 0
              end
            ),
            0
          )::numeric as quantity
        from finances.asset_transactions at
        inner join finances.assets a on a.id = at.asset_id
        where at.account_id = ${accountId}
          and at.traded_at < ${end.toISOString()}
        group by at.asset_id, a.name, a.asset_type, a.symbol, a.ticker
        having coalesce(
          sum(
            case
              when at.transaction_type = 'buy' then at.quantity
              when at.transaction_type = 'sell' then -at.quantity
              else 0
            end
          ),
          0
        ) > 0
        order by a.name asc
      `);
    });

    return rows.map((row) => ({
      assetLabel: `${String(row.symbol ?? '')} - ${String(row.assetName)}`.trim(),
      assetType: String(row.assetType),
      quantity: Number(row.quantity ?? 0),
    }));
  };

  const summarizeLedgerRows = (rows: UnifiedTransactionRow[]) => {
    const summary = {
      transactionCount: rows.length,
      buyOutflowsEur: 0,
      sellInflowsEur: 0,
      feeTotalEur: 0,
      dividendTotalEur: 0,
      netCashImpactEur: 0,
    };

    for (const row of rows) {
      summary.netCashImpactEur += row.cashImpactEur;
      if (row.rowKind !== 'asset_transaction') {
        continue;
      }
      if (row.transactionType === 'buy') {
        summary.buyOutflowsEur += Math.abs(row.cashImpactEur);
      } else if (row.transactionType === 'sell') {
        summary.sellInflowsEur += Math.max(0, row.cashImpactEur);
      } else if (row.transactionType === 'fee') {
        summary.feeTotalEur += Math.abs(row.feesAmountEur ?? row.cashImpactEur);
      } else if (row.transactionType === 'dividend') {
        summary.dividendTotalEur += Math.max(0, row.cashImpactEur);
      }
    }

    return {
      ...summary,
      netCashImpactEur: round2(summary.netCashImpactEur),
      buyOutflowsEur: round2(summary.buyOutflowsEur),
      sellInflowsEur: round2(summary.sellInflowsEur),
      feeTotalEur: round2(summary.feeTotalEur),
      dividendTotalEur: round2(summary.dividendTotalEur),
    };
  };

  const summarizeStatementRows = (
    rows: UnifiedTransactionRow[],
    balances: { openingBalanceEur: number | null; closingBalanceEur: number | null },
  ) => {
    const summary = {
      transactionCount: rows.length,
      openingBalanceEur: balances.openingBalanceEur,
      closingBalanceEur: balances.closingBalanceEur,
      inflowsEur: 0,
      outflowsEur: 0,
      feesEur: 0,
      dividendsEur: 0,
      netCashImpactEur: 0,
    };

    for (const row of rows) {
      if (row.cashImpactEur >= 0) {
        summary.inflowsEur += row.cashImpactEur;
      } else {
        summary.outflowsEur += Math.abs(row.cashImpactEur);
      }
      summary.netCashImpactEur += row.cashImpactEur;

      if (row.rowKind === 'asset_transaction' && row.transactionType === 'fee') {
        summary.feesEur += Math.abs(row.feesAmountEur ?? row.cashImpactEur);
      }
      if (row.rowKind === 'asset_transaction' && row.transactionType === 'dividend') {
        summary.dividendsEur += Math.max(0, row.cashImpactEur);
      }
    }

    return {
      ...summary,
      inflowsEur: round2(summary.inflowsEur),
      outflowsEur: round2(summary.outflowsEur),
      feesEur: round2(summary.feesEur),
      dividendsEur: round2(summary.dividendsEur),
      netCashImpactEur: round2(summary.netCashImpactEur),
    };
  };

  const createAssetTransactionRecord = async (
    input: CreateAssetTransactionInput,
    options?: {
      cashImpactEurOverride?: number;
      linkedTransactionId?: string | null;
      rowFingerprint?: string | null;
      settlementDate?: string | null;
      rawPayload?: Record<string, unknown> | null;
      source?: string | null;
      skipCashBalanceValidation?: boolean;
    },
  ) => {
    const economics = computeTransactionEconomics(input);
    const tradeCurrency = economics.tradeCurrency;
    const feesCurrency = economics.feesCurrency;

    const [accountRow] = await withTimedDb(
      'asset_tx_account_exists',
      async () => {
        return db
          .select({ id: accounts.id, accountType: accounts.accountType })
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
    if (!isInvestmentAccountType(String(accountRow.accountType))) {
      throw new ApiHttpError(
        400,
        'ACCOUNT_TYPE_NOT_SUPPORTED',
        'Asset transactions are only supported for investment accounts.',
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

    let cashImpactEur = economics.cashImpactEur;
    let netAmountEur = economics.netAmountEur;
    if (options?.cashImpactEurOverride !== undefined) {
      cashImpactEur = round2(options.cashImpactEurOverride);
      netAmountEur =
        input.transactionType === 'dividend'
          ? round2(Math.max(0, cashImpactEur))
          : round2(Math.abs(cashImpactEur));
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
          tradeGrossAmount: economics.tradeGrossAmount.toString(),
          tradeGrossAmountEur: economics.tradeGrossAmountEur.toString(),
          cashImpactEur: round2(cashImpactEur).toString(),
          feesAmount: input.feesAmount.toString(),
          feesCurrency: input.feesAmount > 0 ? feesCurrency : null,
          feesAmountEur: economics.feesAmountEur.toString(),
          netAmountEur: netAmountEur.toString(),
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
          settlementDate: options?.settlementDate ?? null,
          linkedTransactionId: options?.linkedTransactionId ?? null,
          externalReference: input.externalReference ?? null,
          rowFingerprint: options?.rowFingerprint ?? null,
          source: options?.source ?? 'manual',
          notes: input.notes ?? null,
          rawPayload: options?.rawPayload ?? null,
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
    const serialized = serializeAssetTransaction({
      ...(rows[0] as Record<string, unknown>),
      assetType: input.assetType,
    });
    await recordAuditEvent({
      entityType: 'asset_transaction',
      entityId: String(createdId),
      action: 'created',
      actorType: options?.source && options.source !== 'manual' ? 'system' : 'user',
      source: options?.source ?? 'manual',
      summary: `Asset transaction created (${input.transactionType})`,
      next: normalizeAuditJson(serialized),
      context: normalizeAuditJson({
        rowFingerprint: options?.rowFingerprint ?? null,
        linkedTransactionId: options?.linkedTransactionId ?? null,
        settlementDate: options?.settlementDate ?? null,
      }),
    });

    return serialized;
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

  const statementCashMovementType = (
    rowType: DegiroAccountStatementRowType,
  ) => {
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

      const orderRows = row.orderId ? (byOrder.get(row.orderId) ?? []) : [];
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
      return new Map<
        string,
        { id: string; assetType: AssetType; name: string }
      >();
    }
    const rows = await withTimedDb(
      'degiro_statement_assets_by_isin',
      async () =>
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
    const [created] = await withTimedDb(
      'create_account_cash_movement',
      async () =>
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
    const createdId = String(created.id);
    await recordAuditEvent({
      entityType: 'account_cash_movement',
      entityId: createdId,
      action: 'created',
      actorType: input.source && input.source !== 'manual' ? 'system' : 'user',
      source: input.source ?? 'manual',
      summary: `Account cash movement created (${input.movementType})`,
      next: normalizeAuditJson({
        id: createdId,
        accountId: input.accountId,
        movementType: input.movementType,
        occurredAt: input.occurredAt,
        valueDate: input.valueDate,
        nativeAmount: input.nativeAmount,
        currency: normalizeCurrency(input.currency),
        fxRateToEur: input.fxRateToEur,
        cashImpactEur: round2(input.cashImpactEur),
        externalReference: input.externalReference ?? null,
        rowFingerprint: input.rowFingerprint ?? null,
        description: input.description ?? null,
        affectsCashBalance: input.affectsCashBalance,
      }),
      context: normalizeAuditJson({
        rawPayload: input.rawPayload ?? null,
      }),
    });
    return createdId;
  };

  app.get('/finances/accounts', async () => {
    return listAccountsWithCash();
  });

  app.get('/finances/accounts/:id/transaction-ledger.pdf', async ({ params, query }) => {
    if (!UUID_RE.test(params.id)) {
      throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Account id must be a UUID');
    }

    const account = await getAccountById(params.id);
    if (!account) {
      throw new ApiHttpError(404, 'ACCOUNT_NOT_FOUND', 'Account does not exist');
    }

    const period = resolveAccountPdfPeriod(query as Record<string, unknown>);
    const rows = await listUnifiedTransactionsForAccountPeriod(
      account.id,
      period.start,
      period.end,
    );
    const summary = summarizeLedgerRows(rows);
    const bytes = buildAccountTransactionLedgerPdf({
      account,
      period: {
        label: period.label,
        mode: period.mode,
        startIso: period.start.toISOString(),
        endIso: period.end.toISOString(),
        generatedAtIso: period.generatedAt.toISOString(),
      },
      rows,
      summary,
    });

    const filename = `${filenameSafe(account.name)}-${
      period.mode === 'month' ? formatDateOnly(period.start) : 'ytd'
    }-ledger.pdf`;

    return new Response(bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  });

  app.get('/finances/accounts/:id/statement.pdf', async ({ params, query }) => {
    if (!UUID_RE.test(params.id)) {
      throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Account id must be a UUID');
    }

    const account = await getAccountById(params.id);
    if (!account) {
      throw new ApiHttpError(404, 'ACCOUNT_NOT_FOUND', 'Account does not exist');
    }

    const period = resolveAccountPdfPeriod(query as Record<string, unknown>);
    const rows = await listUnifiedTransactionsForAccountPeriod(
      account.id,
      period.start,
      period.end,
    );
    const [openingBalanceEur, closingBalanceEur, holdings] = await Promise.all([
      getDailyBalanceAtOrBefore(account.id, period.start),
      getDailyBalanceAtOrBefore(account.id, period.end),
      listStatementHoldings(account.id, period.end),
    ]);
    const summary = summarizeStatementRows(rows, {
      openingBalanceEur,
      closingBalanceEur,
    });
    const bytes = buildAccountStatementPdf({
      account,
      period: {
        label: period.label,
        mode: period.mode,
        startIso: period.start.toISOString(),
        endIso: period.end.toISOString(),
        generatedAtIso: period.generatedAt.toISOString(),
      },
      rows,
      summary,
      holdings,
    });
    const filename = `${filenameSafe(account.name)}-${
      period.mode === 'month' ? formatDateOnly(period.start) : 'ytd'
    }-statement.pdf`;

    return new Response(bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  });

  app.get('/finances/audit-events', async ({ query }) => {
    const entityType = query.entityType as string | undefined;
    const entityId = query.entityId as string | undefined;
    const limitRaw = Number(query.limit ?? 50);
    if (!Number.isFinite(limitRaw)) {
      throw new ApiHttpError(400, 'VALIDATION_ERROR', 'limit must be a number');
    }
    const limit = Math.max(1, Math.min(200, Math.floor(limitRaw || 50)));

    const filters: Array<ReturnType<typeof eq>> = [];
    if (entityType) {
      filters.push(eq(auditEvents.entityType, entityType));
    }
    if (entityId) {
      if (!UUID_RE.test(entityId)) {
        throw new ApiHttpError(400, 'VALIDATION_ERROR', 'entityId must be a UUID');
      }
      filters.push(eq(auditEvents.entityId, entityId));
    }

    const rows = await withTimedDb('list_audit_events', async () => {
      const queryBuilder = db.select().from(auditEvents);
      if (filters.length === 0) {
        return queryBuilder.orderBy(desc(auditEvents.createdAt)).limit(limit);
      }
      if (filters.length === 1) {
        return queryBuilder
          .where(filters[0] as ReturnType<typeof eq>)
          .orderBy(desc(auditEvents.createdAt))
          .limit(limit);
      }
      return queryBuilder
        .where(and(...filters))
        .orderBy(desc(auditEvents.createdAt))
        .limit(limit);
    });

    return {
      rows: rows.map((row) =>
        serializeFinanceAuditEvent(row as Record<string, unknown>),
      ),
    };
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

    const accountType = parsed.data.accountType;
    const openingBalanceEur = isSavingsAccountType(accountType)
      ? parsed.data.openingBalanceEur
      : 0;

    const createdRows = await withTimedDb('create_account', async () => {
      return db.insert(accounts).values({
        name: parsed.data.name,
        currency: 'EUR',
        baseCurrency: 'EUR',
        openingBalanceEur: openingBalanceEur.toString(),
        accountType,
      }).returning({ id: accounts.id });
    });

    const createdId = String(createdRows[0]?.id ?? '');

    const rows = await listAccountsWithCash();
    const created = rows.find((row) => row.id === createdId);
    if (created) {
      await recordAuditEvent({
        entityType: 'account',
        entityId: created.id,
        action: 'created',
        actorType: 'user',
        source: 'manual',
        summary: `Account created (${created.accountType})`,
        next: normalizeAuditJson(created),
      });
    }
    set.status = 201;
    return created ?? rows[0];
  });

  app.delete('/finances/accounts/:id', async ({ params, set }) => {
    const previousAccounts = await listAccountsWithCash();
    const previous = previousAccounts.find((row) => row.id === params.id) ?? null;
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
    if (previous) {
      await recordAuditEvent({
        entityType: 'account',
        entityId: previous.id,
        action: 'deleted',
        actorType: 'user',
        source: 'manual',
        summary: `Account deleted (${previous.accountType})`,
        previous: normalizeAuditJson(previous),
      });
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
    const hasAccountFilter = accountId !== undefined && UUID_RE.test(accountId);
    const limitRaw = query.limit as string | undefined;
    const cursorRaw = query.cursor as string | undefined;

    let limit: number | null = null;
    if (limitRaw !== undefined) {
      const parsedLimit = Number.parseInt(limitRaw, 10);
      if (
        !Number.isInteger(parsedLimit) ||
        parsedLimit <= 0 ||
        parsedLimit > 500
      ) {
        throw new ApiHttpError(
          400,
          'VALIDATION_ERROR',
          'limit must be an integer between 1 and 500',
        );
      }
      limit = parsedLimit;
    }

    let cursorIso: string | null = null;
    if (cursorRaw !== undefined) {
      const parsedCursor = new Date(cursorRaw);
      if (Number.isNaN(parsedCursor.valueOf())) {
        throw new ApiHttpError(
          400,
          'VALIDATION_ERROR',
          'cursor must be a valid ISO datetime',
        );
      }
      cursorIso = parsedCursor.toISOString();
    }

    const accountFilterAsset = hasAccountFilter
      ? sql`and at.account_id = ${accountId}`
      : sql``;
    const accountFilterCash = hasAccountFilter
      ? sql`and acm.account_id = ${accountId}`
      : sql``;
    const cursorFilterAsset = cursorIso
      ? sql`and at.traded_at < ${cursorIso}`
      : sql``;
    const cursorFilterCash = cursorIso
      ? sql`and acm.occurred_at < ${cursorIso}`
      : sql``;
    const limitSql = limit !== null ? sql`limit ${limit}` : sql``;

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
              when at.transaction_type = 'buy' then -coalesce(at.trade_gross_amount, at.quantity * at.unit_price)
              when at.transaction_type = 'sell' then coalesce(at.trade_gross_amount, at.quantity * at.unit_price)
              when at.transaction_type = 'dividend' then coalesce(at.dividend_net, 0)
              when at.transaction_type = 'fee' then -abs(coalesce(at.fees_amount, 0))
              else 0
            end::numeric as "amountNative",
            at.trade_gross_amount as "tradeGrossAmount",
            at.trade_currency as currency,
            at.fx_rate_to_eur as "fxRateToEur",
            at.cash_impact_eur as "cashImpactEur",
            at.fees_amount as "feesAmount",
            at.fees_currency as "feesCurrency",
            at.fees_amount_eur as "feesAmountEur",
            at.net_amount_eur as "netAmountEur",
            at.linked_transaction_id as "linkedTransactionId",
            at.notes,
            at.external_reference as "externalReference",
            at.source
          from finances.asset_transactions at
          inner join finances.assets a on a.id = at.asset_id
          where 1 = 1
            ${accountFilterAsset}
            ${cursorFilterAsset}
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
            null::numeric as "tradeGrossAmount",
            acm.currency,
            acm.fx_rate_to_eur as "fxRateToEur",
            acm.cash_impact_eur as "cashImpactEur",
            null::numeric as "feesAmount",
            null::text as "feesCurrency",
            null::numeric as "feesAmountEur",
            null::numeric as "netAmountEur",
            null::uuid as "linkedTransactionId",
            acm.description as notes,
            acm.external_reference as "externalReference",
            acm.source
          from finances.account_cash_movements acm
          where 1 = 1
            ${accountFilterCash}
            ${cursorFilterCash}
        )
        select *
        from asset_rows
        union all
        select *
        from cash_rows
        order by "occurredAt" desc, id desc
        ${limitSql}
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
            : (String(
                row.transactionType,
              ) as UnifiedTransactionRow['transactionType']),
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
        tradeGrossAmount:
          row.tradeGrossAmount === null || row.tradeGrossAmount === undefined
            ? null
            : Number(row.tradeGrossAmount),
        currency: String(row.currency ?? 'EUR'),
        fxRateToEur:
          row.fxRateToEur === null || row.fxRateToEur === undefined
            ? null
            : Number(row.fxRateToEur),
        cashImpactEur: Number(row.cashImpactEur ?? 0),
        feesAmount:
          row.feesAmount === null || row.feesAmount === undefined
            ? null
            : Number(row.feesAmount),
        feesCurrency:
          row.feesCurrency === null || row.feesCurrency === undefined
            ? null
            : String(row.feesCurrency),
        feesAmountEur:
          row.feesAmountEur === null || row.feesAmountEur === undefined
            ? null
            : Number(row.feesAmountEur),
        netAmountEur:
          row.netAmountEur === null || row.netAmountEur === undefined
            ? null
            : Number(row.netAmountEur),
        linkedTransactionId:
          row.linkedTransactionId === null ||
          row.linkedTransactionId === undefined
            ? null
            : String(row.linkedTransactionId),
        notes:
          row.notes === null || row.notes === undefined
            ? null
            : String(row.notes),
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

  app.post('/finances/account-cash-movements', async ({ body, set }) => {
    const parsed = createAccountCashMovementInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid account cash movement payload',
        parsed.error.format(),
      );
    }

    const input: CreateAccountCashMovementInput = parsed.data;
    const occurredAt = new Date(input.occurredAt);
    if (Number.isNaN(occurredAt.valueOf())) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'occurredAt must be a valid ISO datetime.',
      );
    }

    const [accountRow] = await withTimedDb(
      'account_cash_movement_account_exists',
      async () => {
        return db
          .select({ id: accounts.id, accountType: accounts.accountType })
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

    if (!isSavingsAccountType(String(accountRow.accountType))) {
      throw new ApiHttpError(
        400,
        'ACCOUNT_TYPE_NOT_SUPPORTED',
        'Manual deposits are only supported for savings accounts.',
      );
    }

    const movementId = await createAccountCashMovementRecord({
      accountId: input.accountId,
      movementType: input.movementType,
      occurredAt: occurredAt.toISOString(),
      valueDate: null,
      nativeAmount: input.nativeAmount,
      currency: input.currency,
      fxRateToEur: null,
      cashImpactEur: round2(input.nativeAmount),
      externalReference: null,
      rowFingerprint: null,
      source: 'manual',
      description: input.notes ?? 'Manual deposit',
      rawPayload: {
        movementType: input.movementType,
      },
      affectsCashBalance: true,
    });

    set.status = 201;
    return { id: movementId };
  });

  app.delete('/finances/asset-transactions/:id', async ({ params, set }) => {
    const previousRows = await withTimedDb('get_asset_transaction_for_delete', async () =>
      db.select().from(assetTransactions).where(eq(assetTransactions.id, params.id)),
    );
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
    const previous = previousRows[0];
    if (previous) {
      await recordAuditEvent({
        entityType: 'asset_transaction',
        entityId: String(previous.id),
        action: 'deleted',
        actorType: 'user',
        source: String(previous.source ?? 'manual'),
        summary: `Asset transaction deleted (${String(previous.transactionType)})`,
        previous: normalizeAuditJson({
          ...(previous as Record<string, unknown>),
          tradedAt: toIso(previous.tradedAt),
          createdAt: toIso(previous.createdAt),
          updatedAt: toIso(previous.updatedAt),
        }),
      });
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
          .select({ id: accounts.id, accountType: accounts.accountType })
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
    if (String(accountRow.accountType) !== 'brokerage') {
      throw new ApiHttpError(
        400,
        'IMPORT_ACCOUNT_TYPE_NOT_SUPPORTED',
        'DEGIRO transactions import is only supported for brokerage accounts.',
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
    const normalizedRows = parsedCsv.rows.filter(
      (row) => row.normalized !== null && row.error === null,
    );
    const uniqueIsins = [
      ...new Set(normalizedRows.map((row) => row.normalized!.isin)),
    ];
    const assetByIsin = new Map<string, { id: string; assetType: AssetType }>();
    if (uniqueIsins.length > 0) {
      const existingAssets = await withTimedDb(
        'degiro_import_asset_lookup_by_isin',
        async () => {
          return db
            .select({
              id: assets.id,
              isin: assets.isin,
              assetType: assets.assetType,
            })
            .from(assets)
            .where(
              sql`${assets.isin} in (${sql.join(
                uniqueIsins.map((isin) => sql`${isin}`),
                sql`, `,
              )})`,
            );
        },
      );
      for (const row of existingAssets) {
        assetByIsin.set(String(row.isin), {
          id: String(row.id),
          assetType: String(row.assetType) as AssetType,
        });
      }
    }
    const missingIsins = uniqueIsins.filter((isin) => !assetByIsin.has(isin));
    if (missingIsins.length > 0) {
      await withTimedDb('degiro_import_mark_failed_unknown_isin', async () => {
        return db
          .update(transactionImports)
          .set({
            totalRows: parsedCsv.rows.length,
            importedRows: 0,
            skippedRows: 0,
            failedRows: parsedCsv.rows.length,
            updatedAt: new Date(),
          })
          .where(eq(transactionImports.id, importRun.id));
      });
      throw new ApiHttpError(
        400,
        'UNKNOWN_ISIN',
        `Unknown ISINs in import: ${missingIsins.join(', ')}`,
        { missingIsins },
      );
    }

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

      const asset = assetByIsin.get(parsedRow.normalized.isin) ?? null;
      if (!asset) {
        failedRows += 1;
        results.push({
          rowNumber: parsedRow.rowNumber,
          status: 'failed',
          reason: `Unknown ISIN: ${parsedRow.normalized.isin}`,
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
          rawPayload: normalizeAuditJson(parsedRow.raw),
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

  app.post('/finances/import/binance-transactions', async ({ body }) => {
    const parsed = binanceImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid Binance import payload',
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
      'binance_import_account_exists',
      async () => {
        return db
          .select({ id: accounts.id, accountType: accounts.accountType })
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
    if (String(accountRow.accountType) !== 'crypto_exchange') {
      throw new ApiHttpError(
        400,
        'IMPORT_ACCOUNT_TYPE_NOT_SUPPORTED',
        'Binance import is only supported for exchange accounts.',
      );
    }

    const fileHash = await sha256Hex(parsed.data.csvText);
    const [importRun] = await withTimedDb(
      'binance_create_import_run',
      async () => {
        return db
          .insert(transactionImports)
          .values({
            source: BINANCE_TRANSACTIONS_SOURCE,
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

    let parsedCsv: ReturnType<typeof parseBinanceTransactionsCsv>;
    try {
      parsedCsv = parseBinanceTransactionsCsv(parsed.data.csvText);
    } catch (error) {
      await withTimedDb('binance_import_mark_failed_parse', async () => {
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
        'UNSUPPORTED_BINANCE_CSV',
        error instanceof Error
          ? error.message
          : 'Unsupported Binance CSV format.',
      );
    }

    const readyRows = parsedCsv.rows.filter(
      (row) => row.status === 'ready' && row.normalized !== null,
    );
    const symbols = [
      ...new Set(readyRows.map((row) => row.normalized!.assetSymbol)),
    ];
    const symbolLookup = new Map<
      string,
      { id: string; assetType: AssetType }
    >();

    if (symbols.length > 0) {
      const assetRows = await withTimedDb(
        'binance_import_asset_lookup_symbols',
        async () => {
          return db.execute(sql`
            select
              id,
              asset_type as "assetType",
              upper(coalesce(symbol, '')) as symbol,
              upper(coalesce(ticker, '')) as ticker
            from finances.assets
            where asset_type = 'crypto'
              and (
                upper(coalesce(symbol, '')) in (${sql.join(
                  symbols.map((symbol) => sql`${symbol}`),
                  sql`, `,
                )})
                or upper(coalesce(ticker, '')) in (${sql.join(
                  symbols.map((symbol) => sql`${symbol}`),
                  sql`, `,
                )})
              )
          `);
        },
      );

      for (const row of assetRows) {
        const entry = {
          id: String(row.id),
          assetType: String(row.assetType) as AssetType,
        };
        const symbol = String(row.symbol ?? '');
        const ticker = String(row.ticker ?? '');
        if (symbol) {
          symbolLookup.set(symbol, entry);
        }
        if (ticker) {
          symbolLookup.set(ticker, entry);
        }
      }
    }

    const missingSymbols = symbols.filter(
      (symbol) => !symbolLookup.has(symbol),
    );
    if (missingSymbols.length > 0) {
      await withTimedDb(
        'binance_import_mark_failed_unknown_symbols',
        async () => {
          return db
            .update(transactionImports)
            .set({
              totalRows: parsedCsv.rows.length,
              importedRows: 0,
              skippedRows: 0,
              failedRows: parsedCsv.rows.length,
              updatedAt: new Date(),
            })
            .where(eq(transactionImports.id, importRun.id));
        },
      );
      throw new ApiHttpError(
        400,
        'UNKNOWN_ASSET_SYMBOL',
        `Unknown asset symbols in import: ${missingSymbols.join(', ')}`,
        { missingSymbols },
      );
    }

    const results: BinanceImportResult['results'] = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    for (const row of parsedCsv.rows) {
      if (row.status === 'skipped') {
        skippedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'skipped',
          reason: row.reason ?? 'Skipped row.',
          externalReference: row.raw.orderNo || null,
          assetId: null,
          transactionId: null,
        });
        continue;
      }

      if (!row.normalized || row.status === 'failed') {
        failedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          reason: row.reason ?? 'Invalid row.',
          externalReference: row.raw.orderNo || null,
          assetId: null,
          transactionId: null,
        });
        continue;
      }

      const asset = symbolLookup.get(row.normalized.assetSymbol) ?? null;
      if (!asset) {
        failedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          reason: `Unknown asset symbol: ${row.normalized.assetSymbol}`,
          externalReference: row.normalized.externalReference,
          assetId: null,
          transactionId: null,
        });
        continue;
      }

      const [existingTx] = await withTimedDb(
        'binance_import_dedupe_ref',
        async () => {
          return db
            .select({ id: assetTransactions.id })
            .from(assetTransactions)
            .where(
              and(
                eq(assetTransactions.accountId, parsed.data.accountId),
                eq(
                  assetTransactions.externalReference,
                  row.normalized?.externalReference ?? '',
                ),
              ),
            );
        },
      );

      if (existingTx) {
        skippedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'skipped',
          reason: 'Duplicate external reference for this account.',
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: String(existingTx.id),
        });
        continue;
      }

      const payload: CreateAssetTransactionInput = {
        accountId: parsed.data.accountId,
        assetId: asset.id,
        assetType: 'crypto',
        transactionType: row.normalized.transactionType,
        tradedAt: row.normalized.tradedAt,
        quantity: row.normalized.quantity,
        unitPrice: row.normalized.unitPrice,
        tradeCurrency: 'EUR',
        fxRateToEur: null,
        feesAmount: 0,
        feesCurrency: 'EUR',
        externalReference: row.normalized.externalReference,
        notes: `Imported from Binance CSV (${parsed.data.fileName}).`,
      };

      const validation = createAssetTransactionInputSchema.safeParse(payload);
      if (!validation.success) {
        failedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          reason: 'Normalized row failed validation.',
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
        continue;
      }

      if (parsed.data.dryRun) {
        skippedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'skipped',
          reason: 'Dry run: row validated but not inserted.',
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
        continue;
      }

      try {
        const cashImpactEurOverride =
          row.normalized.transactionType === 'buy'
            ? -Math.abs(row.normalized.tradingTotalEur)
            : Math.abs(row.normalized.tradingTotalEur);

        const created = await createAssetTransactionRecord(validation.data, {
          cashImpactEurOverride: round2(cashImpactEurOverride),
          rawPayload: normalizeAuditJson(row.raw),
          source: BINANCE_TRANSACTIONS_SOURCE,
        });
        importedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'imported',
          reason: null,
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: created.id,
        });
      } catch (error) {
        failedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to create transaction.',
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
      }
    }

    if (results.length > 0) {
      await withTimedDb('binance_import_rows_insert', async () => {
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

    await withTimedDb('binance_import_run_finalize', async () => {
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
      source: BINANCE_TRANSACTIONS_SOURCE,
      fileName: parsed.data.fileName,
      fileHash,
      dryRun: parsed.data.dryRun,
      totalRows: parsedCsv.rows.length,
      importedRows,
      skippedRows,
      failedRows,
      results,
    } satisfies BinanceImportResult;
  });

  app.post('/finances/import/cobas-transactions', async ({ body }) => {
    const parsed = cobasImportRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid COBAS import payload',
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
      'cobas_import_account_exists',
      async () => {
        return db
          .select({ id: accounts.id, accountType: accounts.accountType })
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
    if (String(accountRow.accountType) !== 'investment_platform') {
      throw new ApiHttpError(
        400,
        'IMPORT_ACCOUNT_TYPE_NOT_SUPPORTED',
        'COBAS import is only supported for investment fund accounts.',
      );
    }

    const fileHash = await sha256Hex(parsed.data.csvText);
    const [importRun] = await withTimedDb(
      'cobas_create_import_run',
      async () => {
        return db
          .insert(transactionImports)
          .values({
            source: COBAS_TRANSACTIONS_SOURCE,
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

    let parsedCsv: ReturnType<typeof parseCobasTransactionsCsv>;
    try {
      parsedCsv = parseCobasTransactionsCsv(parsed.data.csvText);
    } catch (error) {
      await withTimedDb('cobas_import_mark_failed_parse', async () => {
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
        'UNSUPPORTED_COBAS_CSV',
        error instanceof Error
          ? error.message
          : 'Unsupported COBAS CSV format.',
      );
    }

    const readyRows = parsedCsv.rows.filter(
      (row) => row.status === 'ready' && row.normalized !== null,
    );
    const symbolHints = [
      ...new Set(readyRows.map((row) => row.normalized!.symbolHint)),
    ];

    const symbolMatches = new Map<
      string,
      { id: string; assetType: AssetType }[]
    >();
    if (symbolHints.length > 0) {
      const assetRows = await withTimedDb(
        'cobas_import_asset_lookup_symbols',
        async () => {
          return db.execute(sql`
            select
              id,
              asset_type as "assetType",
              upper(coalesce(symbol, '')) as symbol,
              upper(coalesce(ticker, '')) as ticker
            from finances.assets
            where upper(coalesce(symbol, '')) in (${sql.join(
              symbolHints.map((symbol) => sql`${symbol}`),
              sql`, `,
            )})
            or upper(coalesce(ticker, '')) in (${sql.join(
              symbolHints.map((symbol) => sql`${symbol}`),
              sql`, `,
            )})
          `);
        },
      );

      for (const hint of symbolHints) {
        symbolMatches.set(hint, []);
      }
      for (const row of assetRows) {
        const entry = {
          id: String(row.id),
          assetType: String(row.assetType) as AssetType,
        };
        const symbol = String(row.symbol ?? '');
        const ticker = String(row.ticker ?? '');
        for (const key of [symbol, ticker]) {
          if (!key || !symbolMatches.has(key)) {
            continue;
          }
          const current = symbolMatches.get(key) ?? [];
          if (!current.some((item) => item.id === entry.id)) {
            current.push(entry);
            symbolMatches.set(key, current);
          }
        }
      }
    }

    const missingSymbols = symbolHints.filter(
      (hint) => (symbolMatches.get(hint) ?? []).length === 0,
    );
    const ambiguousSymbols = symbolHints.filter(
      (hint) => (symbolMatches.get(hint) ?? []).length > 1,
    );

    if (missingSymbols.length > 0 || ambiguousSymbols.length > 0) {
      await withTimedDb('cobas_import_mark_failed_symbols', async () => {
        return db
          .update(transactionImports)
          .set({
            totalRows: parsedCsv.rows.length,
            importedRows: 0,
            skippedRows: 0,
            failedRows: parsedCsv.rows.length,
            updatedAt: new Date(),
          })
          .where(eq(transactionImports.id, importRun.id));
      });

      if (missingSymbols.length > 0) {
        throw new ApiHttpError(
          400,
          'UNKNOWN_ASSET_SYMBOL',
          `Unknown asset symbols in import: ${missingSymbols.join(', ')}`,
          { missingSymbols },
        );
      }

      throw new ApiHttpError(
        400,
        'AMBIGUOUS_ASSET_SYMBOL',
        `Ambiguous asset symbols in import: ${ambiguousSymbols.join(', ')}`,
        { ambiguousSymbols },
      );
    }

    const results: CobasImportResult['results'] = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;

    for (const row of parsedCsv.rows) {
      if (row.status === 'skipped') {
        skippedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'skipped',
          reason: row.reason ?? 'Skipped row.',
          externalReference: row.raw.operation || null,
          assetId: null,
          transactionId: null,
        });
        continue;
      }

      if (row.status === 'failed' || !row.normalized) {
        failedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          reason: row.reason ?? 'Invalid row.',
          externalReference: row.raw.operation || null,
          assetId: null,
          transactionId: null,
        });
        continue;
      }

      const matched = symbolMatches.get(row.normalized.symbolHint) ?? [];
      const asset = matched[0] ?? null;
      if (!asset) {
        failedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          reason: `Unknown asset symbol: ${row.normalized.symbolHint}`,
          externalReference: row.normalized.externalReference,
          assetId: null,
          transactionId: null,
        });
        continue;
      }

      const [existingTx] = await withTimedDb(
        'cobas_import_dedupe_ref',
        async () => {
          return db
            .select({ id: assetTransactions.id })
            .from(assetTransactions)
            .where(
              and(
                eq(assetTransactions.accountId, parsed.data.accountId),
                eq(
                  assetTransactions.externalReference,
                  row.normalized?.externalReference ?? '',
                ),
              ),
            );
        },
      );

      if (existingTx) {
        skippedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'skipped',
          reason: 'Duplicate external reference for this account.',
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: String(existingTx.id),
        });
        continue;
      }

      const payload: CreateAssetTransactionInput = {
        accountId: parsed.data.accountId,
        assetId: asset.id,
        assetType: asset.assetType,
        transactionType: 'buy',
        tradedAt: row.normalized.tradedAt,
        quantity: row.normalized.quantity,
        unitPrice: row.normalized.unitPrice,
        tradeCurrency: 'EUR',
        fxRateToEur: null,
        feesAmount: row.normalized.feesAmount,
        feesCurrency: 'EUR',
        externalReference: row.normalized.externalReference,
        notes: `Imported from COBAS CSV (${parsed.data.fileName}).`,
      };

      const validation = createAssetTransactionInputSchema.safeParse(payload);
      if (!validation.success) {
        failedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          reason: 'Normalized row failed validation.',
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
        continue;
      }

      if (parsed.data.dryRun) {
        skippedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'skipped',
          reason: 'Dry run: row validated but not inserted.',
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
        continue;
      }

      try {
        const created = await createAssetTransactionRecord(validation.data, {
          cashImpactEurOverride: -Math.abs(row.normalized.netAmountEur),
          rawPayload: normalizeAuditJson(row.raw),
          source: COBAS_TRANSACTIONS_SOURCE,
        });
        importedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'imported',
          reason: null,
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: created.id,
        });
      } catch (error) {
        failedRows += 1;
        results.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to create transaction.',
          externalReference: row.normalized.externalReference,
          assetId: asset.id,
          transactionId: null,
        });
      }
    }

    if (results.length > 0) {
      await withTimedDb('cobas_import_rows_insert', async () => {
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
              parsedCsv.rows.find(
                (entry) => entry.rowNumber === result.rowNumber,
              )?.raw ?? {},
          })),
        );
      });
    }

    await withTimedDb('cobas_import_run_finalize', async () => {
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
      source: COBAS_TRANSACTIONS_SOURCE,
      fileName: parsed.data.fileName,
      fileHash,
      dryRun: parsed.data.dryRun,
      totalRows: parsedCsv.rows.length,
      importedRows,
      skippedRows,
      failedRows,
      results,
    } satisfies CobasImportResult;
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
      const parsedCsv = await parseDegiroAccountStatementCsv(
        parsed.data.csvText,
      );
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
      const previewRows: DegiroAccountStatementAnalyzeResult['previewRows'] =
        [];
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
      const parsedCsv = await parseDegiroAccountStatementCsv(
        parsed.data.csvText,
      );
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
        const [existing] = await withTimedDb(
          'degiro_statement_linked_trade',
          async () =>
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
            settlementDate: toNullableDate(row.date),
            rawPayload: normalizeAuditJson(row),
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
            settlementDate: toNullableDate(row.date),
            rawPayload: normalizeAuditJson(row),
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
              error instanceof Error
                ? error.message
                : 'Failed to import fee row.',
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
        const ordered = [...groupRows].sort(
          (a, b) => a.rowNumber - b.rowNumber,
        );
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
            settlementDate: toNullableDate(first.date),
            rawPayload: normalizeAuditJson({
              rows: ordered,
              groupFingerprint,
            }),
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

      const failedMissing = results.filter(
        (row) => row.status === 'failed',
      ).length;
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

  const loadTaxYearlySummary = async (year: number): Promise<TaxYearlySummary> => {
    const from = new Date(`${year}-01-01T00:00:00.000Z`);
    const to = new Date(`${year + 1}-01-01T00:00:00.000Z`);
    const fromIsoBound = from.toISOString();
    const toIsoBound = to.toISOString();

    const rows = await withTimedDb('tax_yearly_rows', async () => {
      return db.execute(sql`
        select
          at.id,
          at.account_id as "accountId",
          acc.name as "accountName",
          at.asset_id as "assetId",
          a.name as "assetName",
          a.ticker as "assetTicker",
          a.isin as "assetIsin",
          at.transaction_type as "transactionType",
          at.traded_at as "tradedAt",
          at.quantity,
          at.unit_price as "unitPrice",
          at.trade_currency as "tradeCurrency",
          at.fx_rate_to_eur as "fxRateToEur",
          at.trade_gross_amount as "tradeGrossAmount",
          at.trade_gross_amount_eur as "tradeGrossAmountEur",
          at.fees_amount as "feesAmount",
          at.fees_currency as "feesCurrency",
          at.fees_amount_eur as "feesAmountEur",
          at.net_amount_eur as "netAmountEur",
          at.dividend_gross as "dividendGross",
          at.withholding_tax as "withholdingTax",
          at.dividend_net as "dividendNet",
          at.external_reference as "externalReference",
          at.source
        from finances.asset_transactions at
        inner join finances.assets a on a.id = at.asset_id
        inner join finances.accounts acc on acc.id = at.account_id
        where at.traded_at >= ${fromIsoBound}::timestamptz
          and at.traded_at < ${toIsoBound}::timestamptz
        order by at.asset_id asc, at.traded_at asc, at.created_at asc
      `);
    });

    type Lot = { quantity: number; unitCostEur: number };

    const lotsByAsset = new Map<string, Lot[]>();
    const realizedRows: TaxYearlySummary['operations']['detailedRows'] = [];
    const dividendRows: TaxYearlySummary['operations']['dividendRows'] = [];

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
      const tradeGrossAmount = Number(row.tradeGrossAmount ?? quantity * unitPrice);
      const tradeGrossAmountEur = Number(
        row.tradeGrossAmountEur ??
          convertToEur(tradeGrossAmount, tradeCurrency, fxRateToEur),
      );
      const feesAmountEur = Number(
        row.feesAmountEur ?? convertToEur(feesAmount, feesCurrency, fxRateToEur),
      );
      const netAmountEur = Number(
        row.netAmountEur ??
          (transactionType === 'buy'
            ? tradeGrossAmountEur + feesAmountEur
            : transactionType === 'sell'
              ? tradeGrossAmountEur - feesAmountEur
              : transactionType === 'fee'
                ? feesAmountEur
                : convertToEur(
                    Number(row.dividendNet ?? 0),
                    tradeCurrency,
                    fxRateToEur,
                  )),
      );

      const lots = lotsByAsset.get(assetId) ?? [];

      if (transactionType === 'buy') {
        const lotUnitCost = quantity > 0 ? netAmountEur / quantity : 0;
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

        const proceedsEur = round2(netAmountEur);
        const realized = round2(proceedsEur - costBasisEur);
        realizedGainLossEur += realized;

        realizedRows.push({
          transactionId: String(row.id),
          tradedAt: toIso(row.tradedAt),
          assetId,
          assetTicker: String(row.assetTicker),
          assetName: String(row.assetName),
          assetIsin: String(row.assetIsin),
          accountId: String(row.accountId),
          accountName: String(row.accountName),
          quantitySold: quantity,
          tradeCurrency,
          fxRateToEur,
          tradeGrossAmount: round6(tradeGrossAmount),
          tradeGrossAmountEur: round2(tradeGrossAmountEur),
          feesAmount: round6(feesAmount),
          feesCurrency,
          feesAmountEur: round2(feesAmountEur),
          proceedsEur,
          costBasisEur: round2(costBasisEur),
          realizedGainLossEur: realized,
          externalReference:
            row.externalReference === null || row.externalReference === undefined
              ? null
              : String(row.externalReference),
          source: row.source === null || row.source === undefined ? null : String(row.source),
        });

        lotsByAsset.set(assetId, lots);
      }

      if (transactionType === 'dividend') {
        const gross = Number(row.dividendGross ?? 0);
        const withholding = Number(row.withholdingTax ?? 0);
        const net = Number(row.dividendNet ?? 0);

        const grossEur = round2(convertToEur(gross, tradeCurrency, fxRateToEur));
        const withholdingEur = round2(
          convertToEur(withholding, tradeCurrency, fxRateToEur),
        );
        const netEur = round2(convertToEur(net, tradeCurrency, fxRateToEur));

        dividendsGrossEur += grossEur;
        dividendsWithholdingEur += withholdingEur;
        dividendsNetEur += netEur;

        dividendRows.push({
          transactionId: String(row.id),
          tradedAt: toIso(row.tradedAt),
          assetId,
          assetTicker: String(row.assetTicker),
          assetName: String(row.assetName),
          assetIsin: String(row.assetIsin),
          accountId: String(row.accountId),
          accountName: String(row.accountName),
          tradeCurrency,
          fxRateToEur,
          dividendGross: round6(gross),
          withholdingTax: round6(withholding),
          dividendNet: round6(net),
          grossEur,
          withholdingEur,
          netEur,
          externalReference:
            row.externalReference === null || row.externalReference === undefined
              ? null
              : String(row.externalReference),
          source: row.source === null || row.source === undefined ? null : String(row.source),
        });
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
        dividends: dividendRows.length,
        detailedRows: realizedRows,
        dividendRows,
      },
    };
  };

  const buildTaxReportLines = (summary: TaxYearlySummary) => {
    const lines = [
      `Second Brain Hacienda Report ${summary.year}`,
      `Generated UTC ${new Date().toISOString()}`,
      '',
      `Realized gain/loss EUR: ${formatReportMoney(summary.realizedGainLossEur)}`,
      `Dividends gross EUR: ${formatReportMoney(summary.dividendsGrossEur)}`,
      `Dividends withholding EUR: ${formatReportMoney(summary.dividendsWithholdingEur)}`,
      `Dividends net EUR: ${formatReportMoney(summary.dividendsNetEur)}`,
      '',
      `Realized sell operations: ${summary.operations.sells}`,
    ];

    for (const row of summary.operations.detailedRows) {
      lines.push(
        `SELL ${row.tradedAt.slice(0, 10)} | ${row.assetTicker} | ${row.quantitySold} | Gross ${formatReportMoney(row.tradeGrossAmount)} ${row.tradeCurrency} | Fees ${formatReportMoney(row.feesAmount)} ${row.feesCurrency ?? row.tradeCurrency} | Proceeds EUR ${formatReportMoney(row.proceedsEur)} | Cost EUR ${formatReportMoney(row.costBasisEur)} | Gain/Loss EUR ${formatReportMoney(row.realizedGainLossEur)} | FX ${row.fxRateToEur ?? 'n/a'} | Ref ${row.externalReference ?? '-'} | Source ${row.source ?? '-'}`,
      );
      lines.push(`  Asset: ${row.assetName} | ISIN: ${row.assetIsin} | Account: ${row.accountName}`);
    }

    lines.push('', `Dividend operations: ${summary.operations.dividends}`);

    for (const row of summary.operations.dividendRows) {
      lines.push(
        `DIV ${row.tradedAt.slice(0, 10)} | ${row.assetTicker} | Gross ${formatReportMoney(row.dividendGross)} ${row.tradeCurrency} | Withholding ${formatReportMoney(row.withholdingTax)} ${row.tradeCurrency} | Net ${formatReportMoney(row.dividendNet)} ${row.tradeCurrency} | Gross EUR ${formatReportMoney(row.grossEur)} | Net EUR ${formatReportMoney(row.netEur)} | FX ${row.fxRateToEur ?? 'n/a'} | Ref ${row.externalReference ?? '-'} | Source ${row.source ?? '-'}`,
      );
      lines.push(`  Asset: ${row.assetName} | ISIN: ${row.assetIsin} | Account: ${row.accountName}`);
    }

    return lines;
  };

  app.get('/finances/tax/yearly-summary', async ({ query }) => {
    const yearRaw = Number(query.year ?? new Date().getUTCFullYear());
    const year = Number.isFinite(yearRaw)
      ? Math.max(2000, Math.min(2100, Math.trunc(yearRaw)))
      : new Date().getUTCFullYear();
    return loadTaxYearlySummary(year);
  });

  app.get('/finances/tax/yearly-report.pdf', async ({ query }) => {
    const yearRaw = Number(query.year ?? new Date().getUTCFullYear());
    const year = Number.isFinite(yearRaw)
      ? Math.max(2000, Math.min(2100, Math.trunc(yearRaw)))
      : new Date().getUTCFullYear();
    const summary = await loadTaxYearlySummary(year);
    const bytes = renderPlainTextPdf(buildTaxReportLines(summary), {
      title: `Hacienda Report ${year}`,
    });

    return new Response(bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="finances-tax-report-${year}.pdf"`,
      },
    });
  });

  app.get('/finances/assets', async ({ query }) => {
    const type = query.type as string | undefined;
    const activeRaw = query.active as string | boolean | undefined;
    const includeHoldingsRaw = query.includeHoldings as
      | string
      | boolean
      | undefined;
    const filters: { type?: string; active?: boolean } = {};
    if (type) {
      filters.type = type;
    }
    if (activeRaw !== undefined) {
      filters.active = String(activeRaw).toLowerCase() === 'true';
    }
    const includeHoldings =
      includeHoldingsRaw !== undefined &&
      String(includeHoldingsRaw).toLowerCase() === 'true';

    const rows = await listAssetViews(filters);
    if (!includeHoldings) {
      return rows;
    }

    const holdingsByAssetId = await listAssetHoldings();
    return {
      rows,
      holdingsByAssetId,
    };
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
    const normalizedProviderSymbol = parsed.data.providerSymbol
      ?.trim()
      .toUpperCase();
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

    if (parsed.data.assetType === 'crypto') {
      const existingCryptoAssets = await withTimedDb(
        'create_asset_crypto_duplicate_check',
        async () =>
          db
            .select({
              id: assets.id,
              name: assets.name,
              isActive: assets.isActive,
              symbol: assets.symbol,
              ticker: assets.ticker,
              providerSymbol: assets.providerSymbol,
            })
            .from(assets)
            .where(eq(assets.assetType, 'crypto')),
      );

      const duplicateAsset = existingCryptoAssets.find((row) => {
        const rowSymbol = String(row.symbol ?? '')
          .trim()
          .toUpperCase();
        const rowTicker = String(row.ticker ?? '')
          .trim()
          .toUpperCase();
        const rowProviderSymbol = String(row.providerSymbol ?? '')
          .trim()
          .toUpperCase();

        return (
          rowTicker === normalizedTicker ||
          (normalizedSymbol ? rowSymbol === normalizedSymbol : false) ||
          (normalizedProviderSymbol
            ? rowProviderSymbol === normalizedProviderSymbol
            : false)
        );
      });

      if (duplicateAsset) {
        throw new ApiHttpError(
          409,
          'ASSET_ALREADY_EXISTS',
          duplicateAsset.isActive
            ? `Crypto asset already exists (${duplicateAsset.name}).`
            : `Crypto asset already exists but is inactive (${duplicateAsset.name}). Reactivate it from Assets table.`,
          {
            assetId: String(duplicateAsset.id),
            isActive: Boolean(duplicateAsset.isActive),
          },
        );
      }
    }

    let insertedAssets: Array<{ id: string }> = [];
    try {
      insertedAssets = await withTimedDb('create_asset', async () => {
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
            providerSymbol: normalizedProviderSymbol || null,
            currency: parsed.data.currency.toUpperCase(),
            notes: normalizedNotes || null,
          })
          .returning({ id: assets.id });
      });
    } catch (error) {
      const dbCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      if (dbCode === '23505') {
        throw new ApiHttpError(
          409,
          'ASSET_ALREADY_EXISTS',
          'Asset already exists with the same ISIN, ticker, or symbol.',
        );
      }
      throw error;
    }

    const [assetRow] = insertedAssets;
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

    if (created) {
      await recordAuditEvent({
        entityType: 'asset',
        entityId: created.id,
        action: 'created',
        actorType: 'user',
        source: 'manual',
        summary: `Asset created (${created.assetType})`,
        next: normalizeAuditJson(created),
      });
    }

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

    const previous = (
      await listAssetViews().then((rows) =>
        rows.filter((row) => row.id === params.id),
      )
    )[0] ?? null;

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
    if (updated) {
      await recordAuditEvent({
        entityType: 'asset',
        entityId: updated.id,
        action: 'updated',
        actorType: 'user',
        source: 'manual',
        summary: 'Asset metadata updated',
        previous: normalizeAuditJson(previous),
        next: normalizeAuditJson(updated),
      });
    }
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

    const previousAssetView = (
      await listAssetViews().then((rows) =>
        rows.filter((row) => row.id === params.id),
      )
    )[0] ?? null;

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
    if (updated) {
      await recordAuditEvent({
        entityType: 'asset_position',
        entityId: params.id,
        action: existing ? 'updated' : 'created',
        actorType: 'user',
        source: 'manual',
        summary: existing ? 'Asset position updated' : 'Asset position created',
        previous: normalizeAuditJson(previousAssetView?.position ?? null),
        next: normalizeAuditJson(updated.position ?? null),
        context: normalizeAuditJson({
          asset: {
            id: updated.id,
            name: updated.name,
            assetType: updated.assetType,
          },
        }),
      });
    }
    return updated;
  });

  app.delete('/finances/assets/:id', async ({ params, set }) => {
    const previous = (
      await listAssetViews().then((rows) =>
        rows.filter((row) => row.id === params.id),
      )
    )[0] ?? null;
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
    if (previous) {
      await recordAuditEvent({
        entityType: 'asset',
        entityId: previous.id,
        action: 'archived',
        actorType: 'user',
        source: 'manual',
        summary: 'Asset archived',
        previous: normalizeAuditJson(previous),
        next: normalizeAuditJson({
          ...previous,
          isActive: false,
        }),
      });
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
          select
            id,
            name,
            account_type as "accountType",
            opening_balance_eur as "openingBalanceEur"
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
      const selectedAccount =
        selectedAccountId === 'all'
          ? null
          : (accountRows.find((row) => String(row.id) === selectedAccountId) ??
            null);
      const selectedAccountType =
        selectedAccount === null ? null : String(selectedAccount.accountType);
      const includeInvestmentData =
        selectedAccountId === 'all' ||
        isInvestmentAccountType(selectedAccountType);
      const includeSavingsCashData =
        selectedAccountId === 'all' ||
        isSavingsAccountType(selectedAccountType);

      const filteredSavingsRows =
        selectedAccountId === 'all'
          ? accountRows.filter((row) =>
              isSavingsAccountType(String(row.accountType)),
            )
          : selectedAccount &&
              isSavingsAccountType(String(selectedAccount.accountType))
            ? [selectedAccount]
            : [];
      const openingCash = filteredSavingsRows.reduce(
        (sum, row) => sum + Number(row.openingBalanceEur ?? 0),
        0,
      );

      const txRows = await withTimedDb('overview_transactions', async () => {
        if (!includeInvestmentData) {
          return [];
        }
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
            inner join finances.accounts acc on acc.id = at.account_id
            inner join finances.assets a on a.id = at.asset_id
            where acc.account_type in (
              'brokerage',
              'crypto_exchange',
              'investment_platform',
              'retirement_plan'
            )
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
          if (!includeSavingsCashData) {
            return [];
          }
          if (selectedAccountId === 'all') {
            return db.execute(sql`
              select
                account_id as "accountId",
                occurred_at as "occurredAt",
                movement_type as "movementType",
                cash_impact_eur as "cashImpactEur"
              from finances.account_cash_movements acm
              inner join finances.accounts a on a.id = acm.account_id
              where affects_cash_balance = true
                and a.account_type = ${SAVINGS_ACCOUNT_TYPE}
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
      const rangeFloorTimestampMs = minTransactionTimestampMs ?? minTimestampMs;

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
      const rangeStart = clampRangeStart(range, now, rangeFloorTimestampMs);
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

      const normalizeIndexSeries = (values: number[]) => {
        if (values.length <= MAX_RANGE_TREND_POINTS) {
          return values;
        }
        const result: number[] = [];
        const lastIndex = values.length - 1;
        const step = lastIndex / (MAX_RANGE_TREND_POINTS - 1);
        for (let index = 0; index < MAX_RANGE_TREND_POINTS; index += 1) {
          result.push(
            values[Math.round(step * index)] ?? values[lastIndex] ?? 100,
          );
        }
        return result;
      };

      const rangePriceIndex = (
        symbol: string,
        startTsMs: number,
        endTsMs: number,
      ): number[] => {
        const list = pricesBySymbol.get(symbol);
        if (!list || list.length === 0) {
          return [];
        }
        const inRangePoints = list
          .filter(
            (point) =>
              point.pricedAtMs >= startTsMs && point.pricedAtMs <= endTsMs,
          )
          .sort((a, b) => a.pricedAtMs - b.pricedAtMs);

        const baseline =
          inRangePoints[0]?.price ??
          priceAtOrBefore(symbol, startTsMs) ??
          priceAtOrAfter(symbol, startTsMs);
        if (baseline === null || baseline <= 0) {
          return [];
        }

        const endpointPrice = priceAtOrBefore(symbol, endTsMs);

        const dedupedByTimestamp = new Map<number, number>();
        if (inRangePoints.length === 0) {
          dedupedByTimestamp.set(startTsMs, baseline);
        }
        for (const point of inRangePoints) {
          dedupedByTimestamp.set(point.pricedAtMs, point.price);
        }
        if (endpointPrice !== null && endpointPrice > 0) {
          dedupedByTimestamp.set(endTsMs, endpointPrice);
        }

        const normalizedPoints = [...dedupedByTimestamp.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, price]) => round6((price / baseline) * 100));

        return normalizeIndexSeries(normalizedPoints);
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

      const valuationSeries = rangePointTimes.map((tsMs) => ({
        tsMs,
        totalValue: portfolioTotalAt(tsMs, true),
      }));
      const totalValue =
        valuationSeries[valuationSeries.length - 1]?.totalValue ??
        portfolioTotalAt(asOfMs, true);
      const baselineTotalValue = valuationSeries[0]?.totalValue ?? totalValue;

      const flowEvents = [
        ...tx
          .filter(
            (row) =>
              row.transactionType === 'buy' || row.transactionType === 'sell',
          )
          .map((row) => ({
            tsMs: row.tradedAtMs,
            // Investment account cash is not part of overview valuation, so
            // trades are normalized as external flows.
            amount: -row.cashImpactEur,
          })),
        ...cashMovements.map((row) => ({
          tsMs: row.occurredAtMs,
          amount: row.cashImpactEur,
        })),
      ]
        .filter(
          (event) =>
            Number.isFinite(event.tsMs) && Number.isFinite(event.amount),
        )
        .sort((a, b) => a.tsMs - b.tsMs);

      let flowCursor = 0;
      let cumulativeNetFlow = 0;
      let cumulativeReturnFactor = 1;
      const series = valuationSeries.map((point, index) => {
        if (index === 0) {
          return {
            tsIso: new Date(point.tsMs).toISOString(),
            marketIndex: 100,
            totalValue: point.totalValue,
          };
        }

        const prevPoint = valuationSeries[index - 1];
        if (!prevPoint) {
          return {
            tsIso: new Date(point.tsMs).toISOString(),
            marketIndex: 100,
            totalValue: point.totalValue,
          };
        }
        let intervalFlow = 0;
        while (flowCursor < flowEvents.length) {
          const event = flowEvents[flowCursor];
          if (!event || event.tsMs > point.tsMs) {
            break;
          }
          if (event.tsMs > prevPoint.tsMs) {
            intervalFlow += event.amount;
          }
          flowCursor += 1;
        }
        cumulativeNetFlow += intervalFlow;

        const prevTotal = prevPoint.totalValue;
        let intervalReturn = 0;
        if (Math.abs(prevTotal) >= RETURN_PCT_MIN_BASELINE_EUR) {
          intervalReturn =
            (point.totalValue - prevTotal - intervalFlow) / prevTotal;
          if (!Number.isFinite(intervalReturn)) {
            intervalReturn = 0;
          }
        }
        cumulativeReturnFactor *= 1 + intervalReturn;
        if (!Number.isFinite(cumulativeReturnFactor)) {
          cumulativeReturnFactor = 1;
        }

        return {
          tsIso: new Date(point.tsMs).toISOString(),
          marketIndex: round6(cumulativeReturnFactor * 100),
          totalValue: point.totalValue,
        };
      });

      const rangeDeltaValue = round2(
        totalValue - baselineTotalValue - cumulativeNetFlow,
      );
      const rangeDeltaPct = round2(
        (series[series.length - 1]?.marketIndex ?? 100) - 100,
      );

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
          const rangePnlValueEur = round2(
            quantity * (currentUnitEur - startUnitEur),
          );
          const rangePnlPct =
            startUnitEur <= 0
              ? 0
              : round2(((currentUnitEur - startUnitEur) / startUnitEur) * 100);
          const periodPnlValueEur = rangePnlValueEur;
          const periodPnlPct = rangePnlPct;

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
            rangeIndex: rangePriceIndex(meta.symbol, rangeStartMs, asOfMs),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => b.currentTotalEur - a.currentTotalEur);

      const rangeStartReferenceEur = round2(
        positions.reduce(
          (sum, row) => sum + (row.currentTotalEur - row.periodPnlValueEur),
          0,
        ),
      );
      const unrealizedRangePnlValueEur = round2(
        positions.reduce((sum, row) => sum + row.periodPnlValueEur, 0),
      );
      const unrealizedRangePnlPct =
        rangeStartReferenceEur > 0
          ? round2((unrealizedRangePnlValueEur / rangeStartReferenceEur) * 100)
          : 0;
      const deltaValue = includeInvestmentData
        ? unrealizedRangePnlValueEur
        : rangeDeltaValue;
      const deltaPct = includeInvestmentData
        ? unrealizedRangePnlPct
        : rangeDeltaPct;

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
          accountType: String(row.accountType) as Account['accountType'],
        })),
        series,
        positions,
      };
    },
  );

  app.get('/finances/summary', async () => {
    const [result] = await withTimedDb('finances_summary', async () => {
      return db.execute(sql`
        with savings_cash as (
          select
            coalesce(
              sum(
                a.opening_balance_eur +
                coalesce(acm_sum.cash_movement_impact_eur, 0)
              ),
              0
            )::numeric as total_balance
          from finances.accounts a
          left join (
            select
              account_id,
              coalesce(sum(cash_impact_eur), 0)::numeric as cash_movement_impact_eur
            from finances.account_cash_movements
            where affects_cash_balance = true
            group by account_id
          ) acm_sum on acm_sum.account_id = a.id
          where a.account_type = ${SAVINGS_ACCOUNT_TYPE}
        ),
        investment_tx as (
          select
            count(*)::int as transaction_count
          from finances.asset_transactions
        ),
        savings_cash_tx as (
          select
            coalesce(sum(case when cash_impact_eur > 0 and occurred_at >= date_trunc('month', now()) and affects_cash_balance then cash_impact_eur else 0 end), 0)::numeric as monthly_inflow,
            coalesce(sum(case when cash_impact_eur < 0 and occurred_at >= date_trunc('month', now()) and affects_cash_balance then cash_impact_eur else 0 end), 0)::numeric as monthly_outflow,
            count(*)::int as transaction_count
          from finances.account_cash_movements acm
          inner join finances.accounts a on a.id = acm.account_id
          where a.account_type = ${SAVINGS_ACCOUNT_TYPE}
        ),
        ac as (
          select count(*)::int as account_count
          from finances.accounts
        )
        select
          savings_cash.total_balance,
          savings_cash_tx.monthly_inflow::numeric as monthly_inflow,
          savings_cash_tx.monthly_outflow::numeric as monthly_outflow,
          (investment_tx.transaction_count + savings_cash_tx.transaction_count)::int as transaction_count,
          ac.account_count
        from savings_cash, investment_tx, savings_cash_tx, ac
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
