import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ApiHttpError } from '../src/lib/errors';

type AccountRow = {
  id: string;
  name: string;
  currency: string;
  accountType: string;
  createdAt: Date;
  updatedAt: Date;
};

type TransactionRow = {
  id: string;
  accountId: string;
  postedAt: Date;
  amount: string;
  description: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
};

type AssetRow = {
  id: string;
  name: string;
  assetType: string;
  subtype: string | null;
  symbol: string | null;
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

const state: {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  assets: AssetRow[];
  assetPositions: AssetPositionRow[];
  priceHistory: PriceHistoryRow[];
  accountSeq: number;
  txSeq: number;
  assetSeq: number;
  assetPositionSeq: number;
  priceSeq: number;
} = {
  accounts: [],
  transactions: [],
  assets: [],
  assetPositions: [],
  priceHistory: [],
  accountSeq: 0,
  txSeq: 0,
  assetSeq: 0,
  assetPositionSeq: 0,
  priceSeq: 0,
};

const now = () => new Date();

const accountsTable = {
  __table: 'accounts',
  id: { table: 'accounts', name: 'id' },
  createdAt: { table: 'accounts', name: 'createdAt' },
};

const transactionsTable = {
  __table: 'transactions',
  id: { table: 'transactions', name: 'id' },
  accountId: { table: 'transactions', name: 'accountId' },
  postedAt: { table: 'transactions', name: 'postedAt' },
};

const assetsTable = {
  __table: 'assets',
  id: { table: 'assets', name: 'id' },
  assetType: { table: 'assets', name: 'assetType' },
  symbol: { table: 'assets', name: 'symbol' },
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

type Condition = {
  column:
    | { name: keyof TransactionRow | keyof AccountRow | keyof AssetRow }
    | { name: keyof AssetPositionRow | keyof PriceHistoryRow };
  value: string | boolean;
};

const filterRows = <
  T extends
    | AccountRow
    | TransactionRow
    | AssetRow
    | AssetPositionRow
    | PriceHistoryRow,
>(
  rows: T[],
  condition: Condition,
): T[] => {
  return rows.filter(
    (row) => String(row[condition.column.name]) === String(condition.value),
  );
};

const makeSummary = () => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const amounts = state.transactions.map((tx) => Number(tx.amount));
  const totalBalance = amounts.reduce((sum, amount) => sum + amount, 0);
  const monthlyInflow = state.transactions
    .filter((tx) => tx.postedAt >= monthStart && Number(tx.amount) > 0)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
  const monthlyOutflow = state.transactions
    .filter((tx) => tx.postedAt >= monthStart && Number(tx.amount) < 0)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  return {
    total_balance: totalBalance,
    monthly_inflow: monthlyInflow,
    monthly_outflow: monthlyOutflow,
    transaction_count: state.transactions.length,
    account_count: state.accounts.length,
  };
};

const mkAccountId = () =>
  `00000000-0000-4000-8000-${String(++state.accountSeq).padStart(12, '0')}`;
const mkTxId = () =>
  `10000000-0000-4000-8000-${String(++state.txSeq).padStart(12, '0')}`;
const mkAssetId = () =>
  `30000000-0000-4000-8000-${String(++state.assetSeq).padStart(12, '0')}`;
const mkAssetPositionId = () =>
  `40000000-0000-4000-8000-${String(++state.assetPositionSeq).padStart(12, '0')}`;
const mkPriceId = () =>
  `50000000-0000-4000-8000-${String(++state.priceSeq).padStart(12, '0')}`;

type QueryArray<T> = T[] & {
  where: (condition: Condition) => QueryArray<T>;
  orderBy: () => Promise<T[]>;
};

const asQueryArray = <
  T extends
    | AccountRow
    | TransactionRow
    | AssetRow
    | AssetPositionRow
    | PriceHistoryRow
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
    return [...queryRows].sort(
      (a, b) =>
        new Date((b as TransactionRow).postedAt).valueOf() -
        new Date((a as TransactionRow).postedAt).valueOf(),
    );
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
                : table.__table === 'transactions'
                  ? state.transactions
                  : table.__table === 'assets'
                    ? state.assets
                    : table.__table === 'assetPositions'
                      ? state.assetPositions
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
                ? rows.map((row) => ({ id: row.id }))
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

            const row: TransactionRow = {
              id: mkTxId(),
              accountId: String(values.accountId),
              postedAt: new Date(String(values.postedAt)),
              amount: String(values.amount),
              description: String(values.description),
              category: String(values.category),
              createdAt: now(),
              updatedAt: now(),
            };
            state.transactions.push(row);
            return { returning: () => Promise.resolve([row]) };
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

                    let updated: TransactionRow | null = null;
                    state.transactions = state.transactions.map((tx) => {
                      if (
                        String(
                          tx[condition.column.name as keyof TransactionRow],
                        ) !== condition.value
                      ) {
                        return tx;
                      }
                      updated = {
                        ...tx,
                        ...values,
                        postedAt: values.postedAt
                          ? new Date(String(values.postedAt))
                          : tx.postedAt,
                        amount: values.amount
                          ? String(values.amount)
                          : tx.amount,
                        updatedAt: now(),
                      } as TransactionRow;
                      return updated;
                    });
                    return Promise.resolve(updated ? [updated] : []);
                  },
                };
              },
            };
          },
        };
      },
      delete() {
        return {
          where(condition: Condition) {
            const match = state.transactions.find(
              (tx) =>
                String(tx[condition.column.name as keyof TransactionRow]) ===
                condition.value,
            );
            state.transactions = state.transactions.filter(
              (tx) =>
                String(tx[condition.column.name as keyof TransactionRow]) !==
                condition.value,
            );
            return {
              returning() {
                return Promise.resolve(match ? [{ id: match.id }] : []);
              },
            };
          },
        };
      },
      execute(query?: { text?: string }) {
        const text = query?.text ?? '';
        if (text.includes('cash_balance')) {
          const cash = state.transactions.reduce(
            (sum, tx) => sum + Number(tx.amount),
            0,
          );
          return Promise.resolve([{ cash_balance: cash }]);
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
                priced_at: row.pricedAt,
                source: row.source,
              })),
          );
        }
        if (text.includes('from finances.price_history')) {
          const symbolMatch = text.match(/where symbol = ([A-Z0-9._-]+)/i);
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
        return Promise.resolve([makeSummary()]);
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
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: String.raw({ raw: strings }, ...values),
  });

  return {
    createDbClient,
    assets: assetsTable,
    assetPositions: assetPositionsTable,
    accounts: accountsTable,
    priceHistory: priceHistoryTable,
    transactions: transactionsTable,
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
  state.transactions = [];
  state.assets = [];
  state.assetPositions = [];
  state.priceHistory = [];
  state.accountSeq = 0;
  state.txSeq = 0;
  state.assetSeq = 0;
  state.assetPositionSeq = 0;
  state.priceSeq = 0;
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
          accountType: 'checking',
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const created = await parseResponse<{ id: string; name: string }>(
      createdRes,
    );
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Main');

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

  test('creates transaction, filters list, and rejects missing account', async () => {
    const app = buildApp();

    const createAccountRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Main',
          currency: 'USD',
          accountType: 'checking',
        }),
      }),
    );
    const account = await parseResponse<{ id: string }>(createAccountRes);

    const txRes = await app.handle(
      createRequest('/finances/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          postedAt: new Date().toISOString(),
          amount: 123.45,
          description: 'Paycheck',
          category: 'income',
        }),
      }),
    );
    expect(txRes.status).toBe(201);
    const tx = await parseResponse<{ amount: number; accountId: string }>(
      txRes,
    );
    expect(tx.amount).toBe(123.45);
    expect(tx.accountId).toBe(account.id);

    const filteredRes = await app.handle(
      createRequest(`/finances/transactions?accountId=${account.id}`),
    );
    expect(filteredRes.status).toBe(200);
    const filtered =
      await parseResponse<Array<{ accountId: string }>>(filteredRes);
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.accountId).toBe(account.id);

    const missingAccountRes = await app.handle(
      createRequest('/finances/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '20000000-0000-4000-8000-000000000001',
          postedAt: new Date().toISOString(),
          amount: 1,
          description: 'x',
          category: 'y',
        }),
      }),
    );
    expect(missingAccountRes.status).toBe(404);
    const missing = await parseResponse<{ code: string }>(missingAccountRes);
    expect(missing.code).toBe('ACCOUNT_NOT_FOUND');
  });

  test('updates and deletes transaction with not found checks', async () => {
    const app = buildApp();

    const createAccountRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Main',
          currency: 'USD',
          accountType: 'checking',
        }),
      }),
    );
    const account = await parseResponse<{ id: string }>(createAccountRes);

    const createTxRes = await app.handle(
      createRequest('/finances/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          postedAt: new Date().toISOString(),
          amount: 10,
          description: 'Coffee',
          category: 'food',
        }),
      }),
    );
    const tx = await parseResponse<{ id: string }>(createTxRes);

    const badPatchRes = await app.handle(
      createRequest(`/finances/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(badPatchRes.status).toBe(400);

    const updateRes = await app.handle(
      createRequest(`/finances/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: -15.75,
          description: 'Lunch',
          category: 'food',
          postedAt: new Date().toISOString(),
        }),
      }),
    );
    expect(updateRes.status).toBe(200);
    const updated = await parseResponse<{
      amount: number;
      description: string;
    }>(updateRes);
    expect(updated.amount).toBe(-15.75);
    expect(updated.description).toBe('Lunch');

    const missingUpdateRes = await app.handle(
      createRequest(
        '/finances/transactions/10000000-0000-4000-8000-999999999999',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ amount: 1 }),
        },
      ),
    );
    expect(missingUpdateRes.status).toBe(404);

    const deleteRes = await app.handle(
      createRequest(`/finances/transactions/${tx.id}`, { method: 'DELETE' }),
    );
    expect(deleteRes.status).toBe(204);

    const missingDeleteRes = await app.handle(
      createRequest(`/finances/transactions/${tx.id}`, { method: 'DELETE' }),
    );
    expect(missingDeleteRes.status).toBe(404);
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
          accountType: 'checking',
        }),
      }),
    );
    const account = await parseResponse<{ id: string }>(createAccountRes);

    const inMonthDate = new Date();
    const previousMonthDate = new Date(inMonthDate);
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);

    for (const payload of [
      {
        accountId: account.id,
        postedAt: inMonthDate.toISOString(),
        amount: 500,
        description: 'Salary',
        category: 'income',
      },
      {
        accountId: account.id,
        postedAt: inMonthDate.toISOString(),
        amount: -120,
        description: 'Groceries',
        category: 'food',
      },
      {
        accountId: account.id,
        postedAt: previousMonthDate.toISOString(),
        amount: 50,
        description: 'Old adjustment',
        category: 'misc',
      },
    ]) {
      await app.handle(
        createRequest('/finances/transactions', {
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
    expect(summary.totalBalance).toBe(430);
    expect(summary.monthlyInflow).toBe(500);
    expect(summary.monthlyOutflow).toBe(-120);
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

  test('computes portfolio summary with allocation and cash', async () => {
    const app = buildApp();

    const accountRes = await app.handle(
      createRequest('/finances/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Brokerage Cash',
          currency: 'USD',
          accountType: 'checking',
        }),
      }),
    );
    const account = await parseResponse<{ id: string }>(accountRes);

    await app.handle(
      createRequest('/finances/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          postedAt: new Date().toISOString(),
          amount: 1000,
          description: 'Deposit',
          category: 'cash',
        }),
      }),
    );

    await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Real Estate Unit',
          assetType: 'real_estate',
          quantity: 1,
          manualPrice: 250000,
          currency: 'USD',
        }),
      }),
    );

    const stockRes = await app.handle(
      createRequest('/finances/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Apple',
          assetType: 'stock',
          symbol: 'AAPL',
          quantity: 10,
          manualPrice: 150,
          currency: 'USD',
        }),
      }),
    );
    const stock = await parseResponse<{ id: string }>(stockRes);
    state.priceHistory.push({
      id: mkPriceId(),
      symbol: 'AAPL',
      pricedAt: new Date(),
      price: '200',
      source: 'synthetic',
    });

    await app.handle(
      createRequest(`/finances/assets/${stock.id}/position`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quantity: 10,
          manualPrice: 150,
          manualPriceAsOf: new Date().toISOString(),
        }),
      }),
    );

    const summaryRes = await app.handle(
      createRequest('/finances/portfolio/summary'),
    );
    expect(summaryRes.status).toBe(200);
    const summary = await parseResponse<{
      cashBalance: number;
      assetValue: number;
      netWorth: number;
      assetCount: number;
      allocationByType: Array<{ assetType: string; value: number }>;
    }>(summaryRes);

    expect(summary.cashBalance).toBe(1000);
    expect(summary.assetValue).toBe(252000);
    expect(summary.netWorth).toBe(253000);
    expect(summary.assetCount).toBe(2);
    expect(summary.allocationByType.length).toBe(2);
  });

  test('lists latest market prices by symbol', async () => {
    const app = buildApp();

    state.priceHistory.push(
      {
        id: mkPriceId(),
        symbol: 'BTC-USD',
        pricedAt: new Date('2026-03-01T10:00:00.000Z'),
        price: '62000',
        source: 'seed',
      },
      {
        id: mkPriceId(),
        symbol: 'BTC-USD',
        pricedAt: new Date('2026-03-02T10:00:00.000Z'),
        price: '64000',
        source: 'seed',
      },
      {
        id: mkPriceId(),
        symbol: 'AAPL',
        pricedAt: new Date('2026-03-02T11:00:00.000Z'),
        price: '212.50',
        source: 'seed',
      },
    );

    const latestRes = await app.handle(
      createRequest('/finances/markets/latest?limit=10'),
    );
    expect(latestRes.status).toBe(200);
    const latest =
      await parseResponse<
        Array<{ symbol: string; price: number; source: string }>
      >(latestRes);

    expect(latest.length).toBe(2);
    expect(latest[0]).toMatchObject({ symbol: 'AAPL', price: 212.5 });
    expect(latest[1]).toMatchObject({ symbol: 'BTC-USD', price: 64000 });
  });
});
