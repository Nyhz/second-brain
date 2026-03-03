import { beforeEach, describe, expect, mock, test } from 'bun:test';

const state = {
  assets: [
    {
      asset_id: 'a-market',
      symbol: 'SPY',
      quantity: '2.00000000',
      manual_price: null,
      market_price: '500.25',
    },
    {
      asset_id: 'a-manual',
      symbol: null,
      quantity: '1.00000000',
      manual_price: '250000.00',
      market_price: null,
    },
    {
      asset_id: 'a-unpriced',
      symbol: null,
      quantity: '1.00000000',
      manual_price: null,
      market_price: null,
    },
  ],
  inserts: [] as Array<{
    assetId: string;
    priceSource: string;
    marketValue: number;
  }>,
};

mock.module('@second-brain/db', () => {
  const createDbClient = () => ({
    db: {
      execute: async () => state.assets,
    },
    sql: Object.assign(
      async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<unknown[]> => {
        const text = String.raw({ raw: strings }, ...values.map(String));
        if (text.includes('insert into finances.asset_valuations')) {
          state.inserts.push({
            assetId: String(values[0]),
            marketValue: Number(values[3]),
            priceSource: String(values[4]),
          });
        }
        return [];
      },
      {
        end: async () => {},
      },
    ),
  });

  return {
    createDbClient,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: String.raw({ raw: strings }, ...values),
    }),
  };
});

const { snapshotAssetValuations } = await import(
  '../src/jobs/snapshot-asset-valuations'
);

beforeEach(() => {
  state.inserts = [];
});

describe('snapshotAssetValuations', () => {
  test('upserts valuations using market then manual fallback', async () => {
    const result = await snapshotAssetValuations('postgres://ignored');

    expect(result.activeAssets).toBe(3);
    expect(result.assetsSnapshotted).toBe(2);
    expect(state.inserts.length).toBe(2);

    const marketInsert = state.inserts.find(
      (insert) => insert.assetId === 'a-market',
    );
    const manualInsert = state.inserts.find(
      (insert) => insert.assetId === 'a-manual',
    );

    expect(marketInsert?.priceSource).toBe('market');
    expect(marketInsert?.marketValue).toBe(1000.5);

    expect(manualInsert?.priceSource).toBe('manual');
    expect(manualInsert?.marketValue).toBe(250000);
  });
});
