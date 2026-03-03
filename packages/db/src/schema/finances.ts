import {
  boolean,
  index,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
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

export const assets = financesSchema.table(
  'assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    assetType: varchar('asset_type', { length: 32 }).notNull(),
    subtype: varchar('subtype', { length: 64 }),
    symbol: varchar('symbol', { length: 32 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    typeActiveIdx: index('assets_type_active_idx').on(
      table.assetType,
      table.isActive,
    ),
    symbolIdx: index('assets_symbol_idx').on(table.symbol),
  }),
);

export const assetPositions = financesSchema.table(
  'asset_positions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' })
      .unique(),
    quantity: numeric('quantity', { precision: 24, scale: 8 })
      .notNull()
      .default('1'),
    averageCost: numeric('average_cost', { precision: 18, scale: 6 }),
    manualPrice: numeric('manual_price', { precision: 18, scale: 6 }),
    manualPriceAsOf: timestamp('manual_price_as_of', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    assetIdx: index('asset_positions_asset_id_idx').on(table.assetId),
  }),
);

export const assetValuations = financesSchema.table(
  'asset_valuations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    valuationDate: timestamp('valuation_date', {
      withTimezone: false,
    }).notNull(),
    quantity: numeric('quantity', { precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 6 }).notNull(),
    marketValue: numeric('market_value', { precision: 18, scale: 2 }).notNull(),
    priceSource: varchar('price_source', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    assetDateUniqueIdx: uniqueIndex('asset_valuations_asset_date_uidx').on(
      table.assetId,
      table.valuationDate,
    ),
    assetDateIdx: index('asset_valuations_asset_date_idx').on(
      table.assetId,
      table.valuationDate,
    ),
    dateIdx: index('asset_valuations_date_idx').on(table.valuationDate),
  }),
);
