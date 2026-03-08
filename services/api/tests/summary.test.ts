import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ApiHttpError } from '../src/lib/errors';

type AccountRow = {
  id: string;
  name: string;
  currency: string;
  baseCurrency: string;
  openingBalanceEur: string;
  accountType: string;
  createdAt: Date;
  updatedAt: Date;
};

type AssetRow = {
  id: string;
  name: string;
  assetType: string;
  subtype: string | null;
  symbol: string | null;
  ticker: string;
  isin: string;
  exchange: string | null;
  providerSymbol: string | null;
  currency: string;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AssetPositionRow = {
  id: string;
  assetId: string;
  quantity: string;
  averageCost: string | null;
  manualPrice: string | null;
  manualPriceAsOf: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PriceHistoryRow = {
  id: string;
  symbol: string;
  pricedAt: Date;
  price: string;
  source: string;
};

type AssetTransactionRow = {
  id: string;
  accountId: string;
  assetId: string;
  transactionType: string;
  tradedAt: Date;
  quantity: string;
  unitPrice: string;
  tradeCurrency: string;
  fxRateToEur: string | null;
  tradeGrossAmount: string;
  tradeGrossAmountEur: string;
  cashImpactEur: string;
  feesAmount: string;
  feesCurrency: string | null;
  feesAmountEur: string;
  netAmountEur: string;
  dividendGross: string | null;
  withholdingTax: string | null;
  dividendNet: string | null;
  externalReference: string | null;
  source: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const state: {
  accounts: AccountRow[];
  assets: AssetRow[];
  assetPositions: AssetPositionRow[];
  priceHistory: PriceHistoryRow[];
  assetTransactions: AssetTransactionRow[];
  accountSeq: number;
  assetSeq: number;
  assetPositionSeq: number;
  priceSeq: number;
  assetTxSeq: number;
} = {
  accounts: [],
  assets: [],
  assetPositions: [],
  priceHistory: [],
  assetTransactions: [],
  accountSeq: 0,
  assetSeq: 0,
  assetPositionSeq: 0,
  priceSeq: 0,
  assetTxSeq: 0,
};

const now = () => new Date();

const accountsTable = {
  __table: 'accounts',
  id: { table: 'accounts', name: 'id' },
  accountType: { table: 'accounts', name: 'accountType' },
  createdAt: { table: 'accounts', name: 'createdAt' },
};

const assetsTable = {
  __table: 'assets',
  id: { table: 'assets', name: 'id' },
  assetType: { table: 'assets', name: 'assetType' },
  symbol: { table: 'assets', name: 'symbol' },
  ticker: { table: 'assets', name: 'ticker' },
  isActive: { table: 'assets', name: 'isActive' },
  updatedAt: { table: 'assets', name: 'updatedAt' },
};

const assetPositionsTable = {
  __table: 'assetPositions',
  id: { table: 'assetPositions', name: 'id' },
  assetId: { table: 'assetPositions', name: 'assetId' },
};

const priceHistoryTable = {
  __table: 'priceHistory',
  symbol: { table: 'priceHistory', name: 'symbol' },
  pricedAt: { table: 'priceHistory', name: 'pricedAt' },
  price: { table: 'priceHistory', name: 'price' },
};

const assetTransactionsTable = {
  __table: 'assetTransactions',
  id: { table: 'assetTransactions', name: 'id' },
  accountId: { table: 'assetTransactions', name: 'accountId' },
  assetId: { table: 'assetTransactions', name: 'assetId' },
  tradedAt: { table: 'assetTransactions', name: 'tradedAt' },
  transactionType: { table: 'assetTransactions', name: 'transactionType' },
};

const transactionImportsTable = {
  __table: 'transactionImports',
  id: { table: 'transactionImports', name: 'id' },
};

const transactionImportRowsTable = {
  __table: 'transactionImportRows',
  id: { table: 'transactionImportRows', name: 'id' },
};

const accountCashMovementsTable = {
  __table: 'accountCashMovements',
  id: { table: 'accountCashMovements', name: 'id' },
};

type Condition = {
  column: { name: string };
  value: string | boolean;
};

const filterRows = <
  T extends
    | AccountRow
    | AssetRow
    | AssetPositionRow
    | PriceHistoryRow
    | AssetTransactionRow,
>(
  rows: T[],
  condition: Condition,
): T[] => {
  return rows.filter(
    (row) => String(row[condition.column.name]) === String(condition.value),
  );
};

const makeSummary = () => {
  const totalBalance = state.accounts
    .filter((account) => account.accountType === 'savings')
    .reduce((sum, account) => sum + Number(account.openingBalanceEur), 0);
  const monthlyInflow = 0;
  const monthlyOutflow = 0;

  return {
    total_balance: totalBalance,
    monthly_inflow: monthlyInflow,
    monthly_outflow: monthlyOutflow,
    transaction_count: state.assetTransactions.length,
    account_count: state.accounts.length,
  };
};

const mkAccountId = () =>
  `00000000-0000-4000-8000-${String(++state.accountSeq).padStart(12, '0')}`;
const mkAssetId = () =>
  `30000000-0000-4000-8000-${String(++state.assetSeq).padStart(12, '0')}`;
const mkAssetPositionId = () =>
  `40000000-0000-4000-8000-${String(++state.assetPositionSeq).padStart(12, '0')}`;
const mkPriceId = () =>
  `50000000-0000-4000-8000-${String(++state.priceSeq).padStart(12, '0')}`;
const mkAssetTxId = () =>
  `60000000-0000-4000-8000-${String(++state.assetTxSeq).padStart(12, '0')}`;

type QueryArray<T> = T[] & {
  where: (condition: Condition) => QueryArray<T>;
  orderBy: () => Promise<T[]>;
};

const asQueryArray = <
  T extends
    | AccountRow
    | AssetRow
    | AssetPositionRow
    | PriceHistoryRow
    | AssetTransactionRow
    | { id: string }
    | { price: string; pricedAt: Date },
>(
  rows: T[],
  tableName: string,
): QueryArray<T> => {
  const queryRows = [...rows] as QueryArray<T>;
  queryRows.where = (condition: Condition) => {
    return asQueryArray(filterRows(queryRows, condition), tableName);
  };
  queryRows.orderBy = async () => {
    if (tableName === 'accounts') {
      return [...queryRows].reverse();
    }
    if (tableName === 'assets') {
      return [...queryRows].reverse();
    }
    if (tableName === 'priceHistory') {
      return [...queryRows].sort(
        (a, b) =>
          new Date((b as PriceHistoryRow).pricedAt).valueOf() -
          new Date((a as PriceHistoryRow).pricedAt).valueOf(),
      );
    }
    return [...queryRows];
  };
  return queryRows;
};

mock.module('@second-brain/db', () => {
  const createDbClient = () => ({
    db: {
      select(selection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            const rows =
              table.__table === 'accounts'
                ? state.accounts
                : table.__table === 'assets'
                  ? state.assets
                  : table.__table === 'assetPositions'
                    ? state.assetPositions
                    : table.__table === 'assetTransactions'
                      ? state.assetTransactions
                      : state.priceHistory;

            if (table.__table === 'assets') {
              const base = state.assets.map((asset) => {
                const position = state.assetPositions.find(
                  (entry) => entry.assetId === asset.id,
                );
                return {
                  ...asset,
                  positionId: position?.id ?? null,
                  quantity: position?.quantity ?? null,
                  averageCost: position?.averageCost ?? null,
                  manualPrice: position?.manualPrice ?? null,
                  manualPriceAsOf: position?.manualPriceAsOf ?? null,
                  positionCreatedAt: position?.createdAt ?? null,
                  positionUpdatedAt: position?.updatedAt ?? null,
                };
              });

              const queryRows = [...base] as typeof base & {
                where: (
                  condition:
                    | Condition
                    | { type: 'and'; conditions: Condition[] },
                ) => typeof queryRows;
                orderBy: () => Promise<typeof base>;
                leftJoin: () => typeof queryRows;
              };
              queryRows.leftJoin = () => queryRows;
              queryRows.where = (
                condition: Condition | { type: 'and'; conditions: Condition[] },
              ) => {
                const conditions =
                  'type' in condition
                    ? condition.conditions
                    : [condition as Condition];
                const filtered = base.filter((row) =>
                  conditions.every(
                    (entry) =>
                      String(row[entry.column.name as keyof typeof row]) ===
                      String(entry.value),
                  ),
                );
                const result = [...filtered] as typeof queryRows;
                result.leftJoin = queryRows.leftJoin;
                result.where = queryRows.where;
                result.orderBy = queryRows.orderBy;
                return result;
              };
              queryRows.orderBy = async () => [...queryRows].reverse();
              return queryRows;
            }

            const mapped =
              selection && table.__table === 'accounts'
                ? rows.map((row) => ({
                    id: row.id,
                    ...(selection.accountType
                      ? { accountType: row.accountType }
                      : {}),
                  }))
                : selection && table.__table === 'priceHistory'
                  ? rows.map((row) => ({
                      price: (row as PriceHistoryRow).price,
                      pricedAt: (row as PriceHistoryRow).pricedAt,
                    }))
                  : rows;
            const queryRows = asQueryArray(
              mapped as typeof rows,
              table.__table,
            );
            const query = queryRows as QueryArray<(typeof mapped)[number]> & {
              limit: (count: number) => Promise<(typeof mapped)[number][]>;
            };
            query.limit = async (count: number) =>
              [...queryRows].slice(0, count);
            return query;
          },
        };
      },
      insert(table: { __table: string }) {
        return {
          values(values: Record<string, unknown>) {
            if (table.__table === 'accounts') {
              const row: AccountRow = {
                id: mkAccountId(),
                name: String(values.name),
                currency: String(values.currency),
                baseCurrency: String(values.baseCurrency ?? 'EUR'),
                openingBalanceEur: String(values.openingBalanceEur ?? 0),
                accountType: String(values.accountType),
                createdAt: now(),
                updatedAt: now(),
              };
              state.accounts.push(row);
              return { returning: () => Promise.resolve([row]) };
            }

            if (table.__table === 'assets') {
              const row: AssetRow = {
                id: mkAssetId(),
                name: String(values.name),
                assetType: String(values.assetType),
                subtype: values.subtype ? String(values.subtype) : null,
                symbol: values.symbol ? String(values.symbol) : null,
                ticker: String(values.ticker ?? values.symbol ?? 'TICKER'),
                isin: String(values.isin ?? 'ZZ0000000000'),
                exchange: values.exchange ? String(values.exchange) : null,
                providerSymbol: values.providerSymbol
                  ? String(values.providerSymbol)
                  : null,
                currency: String(values.currency),
                isActive: true,
                notes: values.notes ? String(values.notes) : null,
                createdAt: now(),
                updatedAt: now(),
              };
              state.assets.push(row);
              return { returning: () => Promise.resolve([row]) };
            }

            if (table.__table === 'assetPositions') {
              const row: AssetPositionRow = {
                id: mkAssetPositionId(),
                assetId: String(values.assetId),
                quantity: String(values.quantity ?? '1'),
                averageCost: values.averageCost
                  ? String(values.averageCost)
                  : null,
                manualPrice: values.manualPrice
                  ? String(values.manualPrice)
                  : null,
                manualPriceAsOf: values.manualPriceAsOf
                  ? new Date(String(values.manualPriceAsOf))
                  : null,
                createdAt: now(),
                updatedAt: now(),
              };
              state.assetPositions.push(row);
              return { returning: () => Promise.resolve([row]) };
            }

            if (table.__table === 'priceHistory') {
              const row: PriceHistoryRow = {
                id: mkPriceId(),
                symbol: String(values.symbol),
                pricedAt: new Date(String(values.pricedAt)),
                price: String(values.price),
                source: String(values.source),
              };
              state.priceHistory.push(row);
              return { returning: () => Promise.resolve([row]) };
            }

            if (table.__table === 'assetTransactions') {
              const row: AssetTransactionRow = {
                id: mkAssetTxId(),
                accountId: String(values.accountId),
                assetId: String(values.assetId),
                transactionType: String(values.transactionType),
                tradedAt: new Date(String(values.tradedAt)),
                quantity: String(values.quantity ?? '0'),
                unitPrice: String(values.unitPrice ?? '0'),
                tradeCurrency: String(values.tradeCurrency ?? 'EUR'),
                fxRateToEur:
                  values.fxRateToEur === null ||
                  values.fxRateToEur === undefined
                    ? null
                    : String(values.fxRateToEur),
                tradeGrossAmount: String(values.tradeGrossAmount ?? '0'),
                tradeGrossAmountEur: String(values.tradeGrossAmountEur ?? '0'),
                cashImpactEur: String(values.cashImpactEur ?? '0'),
                feesAmount: String(values.feesAmount ?? '0'),
                feesCurrency:
                  values.feesCurrency === null ||
                  values.feesCurrency === undefined
                    ? null
                    : String(values.feesCurrency),
                feesAmountEur: String(values.feesAmountEur ?? '0'),
                netAmountEur: String(values.netAmountEur ?? '0'),
                dividendGross:
                  values.dividendGross === null ||
                  values.dividendGross === undefined
                    ? null
                    : String(values.dividendGross),
                withholdingTax:
                  values.withholdingTax === null ||
                  values.withholdingTax === undefined
                    ? null
                    : String(values.withholdingTax),
                dividendNet:
                  values.dividendNet === null ||
                  values.dividendNet === undefined
                    ? null
                    : String(values.dividendNet),
                externalReference:
                  values.externalReference === null ||
                  values.externalReference === undefined
                    ? null
                    : String(values.externalReference),
                source:
                  values.source === null || values.source === undefined
                    ? null
                    : String(values.source),
                notes:
                  values.notes === null || values.notes === undefined
                    ? null
                    : String(values.notes),
                createdAt: now(),
                updatedAt: now(),
              };
              state.assetTransactions.push(row);
              return { returning: () => Promise.resolve([row]) };
            }

            return { returning: () => Promise.resolve([]) };
          },
        };
      },
      update(table?: { __table: string }) {
        return {
          set(values: Record<string, unknown>) {
            return {
              where(condition: Condition) {
                return {
                  returning() {
                    if (table?.__table === 'assets') {
                      let updated: AssetRow | null = null;
                      state.assets = state.assets.map((asset) => {
                        if (
                          String(
                            asset[condition.column.name as keyof AssetRow],
                          ) !== String(condition.value)
                        ) {
                          return asset;
                        }
                        updated = {
                          ...asset,
                          ...(values as Partial<AssetRow>),
                          updatedAt: now(),
                        };
                        return updated;
                      });
                      return Promise.resolve(updated ? [updated] : []);
                    }

                    if (table?.__table === 'assetPositions') {
                      let updated: AssetPositionRow | null = null;
                      state.assetPositions = state.assetPositions.map(
                        (position) => {
                          if (
                            String(
                              position[
                                condition.column.name as keyof AssetPositionRow
                              ],
                            ) !== String(condition.value)
                          ) {
                            return position;
                          }
                          updated = {
                            ...position,
                            quantity: values.quantity
                              ? String(values.quantity)
                              : position.quantity,
                            averageCost:
                              values.averageCost === null ||
                              values.averageCost === undefined
                                ? null
                                : String(values.averageCost),
                            manualPrice:
                              values.manualPrice === null ||
                              values.manualPrice === undefined
                                ? null
                                : String(values.manualPrice),
                            manualPriceAsOf:
                              values.manualPriceAsOf === null ||
                              values.manualPriceAsOf === undefined
                                ? null
                                : new Date(String(values.manualPriceAsOf)),
                            updatedAt: now(),
                          };
                          return updated;
                        },
                      );
                      return Promise.resolve(updated ? [updated] : []);
                    }
                    return Promise.resolve([]);
                  },
                };
              },
            };
          },
        };
      },
      delete() {
        return {
          where() {
            return {
              returning() {
                return Promise.resolve([]);
              },
            };
          },
        };
      },
      execute(query?: { text?: string }) {
        const text = query?.text ?? '';
        if (text.includes('with savings_cash as')) {
          return Promise.resolve([makeSummary()]);
        }
        if (text.includes('from finances.accounts a')) {
          const rows = state.accounts.map((account) => ({
            accountId: account.id,
            id: account.id,
            name: account.name,
            currency: account.currency,
            baseCurrency: account.baseCurrency,
            openingBalanceEur: account.openingBalanceEur,
            accountType: account.accountType,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            currentCashBalanceEur:
              account.accountType === 'savings'
                ? Number(account.openingBalanceEur)
                : 0,
            cash_balance:
              account.accountType === 'savings'
                ? Number(account.openingBalanceEur)
                : 0,
          }));
          if (text.includes('where a.id')) {
            return Promise.resolve(rows.slice(0, 1));
          }
          if (text.includes('sum(a.opening_balance_eur)')) {
            const total = rows.reduce(
              (sum, row) => sum + Number(row.currentCashBalanceEur),
              0,
            );
            return Promise.resolve([{ cash_balance: total }]);
          }
          return Promise.resolve(rows.reverse());
        }
        if (text.includes('from finances.assets a')) {
          const rows = state.assets.map((asset) => {
            const position = state.assetPositions.find(
              (entry) => entry.assetId === asset.id,
            );
            return {
              id: asset.id,
              name: asset.name,
              assetType: asset.assetType,
              subtype: asset.subtype,
              symbol: asset.symbol,
              ticker: asset.ticker,
              isin: asset.isin,
              exchange: asset.exchange,
              providerSymbol: asset.providerSymbol,
              currency: asset.currency,
              isActive: asset.isActive,
              notes: asset.notes,
              createdAt: asset.createdAt,
              updatedAt: asset.updatedAt,
              positionId: position?.id ?? null,
              quantity: position?.quantity ?? null,
              averageCost: position?.averageCost ?? null,
              manualPrice: position?.manualPrice ?? null,
              manualPriceAsOf: position?.manualPriceAsOf ?? null,
              positionCreatedAt: position?.createdAt ?? null,
              positionUpdatedAt: position?.updatedAt ?? null,
            };
          });

          let filtered = [...rows];
          if (text.includes('a.is_active = true')) {
            filtered = filtered.filter((row) => row.isActive);
          } else if (text.includes('a.is_active = false')) {
            filtered = filtered.filter((row) => !row.isActive);
          }

          const typeMatch = text.match(/a\.asset_type\s*=\s*([a-z_]+)/i);
          if (typeMatch?.[1]) {
            filtered = filtered.filter(
              (row) => row.assetType === typeMatch[1]?.toLowerCase(),
            );
          }

          filtered.sort((a, b) => a.name.localeCompare(b.name));
          return Promise.resolve(filtered);
        }
        if (
          text.includes('from finances.asset_transactions') &&
          text.includes('group by asset_id')
        ) {
          const totals = new Map<string, number>();
          for (const row of state.assetTransactions) {
            const direction =
              row.transactionType === 'buy'
                ? 1
                : row.transactionType === 'sell'
                  ? -1
                  : 0;
            if (direction === 0) continue;
            const quantity = Number(row.quantity ?? 0);
            if (!Number.isFinite(quantity)) continue;
            const current = totals.get(row.assetId) ?? 0;
            totals.set(row.assetId, current + direction * quantity);
          }
          return Promise.resolve(
            [...totals.entries()].map(([assetId, quantity]) => ({
              assetId,
              quantity,
            })),
          );
        }
        if (
          text.includes('coalesce(sum(case') &&
          text.includes('from finances.asset_transactions')
        ) {
          const quantity = state.assetTransactions.reduce((sum, row) => {
            if (row.transactionType === 'buy') {
              return sum + Number(row.quantity ?? 0);
            }
            if (row.transactionType === 'sell') {
              return sum - Number(row.quantity ?? 0);
            }
            return sum;
          }, 0);
          return Promise.resolve([{ quantity }]);
        }
        if (
          text.includes('inner join finances.assets a on a.id = at.asset_id') &&
          text.includes('inner join finances.accounts acc on acc.id = at.account_id')
        ) {
          return Promise.resolve(
            [...state.assetTransactions]
              .sort((a, b) => {
                if (a.assetId !== b.assetId) {
                  return a.assetId.localeCompare(b.assetId);
                }
                return a.tradedAt.valueOf() - b.tradedAt.valueOf();
              })
              .map((row) => {
                const asset = state.assets.find((entry) => entry.id === row.assetId);
                const account = state.accounts.find(
                  (entry) => entry.id === row.accountId,
                );
                return {
                  id: row.id,
                  accountId: row.accountId,
                  accountName: account?.name ?? 'Unknown',
                  assetId: row.assetId,
                  assetName: asset?.name ?? 'Unknown',
                  assetTicker: asset?.ticker ?? 'UNKNOWN',
                  assetIsin: asset?.isin ?? 'UNKNOWN',
                  transactionType: row.transactionType,
                  tradedAt: row.tradedAt,
                  quantity: row.quantity,
                  unitPrice: row.unitPrice,
                  tradeCurrency: row.tradeCurrency,
                  fxRateToEur: row.fxRateToEur,
                  tradeGrossAmount: row.tradeGrossAmount,
                  tradeGrossAmountEur: row.tradeGrossAmountEur,
                  feesAmount: row.feesAmount,
                  feesCurrency: row.feesCurrency,
                  feesAmountEur: row.feesAmountEur,
                  netAmountEur: row.netAmountEur,
                  dividendGross: row.dividendGross,
                  withholdingTax: row.withholdingTax,
                  dividendNet: row.dividendNet,
                  externalReference: row.externalReference,
                  source: row.source,
                };
              }),
          );
        }
        if (text.includes('with latest as')) {
          const bySymbol = new Map<string, PriceHistoryRow>();
          const sorted = [...state.priceHistory].sort(
            (a, b) => b.pricedAt.valueOf() - a.pricedAt.valueOf(),
          );
          for (const row of sorted) {
            if (!bySymbol.has(row.symbol)) {
              bySymbol.set(row.symbol, row);
            }
          }
          return Promise.resolve(
            [...bySymbol.values()]
              .sort((a, b) => a.symbol.localeCompare(b.symbol))
              .map((row) => ({
                symbol: row.symbol,
                price: row.price,
                pricedAt: row.pricedAt,
                source: row.source,
              })),
          );
        }
        if (text.includes('from finances.price_history')) {
          const symbolMatch = text.match(
            /where symbol = ['"]?([A-Z0-9=._-]+)['"]?/i,
          );
          const symbol = symbolMatch?.[1] ?? '';
          const latest = state.priceHistory
            .filter((row) => row.symbol === symbol)
            .sort((a, b) => b.pricedAt.valueOf() - a.pricedAt.valueOf())[0];
          if (!latest) return Promise.resolve([]);
          return Promise.resolve([
            {
              price: latest.price,
              pricedAt: latest.pricedAt,
            },
          ]);
        }
        return Promise.resolve([]);
      },
    },
  });

  const eq = (
    column: Condition['column'],
    value: string | boolean,
  ): Condition => ({
    column,
    value,
  });
  const and = (...conditions: Condition[]) => ({
    type: 'and' as const,
    conditions,
  });
  const desc = (column: unknown) => ({ type: 'desc', column });
  const sqlCore = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: String.raw({ raw: strings }, ...values),
  });
  const sql = Object.assign(sqlCore, {
    join: (values: Array<{ text?: string }>, separator: { text?: string }) => ({
      text: values.map((value) => value.text ?? '').join(separator.text ?? ','),
    }),
  });

  return {
    createDbClient,
    assets: assetsTable,
    assetPositions: assetPositionsTable,
    accounts: accountsTable,
    priceHistory: priceHistoryTable,
    assetTransactions: assetTransactionsTable,
    accountCashMovements: accountCashMovementsTable,
    transactionImports: transactionImportsTable,
    transactionImportRows: transactionImportRowsTable,
    auditEvents: { __table: 'auditEvents', id: { name: 'id' } },
    and,
    eq,
    desc,
    sql,
  };
});

