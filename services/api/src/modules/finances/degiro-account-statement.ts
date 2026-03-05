import type { AssetType } from '@second-brain/types';

const REQUIRED_HEADERS = new Set([
  'Date',
  'Time',
  'Value date',
  'Product',
  'ISIN',
  'Description',
  'FX',
  'Change',
  'Balance',
  'Order Id',
]);

const TIME_ZONE = 'Europe/Madrid';

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

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const parseDateParts = (value: string) => {
  const [dayRaw, monthRaw, yearRaw] = clean(value).split('-');
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return null;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) {
    return null;
  }
  return { year, month, day };
};

const parseTimeParts = (value: string) => {
  const [hourRaw, minuteRaw] = clean(value).split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
};

const parseValueDateIso = (value: string): string | null => {
  const parts = parseDateParts(value);
  if (!parts) {
    return null;
  }
  return `${parts.year.toString().padStart(4, '0')}-${parts.month
    .toString()
    .padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
};

const timezoneOffsetMs = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(map.get('year'));
  const month = Number(map.get('month'));
  const day = Number(map.get('day'));
  const hour = Number(map.get('hour'));
  const minute = Number(map.get('minute'));
  const second = Number(map.get('second'));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  return asUtc - date.getTime();
};

const madridLocalToUtcIso = (
  dateValue: string,
  timeValue: string,
): string | null => {
  const dateParts = parseDateParts(dateValue);
  const timeParts = parseTimeParts(timeValue);
  if (!dateParts || !timeParts) {
    return null;
  }

  const guessUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0,
    0,
  );

  const guessDate = new Date(guessUtc);
  const firstOffset = timezoneOffsetMs(guessDate, TIME_ZONE);
  const firstTs = guessUtc - firstOffset;
  const secondOffset = timezoneOffsetMs(new Date(firstTs), TIME_ZONE);
  const finalTs = guessUtc - secondOffset;
  const finalDate = new Date(finalTs);
  if (Number.isNaN(finalDate.valueOf())) {
    return null;
  }
  return finalDate.toISOString();
};

const sha256Hex = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const inferAssetType = (productName: string): AssetType => {
  const upper = normalizeText(productName);
  if (
    upper.includes('ETF') ||
    upper.includes('ETC') ||
    upper.includes('UCITS')
  ) {
    return 'etf';
  }
  if (upper.includes('FUND')) {
    return 'mutual_fund';
  }
  if (upper.includes('BOND')) {
    return 'bond';
  }
  if (upper.includes('CRYPTO') || upper.includes('BITCOIN')) {
    return 'crypto';
  }
  return 'stock';
};

const makeTicker = (productName: string, isin: string) => {
  const candidate = normalizeText(productName)
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  if (candidate.length >= 2) {
    return candidate;
  }
  return isin.slice(-8);
};

export type DegiroAccountStatementRowType =
  | 'buy'
  | 'sell'
  | 'trade_fee'
  | 'asset_fee'
  | 'dividend_gross'
  | 'dividend_withholding'
  | 'deposit'
  | 'connectivity_fee'
  | 'interest'
  | 'generic_credit'
  | 'fx_internal_credit'
  | 'fx_internal_debit'
  | 'cash_sweep_internal'
  | 'informational'
  | 'unknown';

type ParsedTradeDetails = {
  side: 'buy' | 'sell';
  quantity: number;
  unitPrice: number;
  tradeCurrency: string;
  isinFromDescription: string | null;
};

const TRADE_REGEX =
  /^(Compra|Venta)\s+([0-9.,]+)\s+.+@([0-9.,]+)\s+([A-Z]{3})\s+\(([A-Z0-9]{12})\)/i;

const parseTradeDetails = (description: string): ParsedTradeDetails | null => {
  const match = description.match(TRADE_REGEX);
  if (!match) {
    return null;
  }
  const side = match[1]?.toLowerCase() === 'venta' ? 'sell' : 'buy';
  const quantity = parseLocalizedNumber(match[2] ?? '');
  const unitPrice = parseLocalizedNumber(match[3] ?? '');
  const tradeCurrency = clean(match[4]).toUpperCase();
  const isinFromDescription = clean(match[5]) || null;
  if (
    quantity === null ||
    quantity <= 0 ||
    unitPrice === null ||
    unitPrice <= 0 ||
    !/^[A-Z]{3}$/.test(tradeCurrency)
  ) {
    return null;
  }
  return { side, quantity, unitPrice, tradeCurrency, isinFromDescription };
};

const classifyRow = (
  description: string,
  changeAmount: number | null,
): DegiroAccountStatementRowType => {
  const normalized = normalizeText(description);
  if (!normalized) {
    return 'unknown';
  }
  if (normalized.startsWith('COMPRA ')) {
    return 'buy';
  }
  if (normalized.startsWith('VENTA ')) {
    return 'sell';
  }
  if (normalized.includes('COSTES DE TRANSACCION Y/O EXTERNOS DE DEGIRO')) {
    return 'trade_fee';
  }
  if (normalized.includes('ADR/GDR PASS-THROUGH FEE')) {
    return 'asset_fee';
  }
  if (normalized.startsWith('DIVIDENDO')) {
    return 'dividend_gross';
  }
  if (normalized.startsWith('RETENCION DEL DIVIDENDO')) {
    return 'dividend_withholding';
  }
  if (normalized === 'FLATEX DEPOSIT') {
    return 'deposit';
  }
  if (normalized.startsWith('COMISION DE CONECTIVIDAD')) {
    return 'connectivity_fee';
  }
  if (normalized === 'FLATEX INTEREST INCOME') {
    return 'interest';
  }
  if (normalized === 'INGRESO') {
    return 'generic_credit';
  }
  if (normalized.startsWith('INGRESO CAMBIO DE DIVISA')) {
    return 'fx_internal_credit';
  }
  if (normalized.startsWith('RETIRADA CAMBIO DE DIVISA')) {
    return 'fx_internal_debit';
  }
  if (normalized.startsWith('DEGIRO CASH SWEEP TRANSFER')) {
    return 'cash_sweep_internal';
  }
  if (
    normalized.startsWith('TRANSFERIR ') &&
    normalized.includes('FLATEXDEGIRO BANK') &&
    changeAmount === null
  ) {
    return 'informational';
  }
  return 'unknown';
};

export type DegiroAccountStatementRow = {
  rowNumber: number;
  date: string;
  time: string;
  valueDate: string | null;
  occurredAtIso: string | null;
  product: string;
  isin: string | null;
  description: string;
  fxRaw: number | null;
  changeCurrency: string | null;
  changeAmount: number | null;
  balanceCurrency: string | null;
  balanceAmount: number | null;
  orderId: string | null;
  rowType: DegiroAccountStatementRowType;
  trade: ParsedTradeDetails | null;
  rowFingerprint: string;
  raw: Record<string, string>;
};

export type DegiroAccountStatementParseResult = {
  rows: DegiroAccountStatementRow[];
  warnings: string[];
};

export const parseDegiroAccountStatementCsv = async (
  csvText: string,
): Promise<DegiroAccountStatementParseResult> => {
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

  const rows: DegiroAccountStatementRow[] = [];
  const warnings: string[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const row = lines[index] ?? [];
    const get = (position: number) => clean(row[position]);

    const raw = {
      date: get(0),
      time: get(1),
      valueDate: get(2),
      product: get(3),
      isin: get(4),
      description: get(5),
      fx: get(6),
      changeCurrency: get(7),
      changeAmount: get(8),
      balanceCurrency: get(9),
      balanceAmount: get(10),
      orderId: get(11),
    };

    const rowNumber = index + 1;
    const occurredAtIso = madridLocalToUtcIso(raw.date, raw.time);
    const valueDate = parseValueDateIso(raw.valueDate);
    const fxRaw = parseLocalizedNumber(raw.fx);
    const changeAmount = parseLocalizedNumber(raw.changeAmount);
    const balanceAmount = parseLocalizedNumber(raw.balanceAmount);
    const changeCurrency = raw.changeCurrency
      ? raw.changeCurrency.toUpperCase()
      : null;
    const balanceCurrency = raw.balanceCurrency
      ? raw.balanceCurrency.toUpperCase()
      : null;
    const description = raw.description;
    const rowType = classifyRow(description, changeAmount);
    const trade = parseTradeDetails(description);
    const isin = raw.isin ? raw.isin.toUpperCase() : null;
    const orderId = raw.orderId || null;

    if (!occurredAtIso) {
      warnings.push(`Row ${rowNumber}: invalid Date/Time, row marked unknown.`);
    }
    if (
      (rowType === 'buy' || rowType === 'sell') &&
      (!trade || (isin && trade.isinFromDescription && isin !== trade.isinFromDescription))
    ) {
      warnings.push(
        `Row ${rowNumber}: could not fully parse trade quantity/price from description.`,
      );
    }

    const rowFingerprint = await sha256Hex(
      JSON.stringify({
        date: raw.date,
        time: raw.time,
        valueDate: raw.valueDate,
        product: raw.product,
        isin: raw.isin,
        description: raw.description,
        fx: raw.fx,
        changeCurrency: raw.changeCurrency,
        changeAmount: raw.changeAmount,
        balanceCurrency: raw.balanceCurrency,
        balanceAmount: raw.balanceAmount,
        orderId: raw.orderId,
      }),
    );

    rows.push({
      rowNumber,
      date: raw.date,
      time: raw.time,
      valueDate,
      occurredAtIso,
      product: raw.product,
      isin,
      description,
      fxRaw,
      changeCurrency,
      changeAmount,
      balanceCurrency,
      balanceAmount,
      orderId,
      rowType,
      trade,
      rowFingerprint,
      raw,
    });
  }

  return { rows, warnings };
};

export const getDegiroStatementAssetType = inferAssetType;
export const getDegiroStatementTicker = makeTicker;
