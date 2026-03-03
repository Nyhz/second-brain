export type AccountFormValidation =
  | { ok: true; normalized: { name: string; currency: string } }
  | { ok: false; message: string };

export const validateAccountForm = (
  name: string,
  currency: string,
): AccountFormValidation => {
  const normalizedName = name.trim();
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!normalizedName) {
    return { ok: false, message: 'Account name is required.' };
  }

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return {
      ok: false,
      message: 'Currency must be a 3-letter code (for example, USD).',
    };
  }

  return {
    ok: true,
    normalized: { name: normalizedName, currency: normalizedCurrency },
  };
};
