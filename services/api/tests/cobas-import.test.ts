import { describe, expect, test } from 'bun:test';
import { parseCobasTransactionsCsv } from '../src/modules/finances/cobas-import';

const SAMPLE =
  `"Operacion","Producto","Fecha","Tipo","Estado","Participaciones","Importe bruto","Importe neto","Valor liquidativo","Es total","Fecha inicio","Fecha fin","Periodicidad"\n` +
  `"O-BEG7087","Cobas Internacional FI Clase D","3/3/2026","Suscripción","Finalizada","0.434482","125€","125€","287.699004€","","","",""\n` +
  `"O-BEF8309","Cobas Internacional FI Clase D","2/11/2026","Suscripción","Finalizada","0.438709","125€","125€","284.926826€","","","",""\n` +
  `"O-BEE0326","Cobas Internacional FI Clase D","1/8/2026","Suscripción","Finalizada","0.483043","125€","125€","258.776232€","","","",""\n` +
  `"O-BEC7162","Cobas Internacional FI Clase D","12/2/2025","Suscripción","Finalizada","0.520569","125€","125€","240.121669€","","","",""\n` +
  `"O-BEB8800","Cobas Internacional FI Clase D","11/3/2025","Suscripción","Finalizada","0.527906","125€","125€","236.784534€","","","",""\n` +
  `"OSP-BEB6428","Cobas Internacional FI Clase D","10/27/2025","Solicitud de Suscripción Periódica","Periódica Activa","","125€","","","","11/10/2025","","MENSUAL"\n` +
  `"OSP-BEB4182","Cobas Internacional FI Clase D","10/14/2025","Solicitud de Suscripción Periódica","Anulada","","125€","","","","11/10/2025","","MENSUAL"\n` +
  `"OS-BEA1887","Cobas Internacional FI Clase D","9/1/2025","Suscripción","Finalizada","4.391739","1000€","1000€","227.700215€","","","",""`;

describe('cobas import parser', () => {
  test('accepts BOM-prefixed CSV input', () => {
    const parsed = parseCobasTransactionsCsv(`\uFEFF${SAMPLE}`);
    expect(parsed.rows).toHaveLength(8);
  });

  test('parses subscriptions as ready rows and skips periodic requests', () => {
    const parsed = parseCobasTransactionsCsv(SAMPLE);
    expect(parsed.rows).toHaveLength(8);

    const readyRows = parsed.rows.filter((row) => row.status === 'ready');
    const skippedRows = parsed.rows.filter((row) => row.status === 'skipped');
    expect(readyRows).toHaveLength(6);
    expect(skippedRows).toHaveLength(2);

    const first = readyRows[0];
    expect(first?.normalized?.symbolHint).toBe('COBAS');
    expect(first?.normalized?.transactionType).toBe('buy');
    expect(first?.normalized?.quantity).toBeCloseTo(0.434482, 6);
    expect(first?.normalized?.unitPrice).toBeCloseTo(287.699004, 6);
    expect(first?.normalized?.netAmountEur).toBeCloseTo(125, 2);
  });

  test('fails subscription rows with invalid Fecha', () => {
    const parsed = parseCobasTransactionsCsv(
      `"Operacion","Producto","Fecha","Tipo","Estado","Participaciones","Importe bruto","Importe neto","Valor liquidativo"\n` +
        `"O-1","Cobas Internacional FI Clase D","2026-03-03","Suscripción","Finalizada","0.1","10€","10€","100€"`,
    );
    expect(parsed.rows[0]?.status).toBe('failed');
    expect(parsed.rows[0]?.reason).toContain('Invalid Fecha');
  });
});
