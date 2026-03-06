const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('en-US');
const MADRID_TIME_ZONE = 'Europe/Madrid';
const madridDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const madridDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const madridOffsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MADRID_TIME_ZONE,
  timeZoneName: 'shortOffset',
});

export const formatMoney = (value: number): string => {
  return currencyFormatter.format(value);
};

export const formatInteger = (value: number): string => {
  return integerFormatter.format(value);
};

const getPart = (parts: Intl.DateTimeFormatPart[], type: string) =>
  parts.find((part) => part.type === type)?.value ?? '';

const madridZoneLabel = (value: Date) => {
  const offset = getPart(madridOffsetFormatter.formatToParts(value), 'timeZoneName');
  if (offset.includes('+2')) return 'CEST';
  return 'CET';
};

export const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  const parts = madridDateTimeFormatter.formatToParts(parsed);
  const year = getPart(parts, 'year');
  const month = getPart(parts, 'month');
  const day = getPart(parts, 'day');
  const hour = getPart(parts, 'hour');
  const minute = getPart(parts, 'minute');
  return `${year}-${month}-${day} ${hour}:${minute} ${madridZoneLabel(parsed)}`;
};

export const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  const parts = madridDateFormatter.formatToParts(parsed);
  const year = getPart(parts, 'year');
  const month = getPart(parts, 'month');
  const day = getPart(parts, 'day');
  return `${year}-${month}-${day}`;
};
