import { describe, expect, test } from 'bun:test';
import { parseDegiroTransactionsCsv } from '../src/modules/finances/degiro-import';

const SAMPLE = `Date,Time,Product,ISIN,Reference exchange,Venue,Quantity,Price,,Local value,,Value EUR,Exchange rate,AutoFX Fee,Transaction and/or third party fees EUR,Total EUR,Order ID,
07-01-2026,09:31,ISHARES MSCI EM ASIA UCITS ETF USD (ACC),IE00B5L8K969,XET,XETA,9,"213,4500",EUR,"-1921,05",EUR,"-1921,05",,"0,00","-3,00","-1924,05",,b93f205d-c38b-4a67-adb7-c9aa08626746
15-09-2025,19:33,ADR ON JD.COM INC CLASS A,US47215P1066,NDQ,ARCX,18,"33,7500",USD,"-607,50",USD,"-516,32","1,1766","-1,29","-2,00","-518,32",,fda177bc-4080-4525-862e-f10aadfb4a4f
07-07-2025,15:08,VANGUARD FTSE ALL-WORLD UCITS - (USD) ACCUMULATING ETF,IE00BK5BQT80,XET,XETA,115,"130,8400",EUR,"-15046,60",EUR,"-15046,60",,"0,00","-1,00","-15047,60",4832c17b-21e9-4257-876f-525f6e4f54b2`;

describe('degiro import parser', () => {
  test('parses DEGIRO rows with decimal comma and trailing column mismatch', () => {
    const parsed = parseDegiroTransactionsCsv(SAMPLE);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]?.error).toBeNull();
    expect(parsed.rows[2]?.error).toBeNull();
  });

  test('infers buy from negative total and extracts external reference', () => {
    const parsed = parseDegiroTransactionsCsv(SAMPLE);
    const row = parsed.rows[0];
    expect(row?.normalized?.transactionType).toBe('buy');
    expect(row?.normalized?.externalReference).toBe(
      'b93f205d-c38b-4a67-adb7-c9aa08626746',
    );
  });

  test('derives fx rate for non-eur rows', () => {
    const parsed = parseDegiroTransactionsCsv(SAMPLE);
    const row = parsed.rows[1];
    expect(row?.normalized?.tradeCurrency).toBe('USD');
    expect(row?.normalized?.fxRateToEur).toBeCloseTo(0.85, 2);
  });
});
