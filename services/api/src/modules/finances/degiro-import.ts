import { createAssetTransactionInputSchema } from '@second-brain/types';

const REQUIRED_HEADERS = new Set([
  'Date',
  'Time',
  'Product',
  'ISIN',
  'Quantity',
  'Price',
  'Local value',
  'Value EUR',
  'Transaction and/or third party fees EUR',
  'Total EUR',
  'Order ID',
]);

const readCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    if (row.length === 0 && field.length === 0) {
      return;
    }
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      pushField();
      continue;
    }

    if (char === '\n' && !inQuotes) {
      pushRow();
      continue;
    }

    if (char === '\r' && !inQuotes) {
      if (next === '\n') {
        continue;
      }
      pushRow();
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
};

const clean = (value: string | undefined) => (value ?? '').trim();

const parseLocalizedNumber = (value: string): number | null => {
  const trimmed = clean(value);
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/\s/g, '');
  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseIsoTimestamp = (dateValue: string, timeValue: string) => {
  const [dayRaw, monthRaw, yearRaw] = clean(dateValue).split('-');
  const [hourRaw, minuteRaw] = clean(timeValue).split(':');

  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  if (
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toISOString();
};

const inferAssetType = (productName: string) => {
  const upper = productName.toUpperCase();
  if (
    upper.includes('ETF') ||
    upper.includes('ETC') ||
    upper.includes('UCITS')
  ) {
    return 'etf' as const;
  }
  if (upper.includes('BOND')) {
    return 'bond' as const;
  }
  return 'stock' as const;
};

const makeTicker = (productName: string, isin: string) => {
  const candidate = productName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  if (candidate.length >= 2) {
    return candidate;
  }
  return isin.slice(-8);
};

const isCurrency = (value: string) => /^[A-Z]{3}$/.test(value);

type ParsedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: {
    tradedAt: string;
    product: string;
    isin: string;
    quantity: number;
    unitPrice: number;
    transactionType: 'buy' | 'sell';
    tradeCurrency: string;
    fxRateToEur: number | null;
    feesAmount: number;
    feesCurrency: 'EUR';
    totalEur: number;
    externalReference: string | null;
  } | null;
  error: string | null;
};

export type DegiroParsedCsv = {
  rows: ParsedRow[];
};

