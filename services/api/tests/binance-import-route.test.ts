import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ApiHttpError } from '../src/lib/errors';

type AccountRow = { id: string; accountType: string };
type AssetRow = {
  id: string;
  assetType: string;
  symbol: string | null;
  ticker: string;
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
  cashImpactEur: string;
  feesAmount: string;
  feesCurrency: string | null;
  dividendGross: string | null;
  withholdingTax: string | null;
  dividendNet: string | null;
  externalReference: string | null;
  rowFingerprint: string | null;
  source: string | null;
  linkedTransactionId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ImportRow = { id: string };

const state: {
  accounts: AccountRow[];
  assets: AssetRow[];
  assetTransactions: AssetTransactionRow[];
  imports: ImportRow[];
} = {
  accounts: [],
  assets: [],
  assetTransactions: [],
  imports: [],
};

const mkImportId = () => `80000000-0000-4000-8000-${String(state.imports.length + 1).padStart(12, '0')}`;
const mkTxId = () =>
  `70000000-0000-4000-8000-${String(state.assetTransactions.length + 1).padStart(12, '0')}`;

type Condition =
  | { column: { name: string }; value: string }
  | { type: 'and'; conditions: Condition[] };

const matches = (row: Record<string, unknown>, condition: Condition): boolean => {
  if ('type' in condition) {
    return condition.conditions.every((entry) => matches(row, entry));
  }
  return String(row[condition.column.name]) === String(condition.value);
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
                : table.__table === 'assetTransactions'
                  ? state.assetTransactions
                  : [];

            const mapped = rows.map((row) => {
              if (table.__table === 'accounts') {
                const account = row as AccountRow;
                return {
                  id: account.id,
                  ...(selection?.accountType
                    ? { accountType: account.accountType }
                    : {}),
                };
              }
              if (table.__table === 'assets') {
                const asset = row as AssetRow;
                return {
                  id: asset.id,
                  ...(selection?.assetType ? { assetType: asset.assetType } : {}),
                };
              }
              return row;
            });

            return {
              where(condition: Condition) {
                return Promise.resolve(
                  mapped.filter((row) => matches(row as Record<string, unknown>, condition)),
                );
              },
            };
          },
        };
      },
      insert(table: { __table: string }) {
        return {
          values(values: unknown) {
            if (table.__table === 'transactionImports') {
              const id = mkImportId();
              state.imports.push({ id });
              return {
                returning() {
                  return Promise.resolve([{ id }]);
                },
              };
            }
            if (table.__table === 'assetTransactions') {
              const payload = values as Record<string, unknown>;
              const created: AssetTransactionRow = {
                id: mkTxId(),
                accountId: String(payload.accountId),
                assetId: String(payload.assetId),
                transactionType: String(payload.transactionType),
                tradedAt: payload.tradedAt as Date,
                quantity: String(payload.quantity),
                unitPrice: String(payload.unitPrice),
                tradeCurrency: String(payload.tradeCurrency),
                fxRateToEur:
                  payload.fxRateToEur === null || payload.fxRateToEur === undefined
                    ? null
                    : String(payload.fxRateToEur),
                cashImpactEur: String(payload.cashImpactEur),
                feesAmount: String(payload.feesAmount),
                feesCurrency:
                  payload.feesCurrency === null || payload.feesCurrency === undefined
                    ? null
                    : String(payload.feesCurrency),
                dividendGross:
                  payload.dividendGross === null ||
                  payload.dividendGross === undefined
                    ? null
                    : String(payload.dividendGross),
                withholdingTax:
                  payload.withholdingTax === null ||
                  payload.withholdingTax === undefined
                    ? null
                    : String(payload.withholdingTax),
                dividendNet:
                  payload.dividendNet === null || payload.dividendNet === undefined
                    ? null
                    : String(payload.dividendNet),
                externalReference:
                  payload.externalReference === null ||
                  payload.externalReference === undefined
                    ? null
                    : String(payload.externalReference),
                rowFingerprint:
                  payload.rowFingerprint === null ||
                  payload.rowFingerprint === undefined
                    ? null
                    : String(payload.rowFingerprint),
                source:
                  payload.source === null || payload.source === undefined
                    ? null
                    : String(payload.source),
                linkedTransactionId:
                  payload.linkedTransactionId === null ||
                  payload.linkedTransactionId === undefined
                    ? null
                    : String(payload.linkedTransactionId),
                notes:
                  payload.notes === null || payload.notes === undefined
                    ? null
                    : String(payload.notes),
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              state.assetTransactions.push(created);
              return {
                returning() {
                  return Promise.resolve([created]);
                },
              };
            }
            if (table.__table === 'transactionImportRows') {
              return Promise.resolve(values);
            }
            return {
              returning() {
                return Promise.resolve([]);
              },
            };
          },
        };
      },
      update() {
        return {
          set() {
            return {
              where() {
                return Promise.resolve([]);
              },
            };
          },
        };
      },
      execute(query?: { text?: string }) {
        const text = query?.text ?? '';
        if (text.includes('from finances.assets')) {
          return Promise.resolve(
            state.assets.map((row) => ({
              id: row.id,
              assetType: row.assetType,
              symbol: row.symbol?.toUpperCase() ?? '',
              ticker: row.ticker.toUpperCase(),
            })),
          );
        }
        return Promise.resolve([]);
      },
    },
  });

  const sqlCore = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: String.raw({ raw: strings }, ...values),
  });
  const sql = Object.assign(sqlCore, {
    join: (values: Array<{ text?: string }>, separator: { text?: string }) => ({
      text: values.map((value) => value.text ?? '').join(separator.text ?? ','),
    }),
  });

  const eq = (column: { name: string }, value: string) => ({ column, value });
  const and = (...conditions: Condition[]) => ({ type: 'and' as const, conditions });
  const desc = () => ({});

  const accounts = {
    __table: 'accounts',
    id: { name: 'id' },
    accountType: { name: 'accountType' },
  };
  const assets = { __table: 'assets', id: { name: 'id' }, assetType: { name: 'assetType' } };
  const assetTransactions = {
    __table: 'assetTransactions',
    id: { name: 'id' },
    accountId: { name: 'accountId' },
    externalReference: { name: 'externalReference' },
  };
  const transactionImports = { __table: 'transactionImports', id: { name: 'id' } };
  const transactionImportRows = { __table: 'transactionImportRows', id: { name: 'id' } };
  const accountCashMovements = { __table: 'accountCashMovements', id: { name: 'id' } };
  const assetPositions = { __table: 'assetPositions', id: { name: 'id' } };
  const auditEvents = { __table: 'auditEvents', id: { name: 'id' } };

  return {
    createDbClient,
    sql,
    eq,
    and,
    desc,
    accounts,
    assets,
    assetTransactions,
    transactionImports,
    transactionImportRows,
    accountCashMovements,
    assetPositions,
    auditEvents,
  };
});

