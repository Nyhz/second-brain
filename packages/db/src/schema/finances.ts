import {
  index,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const financesSchema = pgSchema('finances');

export const accounts = financesSchema.table('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  accountType: varchar('account_type', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transactions = financesSchema.table(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    description: text('description').notNull(),
    category: varchar('category', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountPostedIdx: index('transactions_account_posted_idx').on(
      table.accountId,
      table.postedAt,
    ),
  }),
);

export const dailyBalances = financesSchema.table(
  'daily_balances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    balanceDate: timestamp('balance_date', { withTimezone: false }).notNull(),
    balance: numeric('balance', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountDateIdx: index('daily_balances_account_date_idx').on(
      table.accountId,
      table.balanceDate,
    ),
  }),
);

export const priceHistory = financesSchema.table(
  'price_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    symbol: varchar('symbol', { length: 16 }).notNull(),
    pricedAt: timestamp('priced_at', { withTimezone: true }).notNull(),
    price: numeric('price', { precision: 18, scale: 6 }).notNull(),
    source: varchar('source', { length: 64 }).notNull().default('synthetic'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    symbolPricedIdx: index('price_history_symbol_priced_idx').on(
      table.symbol,
      table.pricedAt,
    ),
  }),
);