const { registerFinancesRoutes } = await import(
  '../src/modules/finances/routes'
);

const createRequest = (path: string, init?: RequestInit) =>
  new Request(`http://local${path}`, init);

const parseResponse = async <T>(response: Response): Promise<T> =>
  (await response.json()) as T;

beforeEach(() => {
  state.accounts = [];
  state.assets = [];
  state.assetPositions = [];
  state.priceHistory = [];
  state.assetTransactions = [];
  state.accountSeq = 0;
  state.assetSeq = 0;
  state.assetPositionSeq = 0;
  state.priceSeq = 0;
  state.assetTxSeq = 0;
});

const buildApp = () => {
  const app = new Elysia();
  app.onError(({ error, set }) => {
    if (error instanceof ApiHttpError) {
      set.status = error.status;
      return error.body;
    }
    set.status = 500;
    return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
  });
  registerFinancesRoutes(app, 'postgres://ignored');
  return app;
};

describe('finances routes', () => {
  test('creates account and validates payload', async () => {
    const app = buildApp();

    const createdRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Main',
          currency: 'USD',
          openingBalanceEur: 150,
          accountType: 'retirement_plan',
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const created = await parseResponse<{
      id: string;
      name: string;
      accountType: string;
    }>(
      createdRes,
    );
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Main');
    expect(created.accountType).toBe('retirement_plan');

    const invalidRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '', currency: 'US', accountType: 'oops' }),
      }),
    );
    expect(invalidRes.status).toBe(400);
    const invalid = await parseResponse<{ code: string }>(invalidRes);
    expect(invalid.code).toBe('VALIDATION_ERROR');
  });

  test('creates and lists asset transactions with account validation', async () => {
    const app = buildApp();

    const createAccountRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Main',
          currency: 'USD',
          openingBalanceEur: 150,
          accountType: 'retirement_plan',
        }),
      }),
    );
    const account = await parseResponse<{ id: string }>(createAccountRes);

    const createAssetRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Apple',
          assetType: 'stock',
          ticker: 'AAPL',
          isin: 'US0378331005',
          symbol: 'AAPL',
          currency: 'USD',
          quantity: 10,
          manualPrice: 150,
        }),
      }),
    );
    const asset = await parseResponse<{ id: string }>(createAssetRes);

    const createTxRes = await app.handle(
      createRequest('/finances/asset-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          assetType: 'stock',
          assetId: asset.id,
          transactionType: 'buy',
          tradedAt: new Date().toISOString(),
          quantity: 1,
          unitPrice: 100,
          tradeCurrency: 'EUR',
          feesAmount: 0,
        }),
      }),
    );
    expect(createTxRes.status).toBe(201);

    const listedRes = await app.handle(
      createRequest(`/finances/asset-transactions?accountId=${account.id}`),
    );
    expect(listedRes.status).toBe(200);
    const listed = await parseResponse<Array<{ accountId: string }>>(listedRes);
    expect(listed.length).toBe(1);
    expect(listed[0]?.accountId).toBe(account.id);

    const missingAccountRes = await app.handle(
      createRequest('/finances/asset-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '20000000-0000-4000-8000-000000000001',
          assetType: 'stock',
          assetId: asset.id,
          transactionType: 'buy',
          tradedAt: new Date().toISOString(),
          quantity: 1,
          unitPrice: 100,
          tradeCurrency: 'EUR',
          feesAmount: 0,
        }),
      }),
    );
    expect(missingAccountRes.status).toBe(404);
  });

  test('preserves high-precision crypto unit prices', async () => {
    const app = buildApp();

    const createAccountRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Binance',
          currency: 'EUR',
          openingBalanceEur: 0,
          accountType: 'crypto_exchange',
        }),
      }),
    );
    const account = await parseResponse<{ id: string }>(createAccountRes);

    const createAssetRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'PEPE',
          assetType: 'crypto',
          ticker: 'PEPE',
          isin: 'ZZPEPEXXXXXX',
          symbol: 'PEPE',
          currency: 'EUR',
        }),
      }),
    );
    const asset = await parseResponse<{ id: string }>(createAssetRes);

    const createTxRes = await app.handle(
      createRequest('/finances/asset-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          assetType: 'crypto',
          assetId: asset.id,
          transactionType: 'buy',
          tradedAt: '2025-08-09T09:41:48.000Z',
          quantity: 47119924,
          unitPrice: 0.0000106,
          tradeCurrency: 'EUR',
          feesAmount: 0,
        }),
      }),
    );
    expect(createTxRes.status).toBe(201);
    const created = await parseResponse<{ unitPrice: number; tradeGrossAmountEur: number }>(
      createTxRes,
    );
    expect(created.unitPrice).toBe(0.0000106);
    expect(created.tradeGrossAmountEur).toBe(499.47);
  });

  test('accepts short retirement fund code and keeps strict ISIN for stock', async () => {
    const app = buildApp();

    const retirementAssetRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'My Pension Fund',
          assetType: 'retirement_fund',
          ticker: 'N5138',
          isin: 'N5138',
          currency: 'EUR',
          quantity: 1,
        }),
      }),
    );
    expect(retirementAssetRes.status).toBe(201);
    const retirementAsset = await parseResponse<{ isin: string }>(
      retirementAssetRes,
    );
    expect(retirementAsset.isin).toBe('N5138');

    const stockAssetRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Stock',
          assetType: 'stock',
          symbol: 'IVS',
          ticker: 'IVS',
          isin: 'N5138',
          currency: 'EUR',
          quantity: 1,
        }),
      }),
    );
    expect(stockAssetRes.status).toBe(400);
    const invalidPayload = await parseResponse<{ code: string }>(stockAssetRes);
    expect(invalidPayload.code).toBe('VALIDATION_ERROR');
  });

  test('computes summary zeros and month-boundary totals', async () => {
    const app = buildApp();

    const emptySummaryRes = await app.handle(
      createRequest('/finances/summary'),
    );
    const emptySummary = await parseResponse<{
      totalBalance: number;
      accountCount: number;
      transactionCount: number;
      monthlyInflow: number;
      monthlyOutflow: number;
    }>(emptySummaryRes);
    expect(emptySummary.totalBalance).toBe(0);
    expect(emptySummary.accountCount).toBe(0);
    expect(emptySummary.transactionCount).toBe(0);
    expect(emptySummary.monthlyInflow).toBe(0);
    expect(emptySummary.monthlyOutflow).toBe(0);

    const createAccountRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Main',
          currency: 'USD',
          openingBalanceEur: 0,
          accountType: 'brokerage',
        }),
      }),
    );
    const account = await parseResponse<{ id: string }>(createAccountRes);

    const createAssetRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Apple',
          assetType: 'stock',
          ticker: 'AAPL',
          isin: 'US0378331005',
          symbol: 'AAPL',
          currency: 'USD',
          quantity: 10,
          manualPrice: 150,
        }),
      }),
    );
    const asset = await parseResponse<{ id: string }>(createAssetRes);

    const inMonthDate = new Date();
    const previousMonthDate = new Date(inMonthDate);
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);

    for (const payload of [
      {
        accountId: account.id,
        assetType: 'stock',
        assetId: asset.id,
        transactionType: 'dividend',
        tradedAt: inMonthDate.toISOString(),
        quantity: 0,
        unitPrice: 0,
        tradeCurrency: 'EUR',
        feesAmount: 0,
        dividendGross: 500,
        withholdingTax: 0,
        dividendNet: 500,
      },
      {
        accountId: account.id,
        assetType: 'stock',
        assetId: asset.id,
        transactionType: 'fee',
        tradedAt: inMonthDate.toISOString(),
        quantity: 0,
        unitPrice: 0,
        tradeCurrency: 'EUR',
        feesAmount: 120,
      },
      {
        accountId: account.id,
        assetType: 'stock',
        assetId: asset.id,
        transactionType: 'dividend',
        tradedAt: previousMonthDate.toISOString(),
        quantity: 0,
        unitPrice: 0,
        tradeCurrency: 'EUR',
        feesAmount: 0,
        dividendGross: 50,
        withholdingTax: 0,
        dividendNet: 50,
      },
    ]) {
      await app.handle(
        createRequest('/finances/asset-transactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    }

    const summaryRes = await app.handle(createRequest('/finances/summary'));
    const summary = await parseResponse<{
      totalBalance: number;
      accountCount: number;
      transactionCount: number;
      monthlyInflow: number;
      monthlyOutflow: number;
    }>(summaryRes);

    expect(summary.accountCount).toBe(1);
    expect(summary.transactionCount).toBe(3);
    expect(summary.totalBalance).toBe(0);
    expect(summary.monthlyInflow).toBe(0);
    expect(summary.monthlyOutflow).toBe(0);
  });

  test('creates assets, updates positions, and deactivates assets', async () => {
    const app = buildApp();

    const createdAssetRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'SPY',
          assetType: 'etf',
          symbol: 'SPY',
          ticker: 'SPY',
          isin: 'US78462F1030',
          currency: 'USD',
          quantity: 2,
          manualPrice: 500,
        }),
      }),
    );
    expect(createdAssetRes.status).toBe(201);
    const createdAsset = await parseResponse<{ id: string; name: string }>(
      createdAssetRes,
    );
    expect(createdAsset.name).toBe('SPY');

    const listRes = await app.handle(createRequest('/finances/assets'));
    expect(listRes.status).toBe(200);
    const list = await parseResponse<Array<{ id: string }>>(listRes);
    expect(list.length).toBe(1);

    const updatePositionRes = await app.handle(
      createRequest(`/finances/assets/${createdAsset.id}/position`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quantity: 3,
          manualPrice: 510,
          manualPriceAsOf: new Date().toISOString(),
        }),
      }),
    );
    expect(updatePositionRes.status).toBe(200);
    const updated = await parseResponse<{ position: { quantity: number } }>(
      updatePositionRes,
    );
    expect(updated.position.quantity).toBe(3);

    const deactivateRes = await app.handle(
      createRequest(`/finances/assets/${createdAsset.id}`, {
        method: 'DELETE',
      }),
    );
    expect(deactivateRes.status).toBe(204);

    expect(state.assets[0]?.isActive).toBe(false);
  });

  test('returns explicit conflict when creating duplicated crypto asset', async () => {
    const app = buildApp();

    const firstRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Ethereum',
          assetType: 'crypto',
          symbol: 'ETH',
          providerSymbol: 'ETH-EUR',
          ticker: 'ETH',
          currency: 'EUR',
          quantity: 1,
        }),
      }),
    );
    expect(firstRes.status).toBe(201);

    const duplicateRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Ethereum Duplicate',
          assetType: 'crypto',
          symbol: 'ETH',
          providerSymbol: 'ETH-EUR',
          ticker: 'ETH',
          currency: 'EUR',
          quantity: 1,
        }),
      }),
    );

    expect(duplicateRes.status).toBe(409);
    const duplicate = await parseResponse<{ code: string; message: string }>(
      duplicateRes,
    );
    expect(duplicate.code).toBe('ASSET_ALREADY_EXISTS');
  });

  test('returns asset holdings when includeHoldings=true', async () => {
    const app = buildApp();
    const accountId = mkAccountId();
    const assetId = mkAssetId();
    const createdAt = now();

    state.accounts.push({
      id: accountId,
      name: 'Main Broker',
      currency: 'EUR',
      baseCurrency: 'EUR',
      openingBalanceEur: '0',
      accountType: 'brokerage',
      createdAt,
      updatedAt: createdAt,
    });
    state.assets.push({
      id: assetId,
      name: 'iShares Core MSCI World',
      assetType: 'etf',
      subtype: null,
      symbol: 'IWDA',
      ticker: 'IWDA',
      isin: 'IE00B4L5Y983',
      exchange: null,
      providerSymbol: 'IWDA.AS',
      currency: 'EUR',
      isActive: true,
      notes: null,
      createdAt,
      updatedAt: createdAt,
    });
    state.assetTransactions.push(
      {
        id: mkAssetTxId(),
        accountId,
        assetId,
        transactionType: 'buy',
        tradedAt: createdAt,
        quantity: '5',
        unitPrice: '100',
        tradeCurrency: 'EUR',
        fxRateToEur: null,
        tradeGrossAmount: '500',
        tradeGrossAmountEur: '500',
        cashImpactEur: '-500',
        feesAmount: '0',
        feesCurrency: null,
        feesAmountEur: '0',
        netAmountEur: '500',
        dividendGross: null,
        withholdingTax: null,
        dividendNet: null,
        externalReference: null,
        source: 'manual',
        notes: null,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: mkAssetTxId(),
        accountId,
        assetId,
        transactionType: 'sell',
        tradedAt: createdAt,
        quantity: '2',
        unitPrice: '120',
        tradeCurrency: 'EUR',
        fxRateToEur: null,
        tradeGrossAmount: '240',
        tradeGrossAmountEur: '240',
        cashImpactEur: '240',
        feesAmount: '0',
        feesCurrency: null,
        feesAmountEur: '0',
        netAmountEur: '240',
        dividendGross: null,
        withholdingTax: null,
        dividendNet: null,
        externalReference: null,
        source: 'manual',
        notes: null,
        createdAt,
        updatedAt: createdAt,
      },
    );

    const response = await app.handle(
      createRequest('/finances/assets?includeHoldings=true'),
    );
    expect(response.status).toBe(200);

    const body = await parseResponse<{
      rows: Array<{ id: string }>;
      holdingsByAssetId: Record<string, number>;
    }>(response);
    expect(body.rows.some((row) => row.id === assetId)).toBe(true);
    expect(body.holdingsByAssetId[assetId]).toBe(3);
  });

  test('validates transactions pagination query parameters', async () => {
    const app = buildApp();

    const invalidLimitRes = await app.handle(
      createRequest('/finances/transactions?limit=0'),
    );
    expect(invalidLimitRes.status).toBe(400);

    const invalidCursorRes = await app.handle(
      createRequest('/finances/transactions?cursor=not-a-date'),
    );
    expect(invalidCursorRes.status).toBe(400);

    const validRes = await app.handle(
      createRequest('/finances/transactions?limit=10&cursor=2026-01-01T00:00:00.000Z'),
    );
    expect(validRes.status).toBe(200);
  });

  test('builds yearly tax summary and downloadable PDF with explicit fees', async () => {
    const app = buildApp();

    const accountRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Broker',
          currency: 'EUR',
          openingBalanceEur: 0,
          accountType: 'brokerage',
        }),
      }),
    );
    const account = await parseResponse<{ id: string }>(accountRes);

    const assetRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Apple',
          assetType: 'stock',
          ticker: 'AAPL',
          isin: 'US0378331005',
          symbol: 'AAPL',
          currency: 'EUR',
        }),
      }),
    );
    const asset = await parseResponse<{ id: string }>(assetRes);

    const buyRes = await app.handle(
      createRequest('/finances/asset-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          assetType: 'stock',
          assetId: asset.id,
          transactionType: 'buy',
          tradedAt: '2026-01-10T10:00:00.000Z',
          quantity: 2,
          unitPrice: 100,
          tradeCurrency: 'EUR',
          feesAmount: 5,
          feesCurrency: 'EUR',
        }),
      }),
    );
    expect(buyRes.status).toBe(201);

    const sellRes = await app.handle(
      createRequest('/finances/asset-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          assetType: 'stock',
          assetId: asset.id,
          transactionType: 'sell',
          tradedAt: '2026-02-10T10:00:00.000Z',
          quantity: 1,
          unitPrice: 120,
          tradeCurrency: 'EUR',
          feesAmount: 3,
          feesCurrency: 'EUR',
        }),
      }),
    );
    expect(sellRes.status).toBe(201);

    const dividendRes = await app.handle(
      createRequest('/finances/asset-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          assetType: 'stock',
          assetId: asset.id,
          transactionType: 'dividend',
          tradedAt: '2026-03-10T10:00:00.000Z',
          quantity: 0,
          unitPrice: 0,
          tradeCurrency: 'EUR',
          feesAmount: 0,
          dividendGross: 10,
          withholdingTax: 1.9,
          dividendNet: 8.1,
        }),
      }),
    );
    expect(dividendRes.status).toBe(201);

    const summaryRes = await app.handle(
      createRequest('/finances/tax/yearly-summary?year=2026'),
    );
    expect(summaryRes.status).toBe(200);
    const summary = await parseResponse<{
      realizedGainLossEur: number;
      dividendsNetEur: number;
      operations: { sells: number; dividends: number; detailedRows: Array<{ proceedsEur: number; costBasisEur: number; realizedGainLossEur: number; feesAmountEur: number }> };
    }>(summaryRes);
    expect(summary.realizedGainLossEur).toBe(14.5);
    expect(summary.dividendsNetEur).toBe(8.1);
    expect(summary.operations.sells).toBe(1);
    expect(summary.operations.dividends).toBe(1);
    expect(summary.operations.detailedRows[0]?.proceedsEur).toBe(117);
    expect(summary.operations.detailedRows[0]?.costBasisEur).toBe(102.5);
    expect(summary.operations.detailedRows[0]?.feesAmountEur).toBe(3);

    const reportRes = await app.handle(
      createRequest('/finances/tax/yearly-report.pdf?year=2026'),
    );
    expect(reportRes.status).toBe(200);
    expect(reportRes.headers.get('content-type')).toBe('application/pdf');
    const reportText = new TextDecoder('latin1').decode(
      await reportRes.arrayBuffer(),
    );
    expect(reportText.includes('Second Brain Hacienda Report 2026')).toBe(true);
    expect(reportText.includes('Apple')).toBe(true);
  });
});
