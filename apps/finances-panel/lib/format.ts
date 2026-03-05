const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('en-US');

export const formatMoney = (value: number): string => {
  return currencyFormatter.format(value);
};

export const formatInteger = (value: number): string => {
  return integerFormatter.format(value);
};

export const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

export const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return parsed.toISOString().slice(0, 10);
};
