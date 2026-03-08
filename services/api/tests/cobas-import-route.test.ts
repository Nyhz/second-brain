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

const mkImportId = () =>
  `90000000-0000-4000-8000-${String(state.imports.length + 1).padStart(12, '0')}`;
const mkTxId = () =>
  `91000000-0000-4000-8000-${String(state.assetTransactions.length + 1).padStart(12, '0')}`;

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
                  mapped.filter((row) =>
                    matches(row as Record<string, unknown>, condition),
                  ),
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

const COBAS_SAMPLE =
  `"Operacion","Producto","Fecha","Tipo","Estado","Participaciones","Importe bruto","Importe neto","Valor liquidativo","Es total","Fecha inicio","Fecha fin","Periodicidad"\n` +
  `"O-BEG7087","Cobas Internacional FI Clase D","3/3/2026","Suscripción","Finalizada","0.434482","125€","125€","287.699004€","","","",""\n` +
  `"O-BEF8309","Cobas Internacional FI Clase D","2/11/2026","Suscripción","Finalizada","0.438709","125€","125€","284.926826€","","","",""\n` +
  `"O-BEE0326","Cobas Internacional FI Clase D","1/8/2026","Suscripción","Finalizada","0.483043","125€","125€","258.776232€","","","",""\n` +
  `"O-BEC7162","Cobas Internacional FI Clase D","12/2/2025","Suscripción","Finalizada","0.520569","125€","125€","240.121669€","","","",""\n` +
  `"O-BEB8800","Cobas Internacional FI Clase D","11/3/2025","Suscripción","Finalizada","0.527906","125€","125€","236.784534€","","","",""\n` +
  `"OSP-BEB6428","Cobas Internacional FI Clase D","10/27/2025","Solicitud de Suscripción Periódica","Periódica Activa","","125€","","","","11/10/2025","","MENSUAL"\n` +
  `"OSP-BEB4182","Cobas Internacional FI Clase D","10/14/2025","Solicitud de Suscripción Periódica","Anulada","","125€","","","","11/10/2025","","MENSUAL"\n` +
  `"OS-BEA1887","Cobas Internacional FI Clase D","9/1/2025","Suscripción","Finalizada","4.391739","1000€","1000€","227.700215€","","","",""`;

describe('cobas import endpoint', () => {
  test('rejects import into non-investment-platform account', async () => {
    state.accounts.push({
      id: '20000000-0000-4000-8000-000000000001',
      accountType: 'brokerage',
    });

    const app = buildApp();
    const response = await app.handle(
      new Request('http://local/finances/import/cobas-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '20000000-0000-4000-8000-000000000001',
          fileName: 'cobas.csv',
          csvText: COBAS_SAMPLE,
          dryRun: true,
        }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('IMPORT_ACCOUNT_TYPE_NOT_SUPPORTED');
  });

  test('fails whole import when symbol cannot be resolved', async () => {
    state.accounts.push({
      id: '20000000-0000-4000-8000-000000000002',
      accountType: 'investment_platform',
    });

    const app = buildApp();
    const response = await app.handle(
      new Request('http://local/finances/import/cobas-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '20000000-0000-4000-8000-000000000002',
          fileName: 'cobas.csv',
          csvText: COBAS_SAMPLE,
          dryRun: true,
        }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('UNKNOWN_ASSET_SYMBOL');
  });

  test('dry run returns expected counts for sample', async () => {
    state.accounts.push({
      id: '20000000-0000-4000-8000-000000000003',
      accountType: 'investment_platform',
    });
    state.assets.push({
      id: '30000000-0000-4000-8000-000000000001',
      assetType: 'mutual_fund',
      symbol: 'COBAS',
      ticker: 'COBAS',
    });

    const app = buildApp();
    const response = await app.handle(
      new Request('http://local/finances/import/cobas-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '20000000-0000-4000-8000-000000000003',
          fileName: 'cobas.csv',
          csvText: COBAS_SAMPLE,
          dryRun: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe('cobas');
    expect(body.totalRows).toBe(8);
    expect(body.importedRows).toBe(0);
    expect(body.skippedRows).toBe(8);
    expect(body.failedRows).toBe(0);
    expect(state.assetTransactions).toHaveLength(0);
  });

  test('commit imports subscriptions and re-import skips duplicates', async () => {
    state.accounts.push({
      id: '20000000-0000-4000-8000-000000000004',
      accountType: 'investment_platform',
    });
    state.assets.push({
      id: '30000000-0000-4000-8000-000000000001',
      assetType: 'mutual_fund',
      symbol: 'COBAS',
      ticker: 'COBAS',
    });

    const app = buildApp();
    const first = await app.handle(
      new Request('http://local/finances/import/cobas-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '20000000-0000-4000-8000-000000000004',
          fileName: 'cobas.csv',
          csvText: COBAS_SAMPLE,
          dryRun: false,
        }),
      }),
    );
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.importedRows).toBe(6);
    expect(firstBody.skippedRows).toBe(2);
    expect(firstBody.failedRows).toBe(0);
    expect(state.assetTransactions).toHaveLength(6);

    const second = await app.handle(
      new Request('http://local/finances/import/cobas-transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: '20000000-0000-4000-8000-000000000004',
          fileName: 'cobas.csv',
          csvText: COBAS_SAMPLE,
          dryRun: false,
        }),
      }),
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.importedRows).toBe(0);
    expect(secondBody.skippedRows).toBe(8);
    expect(secondBody.failedRows).toBe(0);
    expect(state.assetTransactions).toHaveLength(6);
  });
});
