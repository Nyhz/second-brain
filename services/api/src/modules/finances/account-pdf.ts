import type { Account, UnifiedTransactionRow } from '@second-brain/types';

type PdfFont = 'regular' | 'bold';
type PdfColor = [number, number, number];

type StyledPdfPage = {
  commands: string[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN_X = 42;
const PAGE_MARGIN_TOP = 42;
const PAGE_MARGIN_BOTTOM = 44;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN_X * 2;
const FOOTER_Y = PAGE_HEIGHT - PAGE_MARGIN_BOTTOM + 10;
const COLOR_TEXT: PdfColor = [0.11, 0.14, 0.18];
const COLOR_MUTED: PdfColor = [0.41, 0.46, 0.53];
const COLOR_LINE: PdfColor = [0.84, 0.86, 0.9];
const COLOR_PANEL: PdfColor = [0.96, 0.97, 0.98];
const COLOR_HEADER: PdfColor = [0.18, 0.23, 0.31];
const COLOR_HEADER_TEXT: PdfColor = [1, 1, 1];

const escapePdfText = (value: string) =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ');

const toPdfY = (yFromTop: number) => PAGE_HEIGHT - yFromTop;

const rgb = ([r, g, b]: PdfColor) => `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value.slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return parsed.toISOString().slice(0, 16).replace('T', ' ');
};

const formatMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatMoneyByCurrency = (
  value: number | null | undefined,
  currency: string,
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.trim().toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatQuantity = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }
  return value.toFixed(value >= 100 ? 2 : 4);
};

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}...`;
};

const estimateTextWidth = (value: string, fontSize: number, font: PdfFont) => {
  const ratio = font === 'bold' ? 0.56 : 0.52;
  return value.length * fontSize * ratio;
};

const wrapText = (
  value: string,
  maxWidth: number,
  fontSize: number,
  font: PdfFont,
) => {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize, font) <= maxWidth) {
      currentLine = candidate;
      continue;
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    if (estimateTextWidth(word, fontSize, font) <= maxWidth) {
      currentLine = word;
      continue;
    }
    let partial = '';
    for (const char of word) {
      const partialCandidate = `${partial}${char}`;
      if (estimateTextWidth(partialCandidate, fontSize, font) <= maxWidth) {
        partial = partialCandidate;
        continue;
      }
      if (partial) {
        lines.push(partial);
      }
      partial = char;
    }
    currentLine = partial;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

class StyledPdfDocument {
  private readonly pages: StyledPdfPage[] = [];

  addPage() {
    const page = { commands: [] };
    this.pages.push(page);
    return page;
  }

  private ensurePage(page?: StyledPdfPage) {
    return page ?? this.pages[this.pages.length - 1] ?? this.addPage();
  }

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: { fill?: PdfColor; stroke?: PdfColor; lineWidth?: number },
    page?: StyledPdfPage,
  ) {
    const target = this.ensurePage(page);
    const pdfY = toPdfY(y + height);
    const parts: string[] = [];
    if (options?.fill) {
      parts.push(`${rgb(options.fill)} rg`);
    }
    if (options?.stroke) {
      parts.push(`${rgb(options.stroke)} RG`);
      parts.push(`${(options.lineWidth ?? 1).toFixed(2)} w`);
    }
    parts.push(`${x.toFixed(2)} ${pdfY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`);
    parts.push(options?.fill && options?.stroke ? 'B' : options?.fill ? 'f' : 'S');
    target.commands.push(parts.join('\n'));
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: PdfColor,
    lineWidth = 1,
    page?: StyledPdfPage,
  ) {
    const target = this.ensurePage(page);
    target.commands.push(
      `${rgb(color)} RG\n${lineWidth.toFixed(2)} w\n${x1.toFixed(2)} ${toPdfY(
        y1,
      ).toFixed(2)} m\n${x2.toFixed(2)} ${toPdfY(y2).toFixed(2)} l\nS`,
    );
  }

  text(
    x: number,
    y: number,
    value: string,
    options?: {
      font?: PdfFont;
      size?: number;
      color?: PdfColor;
    },
    page?: StyledPdfPage,
  ) {
    const target = this.ensurePage(page);
    const font = options?.font ?? 'regular';
    const size = options?.size ?? 10;
    const color = options?.color ?? COLOR_TEXT;
    const fontId = font === 'bold' ? 'F2' : 'F1';
    target.commands.push(
      `BT\n/${fontId} ${size} Tf\n${rgb(color)} rg\n1 0 0 1 ${x.toFixed(
        2,
      )} ${toPdfY(y).toFixed(2)} Tm\n(${escapePdfText(value)}) Tj\nET`,
    );
  }

  render() {
    if (this.pages.length === 0) {
      this.addPage();
    }

    const objects: string[] = [];
    const addObject = (body: string) => {
      objects.push(body);
      return objects.length;
    };

    const regularFontId = addObject(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    );
    const boldFontId = addObject(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    );

    const pageObjectIds: number[] = [];

    for (const page of this.pages) {
      const contentStream = page.commands.join('\n');
      const contentObjectId = addObject(
        `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
      );
      const pageObjectId = addObject(
        `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      );
      pageObjectIds.push(pageObjectId);
    }

    const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
    const pagesObjectId = addObject(
      `<< /Type /Pages /Kids [${kids}] /Count ${pageObjectIds.length} >>`,
    );
    const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

    for (let index = 0; index < objects.length; index += 1) {
      objects[index] = objects[index]!.replaceAll('PAGES_REF', `${pagesObjectId} 0 R`);
    }

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\n`;
    pdf += `startxref\n${xrefStart}\n%%EOF`;

    return new TextEncoder().encode(pdf);
  }
}

type AccountPdfPeriod = {
  label: string;
  mode: 'month' | 'ytd';
  startIso: string;
  endIso: string;
  generatedAtIso: string;
};

type AccountTransactionLedgerSummary = {
  transactionCount: number;
  buyOutflowsEur: number;
  sellInflowsEur: number;
  feeTotalEur: number;
  dividendTotalEur: number;
  netCashImpactEur: number;
};

type AccountStatementSummary = {
  transactionCount: number;
  openingBalanceEur: number | null;
  closingBalanceEur: number | null;
  inflowsEur: number;
  outflowsEur: number;
  feesEur: number;
  dividendsEur: number;
  netCashImpactEur: number;
};

type StatementHoldingRow = {
  assetLabel: string;
  assetType: string;
  quantity: number;
};

type TransactionTableColumn = {
  label: string;
  width: number;
  align?: 'left' | 'right';
};

const addDocumentFrame = (
  doc: StyledPdfDocument,
  title: string,
  subtitle: string,
  pageNumber: number,
) => {
  const page = doc.addPage();
  doc.rect(0, 0, PAGE_WIDTH, 84, { fill: COLOR_HEADER }, page);
  doc.text(PAGE_MARGIN_X, 34, title, {
    font: 'bold',
    size: 20,
    color: COLOR_HEADER_TEXT,
  }, page);
  doc.text(PAGE_MARGIN_X, 56, subtitle, {
    size: 10,
    color: [0.84, 0.88, 0.94],
  }, page);
  doc.line(PAGE_MARGIN_X, FOOTER_Y - 10, PAGE_WIDTH - PAGE_MARGIN_X, FOOTER_Y - 10, COLOR_LINE, 1, page);
  doc.text(PAGE_MARGIN_X, FOOTER_Y, 'Second Brain Finances', {
    size: 9,
    color: COLOR_MUTED,
  }, page);
  doc.text(PAGE_WIDTH - PAGE_MARGIN_X - 42, FOOTER_Y, `Page ${pageNumber}`, {
    size: 9,
    color: COLOR_MUTED,
  }, page);
  return { page, y: 112 };
};

const drawInfoPairs = (
  doc: StyledPdfDocument,
  page: StyledPdfPage,
  startY: number,
  pairs: Array<[string, string]>,
) => {
  let y = startY;
  for (const [label, value] of pairs) {
    doc.text(PAGE_MARGIN_X, y, label, { font: 'bold', size: 9, color: COLOR_MUTED }, page);
    doc.text(PAGE_MARGIN_X + 102, y, value, { size: 10 }, page);
    y += 16;
  }
  return y + 4;
};

const drawSummaryCards = (
  doc: StyledPdfDocument,
  page: StyledPdfPage,
  startY: number,
  items: Array<{ label: string; value: string }>,
) => {
  const columns = 3;
  const gap = 12;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const rows = Math.ceil(items.length / columns);
  let index = 0;

  for (let row = 0; row < rows; row += 1) {
    const y = startY + row * 70;
    for (let col = 0; col < columns; col += 1) {
      if (index >= items.length) {
        break;
      }
      const x = PAGE_MARGIN_X + col * (width + gap);
      const item = items[index]!;
      doc.rect(x, y, width, 58, { fill: COLOR_PANEL, stroke: COLOR_LINE, lineWidth: 0.8 }, page);
      doc.text(x + 12, y + 20, item.label, { size: 9, color: COLOR_MUTED }, page);
      doc.text(x + 12, y + 40, item.value, { font: 'bold', size: 13 }, page);
      index += 1;
    }
  }

  return startY + rows * 70;
};

const drawSectionTitle = (
  doc: StyledPdfDocument,
  page: StyledPdfPage,
  y: number,
  title: string,
  subtitle?: string,
) => {
  doc.text(PAGE_MARGIN_X, y, title, { font: 'bold', size: 13 }, page);
  if (subtitle) {
    doc.text(PAGE_MARGIN_X, y + 16, subtitle, { size: 9, color: COLOR_MUTED }, page);
    return y + 30;
  }
  return y + 18;
};

const drawTableHeader = (
  doc: StyledPdfDocument,
  page: StyledPdfPage,
  y: number,
  columns: TransactionTableColumn[],
) => {
  doc.rect(PAGE_MARGIN_X, y, CONTENT_WIDTH, 22, {
    fill: COLOR_PANEL,
    stroke: COLOR_LINE,
    lineWidth: 0.8,
  }, page);
  let cursorX = PAGE_MARGIN_X + 8;
  for (const column of columns) {
    doc.text(cursorX, y + 15, column.label, {
      font: 'bold',
      size: 8,
      color: COLOR_MUTED,
    }, page);
    cursorX += column.width;
  }
  return y + 22;
};

const drawTransactionRows = (
  doc: StyledPdfDocument,
  title: string,
  subtitle: string,
  rows: UnifiedTransactionRow[],
  columns: TransactionTableColumn[],
  rowRenderer: (doc: StyledPdfDocument, page: StyledPdfPage, y: number, row: UnifiedTransactionRow, columns: TransactionTableColumn[]) => number,
) => {
  let pageNumber = 1;
  let { page, y } = addDocumentFrame(doc, title, subtitle, pageNumber);
  const minYForNextRow = PAGE_HEIGHT - PAGE_MARGIN_BOTTOM - 40;
  y = drawTableHeader(doc, page, y, columns);

  for (const row of rows) {
    const projectedHeight = row.notes || row.source ? 34 : 22;
    if (y + projectedHeight > minYForNextRow) {
      pageNumber += 1;
      const next = addDocumentFrame(doc, title, subtitle, pageNumber);
      page = next.page;
      y = drawTableHeader(doc, page, next.y, columns);
    }
    y = rowRenderer(doc, page, y, row, columns);
  }
};

const drawLedgerRow = (
  doc: StyledPdfDocument,
  page: StyledPdfPage,
  y: number,
  row: UnifiedTransactionRow,
  columns: TransactionTableColumn[],
) => {
  const height = row.notes || row.source ? 34 : 22;
  doc.line(PAGE_MARGIN_X, y + height, PAGE_MARGIN_X + CONTENT_WIDTH, y + height, COLOR_LINE, 0.6, page);

  const values = [
    formatDate(row.occurredAt),
    row.rowKind === 'asset_transaction'
      ? String(row.transactionType ?? '-').replaceAll('_', ' ').toUpperCase()
      : String(row.movementType ?? 'cash').replaceAll('_', ' ').toUpperCase(),
    truncate(row.assetLabel ?? 'Cash movement', 22),
    formatQuantity(row.quantity),
    row.unitPrice === null ? '-' : formatMoneyByCurrency(row.unitPrice, row.currency),
    formatMoneyByCurrency(row.amountNative, row.currency),
    row.feesAmountEur ? formatMoney(row.feesAmountEur) : '-',
    formatMoney(row.cashImpactEur),
  ];

  let cursorX = PAGE_MARGIN_X + 8;
  values.forEach((value, index) => {
    const column = columns[index]!;
    const textWidth = estimateTextWidth(value, 8.5, 'regular');
    const x =
      column.align === 'right'
        ? cursorX + column.width - Math.min(textWidth, column.width - 10)
        : cursorX;
    doc.text(x, y + 15, value, {
      size: 8.5,
      color: index >= 5 ? COLOR_TEXT : COLOR_TEXT,
    }, page);
    cursorX += column.width;
  });

  if (row.notes || row.source) {
    const meta = [
      row.source ? `Source: ${row.source}` : null,
      row.notes ? `Notes: ${row.notes}` : null,
    ]
      .filter(Boolean)
      .join(' | ');
    doc.text(PAGE_MARGIN_X + 8, y + 28, truncate(meta, 90), {
      size: 7.5,
      color: COLOR_MUTED,
    }, page);
  }

  return y + height;
};

export const buildAccountTransactionLedgerPdf = (input: {
  account: Account;
  period: AccountPdfPeriod;
  rows: UnifiedTransactionRow[];
  summary: AccountTransactionLedgerSummary;
}) => {
  const doc = new StyledPdfDocument();
  const title = `${input.account.name} - Transaction Ledger`;
  const subtitle = `${input.period.label} | Generated ${formatDateTime(
    input.period.generatedAtIso,
  )} UTC`;
  let pageNumber = 1;
  let { page, y } = addDocumentFrame(doc, title, subtitle, pageNumber);

  y = drawInfoPairs(doc, page, y, [
    ['Account', input.account.name],
    ['Account Type', input.account.accountType.replaceAll('_', ' ')],
    ['Period', input.period.label],
    ['Transactions', String(input.summary.transactionCount)],
  ]);

  y = drawSummaryCards(doc, page, y, [
    { label: 'Buy Outflows', value: formatMoney(input.summary.buyOutflowsEur) },
    { label: 'Sell Inflows', value: formatMoney(input.summary.sellInflowsEur) },
    { label: 'Fees', value: formatMoney(input.summary.feeTotalEur) },
    { label: 'Dividends', value: formatMoney(input.summary.dividendTotalEur) },
    { label: 'Net Cash Impact', value: formatMoney(input.summary.netCashImpactEur) },
  ]);

  y = drawSectionTitle(doc, page, y + 8, 'Transactions');
  const columns: TransactionTableColumn[] = [
    { label: 'Date', width: 62 },
    { label: 'Type', width: 62 },
    { label: 'Asset / Description', width: 120 },
    { label: 'Qty', width: 48, align: 'right' },
    { label: 'Unit Price', width: 72, align: 'right' },
    { label: 'Amount', width: 72, align: 'right' },
    { label: 'Fee', width: 58, align: 'right' },
    { label: 'Cash Impact', width: 76, align: 'right' },
  ];

  const minYForNextRow = PAGE_HEIGHT - PAGE_MARGIN_BOTTOM - 40;
  y = drawTableHeader(doc, page, y, columns);

  for (const row of input.rows) {
    const projectedHeight = row.notes || row.source ? 34 : 22;
    if (y + projectedHeight > minYForNextRow) {
      pageNumber += 1;
      const next = addDocumentFrame(doc, title, subtitle, pageNumber);
      page = next.page;
      y = drawSectionTitle(doc, page, next.y, 'Transactions (continued)');
      y = drawTableHeader(doc, page, y, columns);
    }
    y = drawLedgerRow(doc, page, y, row, columns);
  }

  if (input.rows.length === 0) {
    doc.text(PAGE_MARGIN_X, y + 16, 'No account activity for the selected period.', {
      size: 10,
      color: COLOR_MUTED,
    }, page);
  }

  return doc.render();
};

export const buildAccountStatementPdf = (input: {
  account: Account;
  period: AccountPdfPeriod;
  rows: UnifiedTransactionRow[];
  summary: AccountStatementSummary;
  holdings: StatementHoldingRow[];
}) => {
  const doc = new StyledPdfDocument();
  const title = `${input.account.name} - Account Statement`;
  const subtitle = `${input.period.label} | Generated ${formatDateTime(
    input.period.generatedAtIso,
  )} UTC`;

  let pageNumber = 1;
  let { page, y } = addDocumentFrame(doc, title, subtitle, pageNumber);
  y = drawInfoPairs(doc, page, y, [
    ['Account', input.account.name],
    ['Account Type', input.account.accountType.replaceAll('_', ' ')],
    ['Statement Period', input.period.label],
    ['Generated', formatDateTime(input.period.generatedAtIso)],
  ]);

  y = drawSummaryCards(doc, page, y, [
    { label: 'Opening Balance', value: formatMoney(input.summary.openingBalanceEur) },
    { label: 'Closing Balance', value: formatMoney(input.summary.closingBalanceEur) },
    { label: 'Inflows', value: formatMoney(input.summary.inflowsEur) },
    { label: 'Outflows', value: formatMoney(input.summary.outflowsEur) },
    { label: 'Fees', value: formatMoney(input.summary.feesEur) },
    { label: 'Dividends', value: formatMoney(input.summary.dividendsEur) },
    { label: 'Net Cash Impact', value: formatMoney(input.summary.netCashImpactEur) },
    { label: 'Transactions', value: String(input.summary.transactionCount) },
  ]);

  y = drawSectionTitle(
    doc,
    page,
    y + 4,
    'Account Summary',
    'Opening and closing balances use daily balance snapshots when available.',
  );

  const summaryLines = [
    `Opening balance: ${formatMoney(input.summary.openingBalanceEur)}`,
    `Closing balance: ${formatMoney(input.summary.closingBalanceEur)}`,
    `Net activity: ${formatMoney(input.summary.netCashImpactEur)}`,
    `Transaction count: ${input.summary.transactionCount}`,
  ];
  for (const line of summaryLines) {
    doc.text(PAGE_MARGIN_X, y, line, { size: 10 }, page);
    y += 16;
  }

  y = drawSectionTitle(doc, page, y + 8, 'Holdings Snapshot');
  if (input.holdings.length === 0) {
    doc.text(PAGE_MARGIN_X, y, 'No open holdings at the end of the selected period.', {
      size: 10,
      color: COLOR_MUTED,
    }, page);
    y += 20;
  } else {
    const columns: TransactionTableColumn[] = [
      { label: 'Asset', width: 250 },
      { label: 'Type', width: 150 },
      { label: 'Quantity', width: 110, align: 'right' },
    ];
    y = drawTableHeader(doc, page, y, columns);
    for (const holding of input.holdings) {
      if (y + 22 > PAGE_HEIGHT - PAGE_MARGIN_BOTTOM - 40) {
        pageNumber += 1;
        const next = addDocumentFrame(doc, title, subtitle, pageNumber);
        page = next.page;
        y = drawSectionTitle(doc, page, next.y, 'Holdings Snapshot (continued)');
        y = drawTableHeader(doc, page, y, columns);
      }
      doc.line(PAGE_MARGIN_X, y + 22, PAGE_MARGIN_X + CONTENT_WIDTH, y + 22, COLOR_LINE, 0.6, page);
      doc.text(PAGE_MARGIN_X + 8, y + 15, truncate(holding.assetLabel, 38), { size: 9 }, page);
      doc.text(PAGE_MARGIN_X + 258, y + 15, holding.assetType.replaceAll('_', ' '), { size: 9 }, page);
      const quantityText = formatQuantity(holding.quantity);
      const quantityWidth = estimateTextWidth(quantityText, 9, 'regular');
      doc.text(
        PAGE_MARGIN_X + CONTENT_WIDTH - 10 - quantityWidth,
        y + 15,
        quantityText,
        { size: 9 },
        page,
      );
      y += 22;
    }
  }

  y = drawSectionTitle(doc, page, y + 12, 'Recent Activity', 'Most recent transactions within the selected period.');
  const recentRows = input.rows.slice(0, 12);
  const activityColumns: TransactionTableColumn[] = [
    { label: 'Date', width: 70 },
    { label: 'Type', width: 72 },
    { label: 'Asset / Description', width: 190 },
    { label: 'Amount', width: 90, align: 'right' },
    { label: 'Cash Impact', width: 96, align: 'right' },
  ];
  y = drawTableHeader(doc, page, y, activityColumns);
  for (const row of recentRows) {
    if (y + 22 > PAGE_HEIGHT - PAGE_MARGIN_BOTTOM - 40) {
      pageNumber += 1;
      const next = addDocumentFrame(doc, title, subtitle, pageNumber);
      page = next.page;
      y = drawSectionTitle(doc, page, next.y, 'Recent Activity (continued)');
      y = drawTableHeader(doc, page, y, activityColumns);
    }
    doc.line(PAGE_MARGIN_X, y + 22, PAGE_MARGIN_X + CONTENT_WIDTH, y + 22, COLOR_LINE, 0.6, page);
    const values = [
      formatDate(row.occurredAt),
      row.rowKind === 'asset_transaction'
        ? String(row.transactionType ?? '-').replaceAll('_', ' ').toUpperCase()
        : String(row.movementType ?? 'cash').replaceAll('_', ' ').toUpperCase(),
      truncate(row.assetLabel ?? 'Cash movement', 32),
      formatMoneyByCurrency(row.amountNative, row.currency),
      formatMoney(row.cashImpactEur),
    ];
    let cursorX = PAGE_MARGIN_X + 8;
    values.forEach((value, index) => {
      const column = activityColumns[index]!;
      const textWidth = estimateTextWidth(value, 8.5, 'regular');
      const x =
        column.align === 'right'
          ? cursorX + column.width - Math.min(textWidth, column.width - 10)
          : cursorX;
      doc.text(x, y + 15, value, { size: 8.5 }, page);
      cursorX += column.width;
    });
    y += 22;
  }

  if (input.rows.length > recentRows.length) {
    doc.text(
      PAGE_MARGIN_X,
      y + 16,
      `${input.rows.length - recentRows.length} additional transaction(s) omitted from the statement detail section.`,
      { size: 9, color: COLOR_MUTED },
      page,
    );
  }

  if (input.rows.length === 0) {
    doc.text(PAGE_MARGIN_X, y + 16, 'No account activity for the selected period.', {
      size: 10,
      color: COLOR_MUTED,
    }, page);
  }

  return doc.render();
};
