import { z } from 'zod';

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const accountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  currency: z.string().length(3),
  baseCurrency: z.string().length(3),
  openingBalanceEur: z.number(),
  currentCashBalanceEur: z.number(),
  accountType: z.enum([
    'brokerage',
    'crypto_exchange',
    'investment_platform',
    'checking',
    'savings',
    'cash',
    'credit',
  ]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Account = z.infer<typeof accountSchema>;

export const createAccountInputSchema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3).default('EUR'),
  baseCurrency: z.literal('EUR').default('EUR'),
  openingBalanceEur: z.number().nonnegative().default(0),
  accountType: z.enum([
    'brokerage',
    'crypto_exchange',
    'investment_platform',
    'checking',
    'savings',
    'cash',
    'credit',
  ]),
});

export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const assetTypeSchema = z.enum([
  'stock',
  'etf',
  'mutual_fund',
  'retirement_fund',
  'real_estate',
  'bond',
  'crypto',
  'cash_equivalent',
  'other',
]);

export type AssetType = z.infer<typeof assetTypeSchema>;

export const assetTransactionTypeSchema = z.enum([
  'buy',
  'sell',
  'fee',
  'dividend',
]);
export type AssetTransactionType = z.infer<typeof assetTransactionTypeSchema>;

export const assetTransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  assetId: z.string().uuid(),
  assetType: assetTypeSchema,
  transactionType: assetTransactionTypeSchema,
  tradedAt: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  tradeCurrency: z.string().length(3),
  fxRateToEur: z.number().nullable(),
  cashImpactEur: z.number(),
  feesAmount: z.number(),
  feesCurrency: z.string().length(3).nullable(),
  dividendGross: z.number().nullable(),
  withholdingTax: z.number().nullable(),
  dividendNet: z.number().nullable(),
  externalReference: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AssetTransaction = z.infer<typeof assetTransactionSchema>;

export const createAssetTransactionInputSchema = z
  .object({
    accountId: z.string().uuid(),
    assetType: assetTypeSchema,
    assetId: z.string().uuid(),
    transactionType: assetTransactionTypeSchema,
    tradedAt: z.string(),
    quantity: z.number().nonnegative().default(0),
    unitPrice: z.number().nonnegative().default(0),
    tradeCurrency: z.string().length(3).default('EUR'),
    fxRateToEur: z.number().positive().nullable().optional(),
    feesAmount: z.number().nonnegative().default(0),
    feesCurrency: z.string().length(3).nullable().optional(),
    dividendGross: z.number().nonnegative().nullable().optional(),
    withholdingTax: z.number().nonnegative().nullable().optional(),
    dividendNet: z.number().nonnegative().nullable().optional(),
    externalReference: z.string().trim().min(1).nullable().optional(),
    notes: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.transactionType === 'buy' || value.transactionType === 'sell') {
      if (value.quantity <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantity'],
          message: 'Quantity must be greater than 0 for buy/sell.',
        });
      }
      if (value.unitPrice <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['unitPrice'],
          message: 'Unit price must be greater than 0 for buy/sell.',
        });
      }
    }

    if (value.transactionType === 'fee' && value.feesAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['feesAmount'],
        message: 'Fees amount must be greater than 0 for fee transactions.',
      });
    }

    if (value.transactionType === 'dividend') {
      const gross = value.dividendGross ?? 0;
      const withholding = value.withholdingTax ?? 0;
      const net = value.dividendNet ?? 0;
      if (gross <= 0 || net <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dividendGross'],
          message: 'Dividend gross and net must be greater than 0.',
        });
      }
      if (withholding > gross) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['withholdingTax'],
          message: 'Withholding tax cannot exceed dividend gross.',
        });
      }
    }
  });

export type CreateAssetTransactionInput = z.infer<
  typeof createAssetTransactionInputSchema
>;

export const degiroImportRowResultSchema = z.object({
  rowNumber: z.number().int().positive(),
  status: z.enum(['imported', 'skipped', 'failed']),
  reason: z.string().nullable().optional(),
  externalReference: z.string().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  transactionId: z.string().uuid().nullable().optional(),
});

export type DegiroImportRowResult = z.infer<typeof degiroImportRowResultSchema>;

export const degiroImportRequestSchema = z.object({
  accountId: z.string().uuid(),
  fileName: z.string().trim().min(1),
  csvText: z.string().trim().min(1),
  dryRun: z.boolean().default(true),
});

