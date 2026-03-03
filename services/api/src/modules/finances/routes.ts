import {
  accounts,
  and,
  assetPositions,
  assets,
  createDbClient,
  desc,
  eq,
  sql,
  transactions,
} from '@second-brain/db';
import {
  type Asset,
  type AssetPosition,
  type AssetType,
  type Transaction,
  createAccountInputSchema,
  createAssetInputSchema,
  createTransactionInputSchema,
  updateAssetInputSchema,
  updateTransactionInputSchema,
  upsertAssetPositionInputSchema,
} from '@second-brain/types';
import type { Elysia } from 'elysia';
import { withTimedDb } from '../../lib/db-timed';
import { ApiHttpError } from '../../lib/errors';

const serializeTransaction = (row: Record<string, unknown>): Transaction => ({
  id: String(row.id),
  accountId: String(row.accountId),
  postedAt:
    row.postedAt instanceof Date
      ? row.postedAt.toISOString()
      : String(row.postedAt),
  amount: Number(row.amount),
  description: String(row.description),
  category: String(row.category),
  createdAt:
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
  updatedAt:
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt),
});

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
  currency: String(row.currency),
  isActive: Boolean(row.isActive),
  notes:
    row.notes === null || row.notes === undefined ? null : String(row.notes),
  createdAt:
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
  updatedAt:
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt),
});

