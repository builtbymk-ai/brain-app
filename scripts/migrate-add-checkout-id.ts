/**
 * Direct migration: adds the Bachs checkout id column to export_transactions.
 *
 * The checkout id (chk_…) is the authoritative join key between BRAIN
 * transactions and Bachs' API — the hosted checkout URL ends in a page token,
 * not the id, so URL-parsing is not a reliable way to recover it.
 *
 * Idempotent: safe to run multiple times.
 * Run: bun run db:migrate-checkout-id
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
  `ALTER TABLE export_transactions ADD COLUMN IF NOT EXISTS checkout_id text`,
  `CREATE INDEX IF NOT EXISTS export_transactions_checkout_id_idx ON export_transactions (checkout_id)`,
];

try {
  for (const m of migrations) {
    await sql.unsafe(m);
    console.log(`OK: ${m.slice(0, 70)}...`);
  }
  console.log('[db:migrate-checkout-id] Done.');
  process.exit(0);
} catch (error) {
  console.error('[db:migrate-checkout-id] FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sql.end();
}
