import { describe, expect, test } from 'bun:test';
import { createDbClient } from '../src/client';

describe('db client', () => {
  test('creates client with url', () => {
    const { db, sql } = createDbClient(
      'postgres://user:pass@localhost:5432/db',
    );
    expect(db).toBeDefined();
    expect(sql).toBeDefined();
    sql.end();
  });
});
