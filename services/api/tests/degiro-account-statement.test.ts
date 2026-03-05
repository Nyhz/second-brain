import { describe, expect, test } from 'bun:test';
import { parseDegiroAccountStatementCsv } from '../src/modules/finances/degiro-account-statement';

const SAMPLE = `Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id
15-09-2025,19:33,15-09-2025,ADR ON JD.COM INC CLASS A,US47215P1066,\"Compra 18 ADR on JD.com Inc Class A@33,75 USD (US47215P1066)\",,USD,\"-607,50\",USD,\"-607,50\",fda177bc-4080-4525-862e-f10aadfb4a4f
15-09-2025,19:33,15-09-2025,ADR ON JD.COM INC CLASS A,US47215P1066,Costes de transacción y/o externos de DEGIRO,,EUR,\"-2,00\",EUR,\"527,94\",fda177bc-4080-4525-862e-f10aadfb4a4f
24-09-2025,07:25,23-09-2025,UNITEDHEALTH GROUP INC,US91324P1021,Dividendo,,USD,\"6,63\",USD,\"5,64\",
24-09-2025,07:24,23-09-2025,UNITEDHEALTH GROUP INC,US91324P1021,Retención del dividendo,,USD,\"-0,99\",USD,\"-0,99\",
24-02-2026,08:31,24-02-2026,,,\"Transferir desde su Cuenta de Efectivo en flatexDEGIRO Bank: 0,15 EUR\",,,,EUR,\"110,10\",`;

describe('degiro account statement parser', () => {
  test('parses trade rows and localized numbers', async () => {
    const parsed = await parseDegiroAccountStatementCsv(SAMPLE);
    expect(parsed.rows).toHaveLength(5);

    const buyRow = parsed.rows[0];
    expect(buyRow?.rowType).toBe('buy');
    expect(buyRow?.trade?.quantity).toBe(18);
    expect(buyRow?.trade?.unitPrice).toBe(33.75);
    expect(buyRow?.changeAmount).toBe(-607.5);
    expect(buyRow?.changeCurrency).toBe('USD');
  });

  test('classifies fees and dividend rows', async () => {
    const parsed = await parseDegiroAccountStatementCsv(SAMPLE);
    expect(parsed.rows[1]?.rowType).toBe('trade_fee');
    expect(parsed.rows[2]?.rowType).toBe('dividend_gross');
    expect(parsed.rows[3]?.rowType).toBe('dividend_withholding');
  });

  test('marks transfer informational rows with blank change amount', async () => {
    const parsed = await parseDegiroAccountStatementCsv(SAMPLE);
    const transferRow = parsed.rows[4];
    expect(transferRow?.rowType).toBe('informational');
    expect(transferRow?.changeAmount).toBeNull();
  });
});
