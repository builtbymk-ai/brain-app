import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

// Use a single shared client across HMR reloads.
const globalForDb = globalThis as unknown as {
  sqlClient?: ReturnType<typeof postgres>;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

const sqlClient =
  globalForDb.sqlClient ??
  postgres(connectionString, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
  });

const db = globalForDb.db ?? drizzle(sqlClient, { schema });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sqlClient = sqlClient;
  globalForDb.db = db;
}

export { db, sqlClient, schema };
