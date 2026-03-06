import { describe, expect, test } from 'bun:test';
import { parseBinanceTransactionsCsv } from '../src/modules/finances/binance-import';

const SAMPLE = `"Date(UTC)","OrderNo","Pair","Type","Side","Order Price","Order Amount","Time","Executed","Average Price","Trading total","Status"
"2025-11-05 14:28:28","4261935993","ETHEUR","Market","BUY","0","0.1717ETH","2025-11-05 14:28:28","0.1717ETH","2911.91955737","499.976588EUR","FILLED"
"2025-08-09 09:39:30","48178883","PEPEEUR","Limit","BUY","0.00001059","47119924PEPE","2025-08-09 09:41:48","0PEPE","0","0EUR","CANCELED"`;

describe('binance import parser', () => {
  test('accepts BOM-prefixed CSV input', () => {
    const parsed = parseBinanceTransactionsCsv(`\uFEFF${SAMPLE}`);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.status).toBe('ready');
  });

  test('parses filled rows and normalizes key fields', () => {
    const parsed = parseBinanceTransactionsCsv(SAMPLE);
    expect(parsed.rows).toHaveLength(2);

    const filled = parsed.rows[0];
    expect(filled?.status).toBe('ready');
    expect(filled?.normalized?.externalReference).toBe('4261935993');
    expect(filled?.normalized?.assetSymbol).toBe('ETH');
    expect(filled?.normalized?.transactionType).toBe('buy');
    expect(filled?.normalized?.quantity).toBeCloseTo(0.1717, 6);
    expect(filled?.normalized?.unitPrice).toBeCloseTo(2911.91955737, 8);
    expect(filled?.normalized?.tradingTotalEur).toBeCloseTo(499.976588, 6);
  });

  test('marks non-filled rows as skipped', () => {
    const parsed = parseBinanceTransactionsCsv(SAMPLE);
    const canceled = parsed.rows[1];
    expect(canceled?.status).toBe('skipped');
    expect(canceled?.reason).toContain('CANCELED');
    expect(canceled?.normalized).toBeNull();
  });

  test('fails rows with non-EUR quote pairs', () => {
    const parsed = parseBinanceTransactionsCsv(`"Date(UTC)","OrderNo","Pair","Type","Side","Order Price","Order Amount","Time","Executed","Average Price","Trading total","Status"\n"2025-11-05 14:28:28","1","BTCUSDT","Market","BUY","0","0.01BTC","2025-11-05 14:28:28","0.01BTC","70000","700USDT","FILLED"`);
    expect(parsed.rows[0]?.status).toBe('failed');
    expect(parsed.rows[0]?.reason).toContain('Only EUR pairs are supported');
  });
});