export const parseDegiroTransactionsCsv = (
  csvText: string,
): DegiroParsedCsv => {
  const lines = readCsv(csvText);
  if (lines.length < 2) {
    throw new Error('CSV has no data rows.');
  }

  const header = lines[0]?.map((cell) => clean(cell)) ?? [];
  const headerSet = new Set(header.filter(Boolean));
  for (const required of REQUIRED_HEADERS) {
    if (!headerSet.has(required)) {
      throw new Error(`Unsupported CSV header. Missing "${required}".`);
    }
  }

  const rows: ParsedRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const row = lines[index] ?? [];
    const get = (position: number) => clean(row[position]);

    const raw = {
      date: get(0),
      time: get(1),
      product: get(2),
      isin: get(3),
      quantity: get(6),
      price: get(7),
      tradeCurrency: get(8),
      localValue: get(9),
      localValueCurrency: get(10),
      valueEur: get(11),
      exchangeRate: get(12),
      autoFxFee: get(13),
      feesEur: get(14),
      totalEur: get(15),
      orderId: get(16) || get(17),
    };

    const rowNumber = index + 1;
    const tradedAt = parseIsoTimestamp(raw.date, raw.time);
    const quantity = parseLocalizedNumber(raw.quantity);
    const unitPrice = parseLocalizedNumber(raw.price);
    const totalEur = parseLocalizedNumber(raw.totalEur);
    const valueEur = parseLocalizedNumber(raw.valueEur);
    const localValue = parseLocalizedNumber(raw.localValue);
    const exchangeRate = parseLocalizedNumber(raw.exchangeRate);
    const feesEur = parseLocalizedNumber(raw.feesEur);
    const inferredTotal = totalEur ?? valueEur;

    if (!tradedAt) {
      rows.push({
        rowNumber,
        raw,
        normalized: null,
        error: 'Invalid Date/Time fields.',
      });
      continue;
    }
    if (!raw.product) {
      rows.push({
        rowNumber,
        raw,
        normalized: null,
        error: 'Missing Product value.',
      });
      continue;
    }
    if (!/^[A-Z0-9]{12}$/.test(raw.isin)) {
      rows.push({
        rowNumber,
        raw,
        normalized: null,
        error: 'Missing or invalid ISIN.',
      });
      continue;
    }
    if (!quantity || quantity <= 0) {
      rows.push({
        rowNumber,
        raw,
        normalized: null,
        error: 'Quantity must be greater than 0.',
      });
      continue;
    }
    if (!unitPrice || unitPrice <= 0) {
      rows.push({
        rowNumber,
        raw,
        normalized: null,
        error: 'Price must be greater than 0.',
      });
      continue;
    }
    if (!inferredTotal || inferredTotal === 0) {
      rows.push({
        rowNumber,
        raw,
        normalized: null,
        error: 'Cannot infer transaction type from Total EUR / Value EUR.',
      });
      continue;
    }

    const transactionType: 'buy' | 'sell' = inferredTotal < 0 ? 'buy' : 'sell';
    const tradeCurrencyRaw = clean(
      raw.tradeCurrency || raw.localValueCurrency,
    ).toUpperCase();
    const tradeCurrency = isCurrency(tradeCurrencyRaw)
      ? tradeCurrencyRaw
      : isCurrency(raw.localValueCurrency.toUpperCase())
        ? raw.localValueCurrency.toUpperCase()
        : 'EUR';

    let fxRateToEur: number | null = null;
    if (tradeCurrency !== 'EUR') {
      const primary =
        localValue && localValue !== 0 && valueEur
          ? Math.abs(valueEur / localValue)
          : null;
      const fallback =
        exchangeRate && exchangeRate > 0 ? Math.abs(1 / exchangeRate) : null;
      fxRateToEur = primary && primary > 0 ? primary : fallback;
      if (!fxRateToEur || !Number.isFinite(fxRateToEur)) {
        rows.push({
          rowNumber,
          raw,
          normalized: null,
          error: 'Missing FX conversion data for non-EUR trade.',
        });
        continue;
      }
    }

    const normalized = {
      tradedAt,
      product: raw.product,
      isin: raw.isin,
      quantity: Math.abs(quantity),
      unitPrice,
      transactionType,
      tradeCurrency,
      fxRateToEur,
      feesAmount: Math.abs(feesEur ?? 0),
      feesCurrency: 'EUR' as const,
      totalEur: inferredTotal,
      externalReference: raw.orderId || null,
    };

    const validation = createAssetTransactionInputSchema.safeParse({
      accountId: crypto.randomUUID(),
      assetType: inferAssetType(raw.product),
      assetId: crypto.randomUUID(),
      transactionType: normalized.transactionType,
      tradedAt: normalized.tradedAt,
      quantity: normalized.quantity,
      unitPrice: normalized.unitPrice,
      tradeCurrency: normalized.tradeCurrency,
      fxRateToEur: normalized.fxRateToEur,
      feesAmount: normalized.feesAmount,
      feesCurrency: normalized.feesCurrency,
      externalReference: normalized.externalReference,
      notes: null,
    });

    if (!validation.success) {
      rows.push({
        rowNumber,
        raw,
        normalized: null,
        error: 'Row failed transaction schema validation.',
      });
      continue;
    }

    rows.push({
      rowNumber,
      raw,
      normalized,
      error: null,
    });
  }

  return { rows };
};

export const getDegiroAssetType = inferAssetType;
export const getDegiroTicker = makeTicker;
