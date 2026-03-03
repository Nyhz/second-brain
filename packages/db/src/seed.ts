import { createDbClient } from './client';

const bunEnv =
  (globalThis as { Bun?: { env: Record<string, string | undefined> } }).Bun
    ?.env ?? {};
const databaseUrl = bunEnv.DATABASE_URL_LOCAL ?? bunEnv.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_LOCAL or DATABASE_URL is required for seed');
}

const { sql } = createDbClient(databaseUrl);

await sql`
  insert into finances.accounts (name, currency, account_type)
  values
    ('Main Checking', 'USD', 'checking'),
    ('Cash Wallet', 'USD', 'cash')
  on conflict do nothing
`;

await sql.end();
