export type AccountFormValidation =
  | { ok: true; normalized: { name: string } }
  | { ok: false; message: string };

export const validateAccountForm = (name: string): AccountFormValidation => {
  const normalizedName = name.trim();

  if (!normalizedName) {
    return { ok: false, message: 'Account name is required.' };
  }

  return {
    ok: true,
    normalized: { name: normalizedName },
  };
};
