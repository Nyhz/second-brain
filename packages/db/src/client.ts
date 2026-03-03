import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export const createDbClient = (databaseUrl: string) => {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql);

  return { db, sql };
};
