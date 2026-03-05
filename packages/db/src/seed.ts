import { createDbClient } from './client';

const bunEnv =
  (globalThis as { Bun?: { env: Record<string, string | undefined> } }).Bun
    ?.env ?? {};
const databaseUrl = bunEnv.DATABASE_URL ?? bunEnv.DATABASE_URL_LOCAL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_LOCAL or DATABASE_URL is required for seed');
}

const { sql } = createDbClient(databaseUrl);

await sql`
  insert into finances.accounts (name, currency, account_type)
  values
    ('Main Broker', 'EUR', 'brokerage'),
    ('Savings Reserve', 'EUR', 'savings')
  on conflict do nothing
`;

await sql.end();