const { registerFinancesRoutes } = await import('../src/modules/finances/routes');

const buildApp = () => {
  const app = new Elysia();
  app.onError(({ error, set }) => {
    if (error instanceof ApiHttpError) {
      set.status = error.status;
      return error.body;
    }
    set.status = 500;
    return {
      code: 'INTERNAL_ERROR',
      message:
        error instanceof Error ? error.message : 'Unexpected server error',
    };
  });
  registerFinancesRoutes(app, 'postgres://ignored');
  return app;
};

beforeEach(() => {
  state.accounts = [];
  state.assets = [];
  state.assetTransactions = [];
  state.imports = [];
});

const BINANCE_SAMPLE = `"Date(UTC)","OrderNo","Pair","Type","Side","Order Price","Order Amount","Time","Executed","Average Price","Trading total","Status"\n"2025-11-05 14:28:28","4261935993","ETHEUR","Market","BUY","0","0.1717ETH","2025-11-05 14:28:28","0.1717ETH","2911.91955737","499.976588EUR","FILLED"`;
const BINANCE_MIXED_SAMPLE = `"Date(UTC)","OrderNo","Pair","Type","Side","Order Price","Order Amount","Time","Executed","Average Price","Trading total","Status"\n"2025-11-05 14:28:28","4261935993","ETHEUR","Market","BUY","0","0.1717ETH","2025-11-05 14:28:28","0.1717ETH","2911.91955737","499.976588EUR","FILLED"\n"2025-08-09 09:39:30","48178883","PEPEEUR","Limit","BUY","0.00001059","47119924PEPE","2025-08-09 09:41:48","0PEPE","0","0EUR","CANCELED"`;

