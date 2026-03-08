export const resolvePageSize = (
  value: string | undefined,
  allowed: readonly number[],
  fallback: number,
) => {
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : fallback;
};

export const clampPage = (value: string | undefined, totalPages: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(Math.max(1, parsed), totalPages);
};
