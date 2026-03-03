export type TransactionFormInput = {
  accountId: string;
  postedAt: string;
  amount: string;
  description: string;
  category: string;
};

export type TransactionFormValidation =
  | {
      ok: true;
      normalized: Omit<TransactionFormInput, 'amount'> & { amount: number };
    }
  | { ok: false; message: string };

export const toInputDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
};

export const validateTransactionForm = (
  input: TransactionFormInput,
): TransactionFormValidation => {
  if (!input.accountId) {
    return {
      ok: false,
      message: 'Select an account before creating a transaction.',
    };
  }

  const numericAmount = Number(input.amount);
  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    return { ok: false, message: 'Amount must be a non-zero number.' };
  }

  const description = input.description.trim();
  const category = input.category.trim();
  if (!description || !category) {
    return { ok: false, message: 'Description and category are required.' };
  }

  return {
    ok: true,
    normalized: {
      accountId: input.accountId,
      postedAt: input.postedAt,
      amount: numericAmount,
      description,
      category,
    },
  };
};