describe('binance import endpoint', () => {
  test('rejects import into non-exchange account', async () => {
    state.accounts.push({
      id: '10000000-0000-4000-8000-000000000001',
      accountType: 'brokerage',
    });

    const app = buildApp();
    const response = await app.handle(
      new Request('http://local/finances/import/binance-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '10000000-0000-4000-8000-000000000001',
          fileName: 'binance.csv',
          csvText: BINANCE_SAMPLE,
          dryRun: true,
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('IMPORT_ACCOUNT_TYPE_NOT_SUPPORTED');
  });

  test('fails whole import when asset symbols are missing', async () => {
    state.accounts.push({
      id: '10000000-0000-4000-8000-000000000002',
      accountType: 'crypto_exchange',
    });

    const app = buildApp();
    const response = await app.handle(
      new Request('http://local/finances/import/binance-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '10000000-0000-4000-8000-000000000002',
          fileName: 'binance.csv',
          csvText: BINANCE_SAMPLE,
          dryRun: true,
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; details?: { missingSymbols?: string[] } };
    expect(body.code).toBe('UNKNOWN_ASSET_SYMBOL');
    expect(body.details?.missingSymbols).toEqual(['ETH']);
  });

  test('dry run returns expected import and skip counts', async () => {
    state.accounts.push({
      id: '10000000-0000-4000-8000-000000000003',
      accountType: 'crypto_exchange',
    });
    state.assets.push({
      id: '20000000-0000-4000-8000-000000000001',
      assetType: 'crypto',
      symbol: 'ETH',
      ticker: 'ETH',
    });

    const app = buildApp();
    const response = await app.handle(
      new Request('http://local/finances/import/binance-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '10000000-0000-4000-8000-000000000003',
          fileName: 'binance.csv',
          csvText: BINANCE_MIXED_SAMPLE,
          dryRun: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      importedRows: number;
      skippedRows: number;
      failedRows: number;
      totalRows: number;
    };
    expect(body.totalRows).toBe(2);
    expect(body.importedRows).toBe(0);
    expect(body.skippedRows).toBe(2);
    expect(body.failedRows).toBe(0);
    expect(state.assetTransactions).toHaveLength(0);
  });

  test('commit inserts filled rows and re-import skips duplicates by order id', async () => {
    state.accounts.push({
      id: '10000000-0000-4000-8000-000000000004',
      accountType: 'crypto_exchange',
    });
    state.assets.push({
      id: '20000000-0000-4000-8000-000000000002',
      assetType: 'crypto',
      symbol: 'ETH',
      ticker: 'ETH',
    });

    const app = buildApp();
    const firstResponse = await app.handle(
      new Request('http://local/finances/import/binance-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '10000000-0000-4000-8000-000000000004',
          fileName: 'binance.csv',
          csvText: BINANCE_MIXED_SAMPLE,
          dryRun: false,
        }),
      }),
    );

    expect(firstResponse.status).toBe(200);
    const firstBody = (await firstResponse.json()) as {
      importedRows: number;
      skippedRows: number;
      failedRows: number;
    };
    expect(firstBody.importedRows).toBe(1);
    expect(firstBody.skippedRows).toBe(1);
    expect(firstBody.failedRows).toBe(0);
    expect(state.assetTransactions).toHaveLength(1);

    const secondResponse = await app.handle(
      new Request('http://local/finances/import/binance-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '10000000-0000-4000-8000-000000000004',
          fileName: 'binance.csv',
          csvText: BINANCE_MIXED_SAMPLE,
          dryRun: false,
        }),
      }),
    );

    expect(secondResponse.status).toBe(200);
    const secondBody = (await secondResponse.json()) as {
      importedRows: number;
      skippedRows: number;
      failedRows: number;
    };
    expect(secondBody.importedRows).toBe(0);
    expect(secondBody.skippedRows).toBe(2);
    expect(secondBody.failedRows).toBe(0);
    expect(state.assetTransactions).toHaveLength(1);
  });
});
