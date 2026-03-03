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
  accountType: z.enum(['checking', 'savings', 'cash', 'credit']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Account = z.infer<typeof accountSchema>;

export const transactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  postedAt: z.string(),
  amount: z.number(),
  description: z.string().min(1),
  category: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Transaction = z.infer<typeof transactionSchema>;

export const createAccountInputSchema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3).default('USD'),
  accountType: z.enum(['checking', 'savings', 'cash', 'credit']),
});

export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const createTransactionInputSchema = z.object({
  accountId: z.string().uuid(),
  postedAt: z.string(),
  amount: z.number(),
  description: z.string().min(1),
  category: z.string().min(1),
});

export type CreateTransactionInput = z.infer<
  typeof createTransactionInputSchema
>;

export const updateTransactionInputSchema =
  createTransactionInputSchema.partial();

export type UpdateTransactionInput = z.infer<
  typeof updateTransactionInputSchema
>;

export const financesSummarySchema = z.object({
  totalBalance: z.number(),
  accountCount: z.number().int(),
  transactionCount: z.number().int(),
  monthlyInflow: z.number(),
  monthlyOutflow: z.number(),
});

export type FinancesSummary = z.infer<typeof financesSummarySchema>;

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

export const priceSourceSchema = z.enum(['manual', 'market']);
export type PriceSource = z.infer<typeof priceSourceSchema>;

export const assetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  assetType: assetTypeSchema,
  subtype: z.string().nullable(),
  symbol: z.string().nullable(),
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

export const createAssetInputSchema = z.object({
  name: z.string().min(1),
  assetType: assetTypeSchema,
  subtype: z.string().trim().min(1).optional(),
  symbol: z.string().trim().min(1).optional(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().trim().min(1).optional(),
  quantity: z.number().positive().default(1),
  averageCost: z.number().nonnegative().optional(),
  manualPrice: z.number().positive().optional(),
  manualPriceAsOf: z.string().optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetInputSchema>;

export const updateAssetInputSchema = z
  .object({
    name: z.string().min(1),
    assetType: assetTypeSchema,
    subtype: z.string().trim().min(1).nullable(),
    symbol: z.string().trim().min(1).nullable(),
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
