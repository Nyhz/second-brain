import { createAssetTransactionInputSchema } from '@second-brain/types';

const REQUIRED_HEADERS = new Set([
  'Date(UTC)',
  'OrderNo',
  'Pair',
  'Type',
  'Side',
  'Executed',
  'Average Price',
  'Trading total',
  'Status',
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

const parseUtcIso = (value: string) => {
  const normalized = clean(value).replace(' ', 'T');
  if (!normalized) return null;
  const date = new Date(`${normalized}Z`);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toISOString();
};

const parseNumberWithSuffix = (value: string) => {
  const normalized = clean(value).replace(/,/g, '');
  const match = normalized.match(/^([+-]?\d*\.?\d+)/);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

type BinanceParsedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  status: 'ready' | 'skipped' | 'failed';
  reason: string | null;
  normalized: {
    tradedAt: string;
    externalReference: string;
    pair: string;
    assetSymbol: string;
    quantity: number;
    unitPrice: number;
    tradingTotalEur: number;
    transactionType: 'buy' | 'sell';
    tradeCurrency: 'EUR';
    fxRateToEur: null;
    feesAmount: 0;
    feesCurrency: 'EUR';
  } | null;
};

export type BinanceParsedCsv = {
  rows: BinanceParsedRow[];
};

export const parseBinanceTransactionsCsv = (csvText: string): BinanceParsedCsv => {
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

  const rows: BinanceParsedRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const row = lines[index] ?? [];
    const get = (name: string) => {
      const position = header.findIndex((cell) => cell === name);
      return position === -1 ? '' : clean(row[position]);
    };

    const raw = {
      dateUtc: get('Date(UTC)'),
      orderNo: get('OrderNo'),
      pair: get('Pair').toUpperCase(),
      type: get('Type'),
      side: get('Side').toUpperCase(),
      executed: get('Executed'),
      averagePrice: get('Average Price'),
      tradingTotal: get('Trading total'),
      status: get('Status').toUpperCase(),
    };

    const rowNumber = index + 1;

    if (raw.status !== 'FILLED') {
      rows.push({
        rowNumber,
        raw,
        status: 'skipped',
        reason: `Status ${raw.status || 'UNKNOWN'} not imported.`,
        normalized: null,
      });
      continue;
    }

    const tradedAt = parseUtcIso(raw.dateUtc);
    if (!tradedAt) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Invalid Date(UTC) value.',
        normalized: null,
      });
      continue;
    }

    if (!raw.orderNo) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Missing OrderNo.',
        normalized: null,
      });
      continue;
    }

    if (!raw.pair || raw.pair.length <= 3) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Missing or invalid Pair.',
        normalized: null,
      });
      continue;
    }

    if (!raw.pair.endsWith('EUR')) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: `Unsupported quote currency in pair ${raw.pair}. Only EUR pairs are supported.`,
        normalized: null,
      });
      continue;
    }

    const assetSymbol = raw.pair.slice(0, -3);
    if (!assetSymbol) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: `Unable to infer base asset from pair ${raw.pair}.`,
        normalized: null,
      });
      continue;
    }

    const quantity = parseNumberWithSuffix(raw.executed);
    if (!quantity || quantity <= 0) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Executed quantity must be greater than 0.',
        normalized: null,
      });
      continue;
    }

    const unitPrice = parseNumberWithSuffix(raw.averagePrice);
    if (!unitPrice || unitPrice <= 0) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Average Price must be greater than 0.',
        normalized: null,
      });
      continue;
    }

    const tradingTotalEur = parseNumberWithSuffix(raw.tradingTotal);
    if (!tradingTotalEur || tradingTotalEur <= 0) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: 'Trading total must be greater than 0.',
        normalized: null,
      });
      continue;
    }

    let transactionType: 'buy' | 'sell' | null = null;
    if (raw.side === 'BUY') {
      transactionType = 'buy';
    } else if (raw.side === 'SELL') {
      transactionType = 'sell';
    }
    if (!transactionType) {
      rows.push({
        rowNumber,
        raw,
        status: 'failed',
        reason: `Unsupported Side ${raw.side || 'UNKNOWN'}.`,
        normalized: null,
      });
      continue;
    }

    const normalized = {
      tradedAt,
      externalReference: raw.orderNo,
      pair: raw.pair,
      assetSymbol,
      quantity,
      unitPrice,
      tradingTotalEur,
      transactionType,
      tradeCurrency: 'EUR' as const,
      fxRateToEur: null,
      feesAmount: 0 as const,
      feesCurrency: 'EUR' as const,
    };

    const validation = createAssetTransactionInputSchema.safeParse({
      accountId: crypto.randomUUID(),
      assetType: 'crypto',
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
