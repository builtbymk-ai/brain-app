/**
 * Direct migration: adds user-input columns to the businesses table.
 * Used because drizzle-kit 0.24 has an introspection bug
 * (column_default.endsWith on arrays) against the current DB state.
 *
 * Idempotent: safe to run multiple times.
 * Run: bun run db:migrate
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';

// Read DATABASE_URL from .env without echoing it
const envFile = readFileSync('.env', 'utf-8');
const match = envFile.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}
const connectionString = match[1].trim().replace(/^["']|["']$/g, '');

const sql = postgres(connectionString, { max: 1, prepare: false });

const migrations = [
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS brand_name text`,
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS proposed_solution text`,
  `ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'prospect'`,
];

try {
  for (const m of migrations) {
    await sql.unsafe(m);
    console.log(`OK: ${m.slice(0, 60)}...`);
  }
  console.log('[db:migrate] Done.');
  process.exit(0);
} catch (error) {
  console.error('[db:migrate] FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sql.end();
}
