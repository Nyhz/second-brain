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
