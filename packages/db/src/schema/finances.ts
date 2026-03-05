import {
  boolean,
  date,
  index,
  integer,
  jsonb,
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
  baseCurrency: varchar('base_currency', { length: 3 })
    .notNull()
    .default('EUR'),
  openingBalanceEur: numeric('opening_balance_eur', {
    precision: 18,
    scale: 2,
  })
    .notNull()
    .default('0'),
  accountType: varchar('account_type', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    pricedDateUtc: date('priced_date_utc').notNull(),
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
    symbolSourceDateUniqueIdx: uniqueIndex(
      'price_history_symbol_source_priced_date_uidx',
    ).on(table.symbol, table.source, table.pricedDateUtc),
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
    ticker: varchar('ticker', { length: 32 }).notNull(),
    isin: varchar('isin', { length: 12 }).notNull(),
    exchange: varchar('exchange', { length: 64 }),
    providerSymbol: varchar('provider_symbol', { length: 64 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
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
    tickerIdx: index('assets_ticker_idx').on(table.ticker),
    isinIdx: uniqueIndex('assets_isin_uidx').on(table.isin),
  }),
);

export const assetTransactions = financesSchema.table(
  'asset_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    transactionType: varchar('transaction_type', { length: 16 }).notNull(),
    tradedAt: timestamp('traded_at', { withTimezone: true }).notNull(),
    quantity: numeric('quantity', { precision: 24, scale: 8 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 6 }).notNull(),
    tradeCurrency: varchar('trade_currency', { length: 3 }).notNull(),
    fxRateToEur: numeric('fx_rate_to_eur', { precision: 18, scale: 8 }),
    cashImpactEur: numeric('cash_impact_eur', { precision: 18, scale: 2 })
      .notNull()
      .default('0'),
    feesAmount: numeric('fees_amount', { precision: 18, scale: 6 })
      .notNull()
      .default('0'),
    feesCurrency: varchar('fees_currency', { length: 3 }),
    dividendGross: numeric('dividend_gross', { precision: 18, scale: 6 }),
    withholdingTax: numeric('withholding_tax', { precision: 18, scale: 6 }),
    dividendNet: numeric('dividend_net', { precision: 18, scale: 6 }),
    externalReference: text('external_reference'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountTradedIdx: index('asset_transactions_account_traded_idx').on(
      table.accountId,
      table.tradedAt,
    ),
    assetTradedIdx: index('asset_transactions_asset_traded_idx').on(
      table.assetId,
      table.tradedAt,
    ),
    accountAssetTradedIdx: index(
      'asset_transactions_account_asset_traded_idx',
    ).on(table.accountId, table.assetId, table.tradedAt),
    typeTradedIdx: index('asset_transactions_type_traded_idx').on(
      table.transactionType,
      table.tradedAt,
    ),
    accountExternalRefUniqueIdx: uniqueIndex(
      'asset_transactions_account_external_reference_uidx',
    ).on(table.accountId, table.externalReference),
  }),
);

export const transactionImports = financesSchema.table(
  'transaction_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: varchar('source', { length: 32 }).notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    fileHash: varchar('file_hash', { length: 64 }).notNull(),
    dryRun: boolean('dry_run').notNull().default(true),
    totalRows: integer('total_rows').notNull().default(0),
    importedRows: integer('imported_rows').notNull().default(0),
    skippedRows: integer('skipped_rows').notNull().default(0),
    failedRows: integer('failed_rows').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    accountCreatedIdx: index('transaction_imports_account_created_idx').on(
      table.accountId,
      table.createdAt,
    ),
    fileHashIdx: index('transaction_imports_file_hash_idx').on(table.fileHash),
  }),
);

export const transactionImportRows = financesSchema.table(
  'transaction_import_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    importId: uuid('import_id')
      .notNull()
      .references(() => transactionImports.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    externalReference: text('external_reference'),
    assetId: uuid('asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    transactionId: uuid('transaction_id').references(
      () => assetTransactions.id,
      {
        onDelete: 'set null',
      },
    ),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    importRowIdx: index('transaction_import_rows_import_row_idx').on(
      table.importId,
      table.rowNumber,
    ),
    importStatusIdx: index('transaction_import_rows_import_status_idx').on(
      table.importId,
      table.status,
    ),
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