export type DegiroImportRequest = z.infer<typeof degiroImportRequestSchema>;

export const degiroImportResultSchema = z.object({
  importId: z.string().uuid(),
  source: z.literal('degiro'),
  fileName: z.string(),
  fileHash: z.string(),
  dryRun: z.boolean(),
  totalRows: z.number().int().nonnegative(),
  importedRows: z.number().int().nonnegative(),
  skippedRows: z.number().int().nonnegative(),
  failedRows: z.number().int().nonnegative(),
  results: z.array(degiroImportRowResultSchema),
});

export type DegiroImportResult = z.infer<typeof degiroImportResultSchema>;

export const financesSummarySchema = z.object({
  totalBalance: z.number(),
  accountCount: z.number().int(),
  transactionCount: z.number().int(),
  monthlyInflow: z.number(),
  monthlyOutflow: z.number(),
});

export type FinancesSummary = z.infer<typeof financesSummarySchema>;

export const priceSourceSchema = z.enum(['manual', 'market']);
export type PriceSource = z.infer<typeof priceSourceSchema>;

export const assetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  assetType: assetTypeSchema,
  subtype: z.string().nullable(),
  symbol: z.string().nullable(),
  ticker: z.string().min(1),
  isin: z.string().length(12),
  exchange: z.string().nullable(),
  providerSymbol: z.string().nullable(),
  currency: z.string().length(3),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Asset = z.infer<typeof assetSchema>;

export const assetPositionSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  quantity: z.number(),
  averageCost: z.number().nullable(),
  manualPrice: z.number().nullable(),
  manualPriceAsOf: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AssetPosition = z.infer<typeof assetPositionSchema>;

export const assetWithPositionSchema = assetSchema.extend({
  position: assetPositionSchema.nullable(),
  resolvedUnitPrice: z.number().nullable(),
  resolvedPriceSource: priceSourceSchema.nullable(),
  resolvedPriceAsOf: z.string().nullable(),
  currentValue: z.number().nullable(),
});

export type AssetWithPosition = z.infer<typeof assetWithPositionSchema>;

export const assetValuationSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  valuationDate: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  marketValue: z.number(),
  priceSource: priceSourceSchema,
  createdAt: z.string(),
});

export type AssetValuation = z.infer<typeof assetValuationSchema>;

export const createAssetInputSchema = z
  .object({
    name: z.string().min(1),
    assetType: assetTypeSchema,
    subtype: z.string().trim().min(1).optional(),
    symbol: z.string().trim().min(1).optional(),
    ticker: z.string().trim().min(1),
    isin: z.string().trim().length(12).optional(),
    exchange: z.string().trim().min(1).optional(),
    providerSymbol: z.string().trim().min(1).optional(),
    currency: z.string().length(3).default('EUR'),
    notes: z.string().trim().min(1).optional(),
    quantity: z.number().positive().default(1),
    averageCost: z.number().nonnegative().optional(),
    manualPrice: z.number().positive().optional(),
    manualPriceAsOf: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const needsIsin = new Set([
      'stock',
      'etf',
      'mutual_fund',
      'retirement_fund',
    ]);
    if (needsIsin.has(value.assetType) && !value.isin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isin'],
        message: 'ISIN is required for this asset type.',
      });
    }
  });

export type CreateAssetInput = z.infer<typeof createAssetInputSchema>;

export const updateAssetInputSchema = z
  .object({
    name: z.string().min(1),
    assetType: assetTypeSchema,
    subtype: z.string().trim().min(1).nullable(),
    symbol: z.string().trim().min(1).nullable(),
    ticker: z.string().trim().min(1),
    isin: z.string().trim().length(12),
    exchange: z.string().trim().min(1).nullable(),
    providerSymbol: z.string().trim().min(1).nullable(),
    currency: z.string().length(3),
    notes: z.string().trim().min(1).nullable(),
    isActive: z.boolean(),
  })
  .partial();

export type UpdateAssetInput = z.infer<typeof updateAssetInputSchema>;

export const upsertAssetPositionInputSchema = z.object({
  quantity: z.number().positive(),
  averageCost: z.number().nonnegative().nullable().optional(),
  manualPrice: z.number().positive().nullable().optional(),
  manualPriceAsOf: z.string().nullable().optional(),
});

export type UpsertAssetPositionInput = z.infer<
  typeof upsertAssetPositionInputSchema