const serializeAssetPosition = (
  row: Record<string, unknown>,
): AssetPosition => ({
  id: String(row.id),
  assetId: String(row.assetId),
  quantity: Number(row.quantity),
  averageCost:
    row.averageCost === null || row.averageCost === undefined
      ? null
      : Number(row.averageCost),
  manualPrice:
    row.manualPrice === null || row.manualPrice === undefined
      ? null
      : Number(row.manualPrice),
  manualPriceAsOf:
    row.manualPriceAsOf instanceof Date
      ? row.manualPriceAsOf.toISOString()
      : row.manualPriceAsOf === null || row.manualPriceAsOf === undefined
        ? null
        : String(row.manualPriceAsOf),
  createdAt:
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
  updatedAt:
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt),
});

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

        if (asset.symbol) {
          const [priceRow] = await db.execute(sql`
            select
              price,
              priced_at as "pricedAt"
            from finances.price_history
            where symbol = ${asset.symbol}
            order by priced_at desc
            limit 1
          `);

          if (priceRow) {
            resolvedUnitPrice = Number(priceRow.price);
            resolvedPriceSource = 'market';
            resolvedPriceAsOf =
              priceRow.pricedAt instanceof Date
                ? priceRow.pricedAt.toISOString()
                : String(priceRow.pricedAt);
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

  app.get('/finances/accounts', async () => {
    return withTimedDb('list_accounts', async () => {
      return db.select().from(accounts).orderBy(desc(accounts.createdAt));
    });
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

    const rows = await withTimedDb('create_account', async () => {
      return db
        .insert(accounts)
        .values({
          name: parsed.data.name,
          currency: parsed.data.currency,
          accountType: parsed.data.accountType,
        })
        .returning();
    });

    set.status = 201;
    return rows[0];
  });

  app.get('/finances/transactions', async ({ query }) => {
    const accountId = query.accountId as string | undefined;
    const rows = await withTimedDb('list_transactions', async () => {
      if (accountId) {
        return db
          .select()
          .from(transactions)
          .where(eq(transactions.accountId, accountId))
          .orderBy(desc(transactions.postedAt));
      }
      return db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.postedAt));
    });
    return rows.map((row) =>
      serializeTransaction(row as Record<string, unknown>),
    );
  });

  app.post('/finances/transactions', async ({ body, set }) => {
    const parsed = createTransactionInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid transaction payload',
        parsed.error.format(),
      );
    }

    const account = await withTimedDb(
      'transaction_account_exists',
      async () => {
        return db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.id, parsed.data.accountId));
      },
    );

    if (account.length === 0) {
      throw new ApiHttpError(
        404,
        'ACCOUNT_NOT_FOUND',
        'Account does not exist',
      );
    }

    const rows = await withTimedDb('create_transaction', async () => {
      return db
        .insert(transactions)
        .values({
          accountId: parsed.data.accountId,
          postedAt: new Date(parsed.data.postedAt),
          amount: parsed.data.amount.toString(),
          description: parsed.data.description,
          category: parsed.data.category,
        })
        .returning();
    });

    set.status = 201;
    return serializeTransaction(rows[0] as Record<string, unknown>);
  });

  app.patch('/finances/transactions/:id', async ({ params, body }) => {
    const parsed = updateTransactionInputSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      throw new ApiHttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid transaction update payload',
        parsed.success ? undefined : parsed.error.format(),
      );
    }

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.accountId) {
      const account = await withTimedDb(
        'update_transaction_account_exists',
        async () => {
          return db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.id, parsed.data.accountId as string));
        },
      );
      if (account.length === 0) {
        throw new ApiHttpError(
          404,
          'ACCOUNT_NOT_FOUND',
          'Account does not exist',
        );
      }
      values.accountId = parsed.data.accountId;
    }
    if (parsed.data.postedAt) values.postedAt = new Date(parsed.data.postedAt);
    if (typeof parsed.data.amount === 'number')
      values.amount = parsed.data.amount.toString();
    if (parsed.data.description) values.description = parsed.data.description;
    if (parsed.data.category) values.category = parsed.data.category;

    const rows = await withTimedDb('update_transaction', async () => {
      return db
        .update(transactions)
        .set(values)
        .where(eq(transactions.id, params.id))
        .returning();
    });

    if (rows.length === 0) {
      throw new ApiHttpError(
        404,
        'TRANSACTION_NOT_FOUND',
        'Transaction does not exist',
      );
    }

    return serializeTransaction(rows[0] as Record<string, unknown>);
  });

  app.delete('/finances/transactions/:id', async ({ params, set }) => {
    const rows = await withTimedDb('delete_transaction', async () => {
      return db
        .delete(transactions)
        .where(eq(transactions.id, params.id))
        .returning({ id: transactions.id });
    });

    if (rows.length === 0) {
      throw new ApiHttpError(
        404,
        'TRANSACTION_NOT_FOUND',
        'Transaction does not exist',
      );
    }

    set.status = 204;
    return;
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

    const [assetRow] = await withTimedDb('create_asset', async () => {
      return db
        .insert(assets)
        .values({
          name: parsed.data.name,
          assetType: parsed.data.assetType,
          subtype: normalizedSubtype || null,
          symbol: normalizedSymbol || null,
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
    const [cashResult] = await withTimedDb(
      'portfolio_cash_summary',
      async () => {
        return db.execute(sql`
        select
          coalesce(sum(amount), 0)::numeric as cash_balance
        from finances.transactions
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
    const cashBalance = Number(cashResult?.cash_balance ?? 0);
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
      pricedAt:
        row.priced_at instanceof Date
          ? row.priced_at.toISOString()
          : String(row.priced_at),
      source: String(row.source),
    }));
  });

  app.get('/finances/summary', async () => {
    const [result] = await withTimedDb('finances_summary', async () => {
      return db.execute(sql`
        with tx as (
          select
            coalesce(sum(amount), 0)::numeric as total_balance,
            coalesce(sum(case when amount > 0 and posted_at >= date_trunc('month', now()) then amount else 0 end), 0)::numeric as monthly_inflow,
            coalesce(sum(case when amount < 0 and posted_at >= date_trunc('month', now()) then amount else 0 end), 0)::numeric as monthly_outflow,
            count(*)::int as transaction_count
          from finances.transactions
        ),
        ac as (
          select count(*)::int as account_count
          from finances.accounts
        )
        select
          tx.total_balance,
          tx.monthly_inflow,
          tx.monthly_outflow,
          tx.transaction_count,
          ac.account_count
        from tx, ac
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
