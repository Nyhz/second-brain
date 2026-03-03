import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createDbClient } from './client';

const bunEnv =
  (globalThis as { Bun?: { env: Record<string, string | undefined> } }).Bun
    ?.env ?? {};
const databaseUrl = bunEnv.DATABASE_URL_LOCAL ?? bunEnv.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL_LOCAL or DATABASE_URL is required for migrations',
  );
}

const { sql } = createDbClient(databaseUrl);

await sql`create schema if not exists core`;
await sql`create table if not exists core.schema_migrations (version text primary key, applied_at timestamptz not null default now())`;

const migrationsDir = join(import.meta.dir, 'migrations');
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

for (const file of files) {
  const [applied] =
    await sql`select version from core.schema_migrations where version = ${file}`;
  if (applied) {
    continue;
  }

  const migrationSql = readFileSync(join(migrationsDir, file), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(migrationSql);
    await tx`insert into core.schema_migrations (version) values (${file})`;
  });
}

await sql.end();
