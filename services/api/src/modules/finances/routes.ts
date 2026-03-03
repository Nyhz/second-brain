import {
  accounts,
  createDbClient,
  desc,
  eq,
  sql,
  transactions,
} from '@second-brain/db';
import {
  createAccountInputSchema,
  createTransactionInputSchema,
  updateTransactionInputSchema,
} from '@second-brain/types';
import type { Elysia } from 'elysia';
import { withTimedDb } from '../../lib/db-timed';
import { ApiHttpError } from '../../lib/errors';

export const registerFinancesRoutes = (app: Elysia, databaseUrl: string) => {
  const { db } = createDbClient(databaseUrl);

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
    return withTimedDb('list_transactions', async () => {
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
    return rows[0];
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
    if (parsed.data.accountId) values.accountId = parsed.data.accountId;
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

    return rows[0];
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
