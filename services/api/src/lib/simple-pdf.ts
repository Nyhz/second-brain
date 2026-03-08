const escapePdfText = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

export const renderPlainTextPdf = (
  lines: string[],
  options?: {
    title?: string;
    linesPerPage?: number;
    fontSize?: number;
  },
) => {
  const title = options?.title ?? 'Document';
  const linesPerPage = options?.linesPerPage ?? 48;
  const fontSize = options?.fontSize ?? 10;
  const pageHeight = 792;
  const startX = 50;
  const startY = 760;
  const lineHeight = 14;

  const pageChunks: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pageChunks.push(lines.slice(index, index + linesPerPage));
  }
  if (pageChunks.length === 0) {
    pageChunks.push(['']);
  }

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontObjectId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageObjectIds: number[] = [];

  for (const pageLines of pageChunks) {
    const textLines = [title, '', ...pageLines].slice(0, linesPerPage + 2);
    const contentStream = [
      'BT',
      `/F1 ${fontSize} Tf`,
      `${startX} ${startY} Td`,
      ...textLines.map((line, index) =>
        index === 0
          ? `(${escapePdfText(line)}) Tj`
          : `T* (${escapePdfText(line)}) Tj`,
      ),
      'ET',
    ].join('\n');

    const contentObjectId = addObject(
      `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    );
    const pageObjectId = addObject(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
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
};