>;

export const portfolioAllocationItemSchema = z.object({
  assetType: assetTypeSchema,
  value: z.number(),
  percent: z.number(),
});

export type PortfolioAllocationItem = z.infer<
  typeof portfolioAllocationItemSchema
>;

export const portfolioSummarySchema = z.object({
  cashBalance: z.number(),
  assetValue: z.number(),
  netWorth: z.number(),
  assetCount: z.number().int(),
  allocationByType: z.array(portfolioAllocationItemSchema),
});

export type PortfolioSummary = z.infer<typeof portfolioSummarySchema>;

export const overviewRangeSchema = z.enum([
  '1D',
  '1W',
  '1M',
  'YTD',
  '1Y',
  'MAX',
]);
export type OverviewRange = z.infer<typeof overviewRangeSchema>;

export const overviewAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
});
export type OverviewAccount = z.infer<typeof overviewAccountSchema>;

export const overviewSeriesPointSchema = z.object({
  tsIso: z.string(),
  value: z.number(),
});
export type OverviewSeriesPoint = z.infer<typeof overviewSeriesPointSchema>;

export const overviewPositionRowSchema = z.object({
  assetId: z.string().uuid(),
  symbol: z.string().min(1),
  name: z.string().min(1),
  quoteCurrency: z.string().length(3),
  quantity: z.number(),
  currentUnitQuote: z.number(),
  avgBuyUnitEur: z.number().nullable(),
  avgBuyTotalEur: z.number().nullable(),
  currentUnitEur: z.number(),
  currentTotalEur: z.number(),
  periodPnlValueEur: z.number(),
  periodPnlPct: z.number(),
});
export type OverviewPositionRow = z.infer<typeof overviewPositionRowSchema>;

export const financesOverviewResponseSchema = z.object({
  range: overviewRangeSchema,
  rangeStartIso: z.string(),
  accountId: z.union([z.literal('all'), z.string().uuid()]),
  asOfIso: z.string(),
  previousAsOfIso: z.string().nullable(),
  totalValue: z.number(),
  deltaValue: z.number(),
  deltaPct: z.number(),
  accounts: z.array(overviewAccountSchema),
  series: z.array(overviewSeriesPointSchema),
  positions: z.array(overviewPositionRowSchema),
});
export type FinancesOverviewResponse = z.infer<
  typeof financesOverviewResponseSchema
>;

export const jobRunSchema = z.object({
  id: z.string().uuid(),
  jobName: z.string(),
  scheduledAt: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(['success', 'failed', 'skipped']),
  errorMessage: z.string().nullable(),
  metricsJson: z.record(z.unknown()),
});

export type JobRun = z.infer<typeof jobRunSchema>;

export const serviceNameSchema = z.enum(['api', 'worker', 'caddy']);
export type ServiceName = z.infer<typeof serviceNameSchema>;

export const serviceStatusSchema = z.enum([
  'operational',
  'degraded',
  'down',
  'unknown',
]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const serviceStatusPointSchema = z.object({
  hourIso: z.string(),
  status: serviceStatusSchema,
  latencyMs: z.number().int().nullable(),
  httpStatus: z.number().int().nullable(),
});
export type ServiceStatusPoint = z.infer<typeof serviceStatusPointSchema>;

export const serviceStatusHistorySchema = z.object({
  service: serviceNameSchema,
  points: z.array(serviceStatusPointSchema),
});
export type ServiceStatusHistory = z.infer<typeof serviceStatusHistorySchema>;

export const serviceStatusHistoryResponseSchema = z.object({
  generatedAt: z.string(),
  services: z.array(serviceStatusHistorySchema),
});
export type ServiceStatusHistoryResponse = z.infer<
  typeof serviceStatusHistoryResponseSchema
>;

export const serviceCheckNowResultSchema = z.object({
  service: serviceNameSchema,
  status: serviceStatusSchema,
  targetUrl: z.string(),
  checkedAt: z.string(),
  latencyMs: z.number().int().nullable(),
  httpStatus: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
});
export type ServiceCheckNowResult = z.infer<typeof serviceCheckNowResultSchema>;

export const serviceCheckNowResponseSchema = z.object({
  checkedAt: z.string(),
  results: z.array(serviceCheckNowResultSchema),
});
export type ServiceCheckNowResponse = z.infer<
  typeof serviceCheckNowResponseSchema
>;
