import { createAssetTransactionInputSchema } from '@second-brain/types';

const REQUIRED_HEADERS = new Set([
  'Operacion',
  'Producto',
  'Fecha',
  'Tipo',
  'Estado',
  'Participaciones',
  'Importe bruto',
  'Importe neto',
  'Valor liquidativo',
]);

const clean = (value: string | undefined) => (value ?? '').trim();

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

const normalizeLabel = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const parseMoneyNumber = (value: string): number | null => {
  const raw = clean(value)
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(/€/g, '');
  if (!raw) {
    return null;
  }

  let normalized = raw;
  if (normalized.includes(',') && normalized.includes('.')) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseUsDateToIso = (value: string): string | null => {
  const [monthRaw, dayRaw, yearRaw] = clean(value).split('/');
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const year = Number(yearRaw);

  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(year)
  ) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed.toISOString();
};

const inferSymbolHint = (product: string): string | null => {
  const tokens = product
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const first = tokens[0]?.toUpperCase() ?? '';
  return first || null;
};

type CobasParsedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  status: 'ready' | 'skipped' | 'failed';
  reason: string | null;
  normalized: {
    tradedAt: string;
    externalReference: string;
    productName: string;
    symbolHint: string;
    quantity: number;
    unitPrice: number;
    tradeCurrency: 'EUR';
    fxRateToEur: null;
    feesAmount: number;
    feesCurrency: 'EUR';
    netAmountEur: number;
    transactionType: 'buy';
  } | null;
};

export type CobasParsedCsv = {
  rows: CobasParsedRow[];
};

export const parseCobasTransactionsCsv = (csvText: string): CobasParsedCsv => {
  const sanitized = csvText.replace(/^\uFEFF/, '');
  const lines = readCsv(sanitized);
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

  const rows: CobasParsedRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const row = lines[index] ?? [];
    const get = (name: string) => {
      const position = header.findIndex((cell) => cell === name);
      return position === -1 ? '' : clean(row[position]);
    };

    const raw = {
      operation: get('Operacion'),
      product: get('Producto'),
      date: get('Fecha'),
      type: get('Tipo'),
      status: get('Estado'),
      quantity: get('Participaciones'),
      grossAmount: get('Importe bruto'),
      netAmount: get('Importe neto'),
      unitPrice: get('Valor liquidativo'),
    };

    const rowNumber = index + 1;
    const normalizedType = normalizeLabel(raw.type);
    if (normalizedType !== 'suscripcion') {
      rows.push({
        rowNumber,
        raw,
        status: 'skipped',
        reason: `Tipo "${raw.type || 'N/A'}" is not imported.`,
        normalized: null,
      });
      continue;
    }

    const normalizedStatus = normalizeLabel(raw.status);
    if (normalizedStatus !== 'finalizada') {
      rows.push({
        rowNumber,
        raw,
        status: 'skipped',
        reason: `Estado "${raw.status || 'N/A'}" is not finalizada.`,
        normalized: null,
      });
      continue;
    }

    const tradedAt = parseUsDateToIso(raw.date);
    if (!tradedAt) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Invalid Fecha value.',
        normalized: null,
      });
      continue;
    }

    if (!raw.operation) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Missing Operacion reference.',
        normalized: null,
      });
      continue;
    }

    if (!raw.product) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Missing Producto value.',
        normalized: null,
      });
      continue;
    }

    const symbolHint = inferSymbolHint(raw.product);
    if (!symbolHint) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Unable to infer asset symbol from Producto.',
        normalized: null,
      });
      continue;
    }

    const quantity = parseMoneyNumber(raw.quantity);
    const unitPrice = parseMoneyNumber(raw.unitPrice);
    const grossAmount = parseMoneyNumber(raw.grossAmount);
    const netAmount = parseMoneyNumber(raw.netAmount);
    if (!quantity || quantity <= 0) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Participaciones must be greater than 0.',
        normalized: null,
      });
      continue;
    }
    if (!unitPrice || unitPrice <= 0) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Valor liquidativo must be greater than 0.',
        normalized: null,
      });
      continue;
    }
    if (grossAmount === null || netAmount === null || netAmount <= 0) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Importe bruto/neto must be valid positive values.',
        normalized: null,
      });
      continue;
    }

    const feesAmount = Math.max(0, Number((grossAmount - netAmount).toFixed(6)));
    const normalized = {
      tradedAt,
      externalReference: raw.operation,
      productName: raw.product,
      symbolHint,
      quantity,
      unitPrice,
      tradeCurrency: 'EUR' as const,
      fxRateToEur: null,
      feesAmount,
      feesCurrency: 'EUR' as const,
      netAmountEur: netAmount,
      transactionType: 'buy' as const,
    };

    const validation = createAssetTransactionInputSchema.safeParse({
      accountId: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      assetType: 'mutual_fund',
      transactionType: 'buy',
      tradedAt: normalized.tradedAt,
      quantity: normalized.quantity,
      unitPrice: normalized.unitPrice,
      tradeCurrency: 'EUR',
      fxRateToEur: null,
      feesAmount: normalized.feesAmount,
      feesCurrency: 'EUR',
      externalReference: normalized.externalReference,
      notes: null,
    });
    if (!validation.success) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Row failed transaction schema validation.',
        normalized: null,
      });
      continue;
    }

    rows.push({
      rowNumber,
      raw,
      status: 'ready',
      reason: null,
      normalized,
    });
  }

  return { rows };
};
