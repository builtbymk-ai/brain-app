/**
 * Direct migration: V2B.3 evidence-boundary state columns on `businesses`.
 *
 * - revenue_state        text   — CALCULATED | INSUFFICIENT_DATA | NOT_SUPPORTED
 * - revenue_explanation  jsonb  — { statusLine, reason, additionalEvidence, why }
 * - revenue_calculation  text   — calculation trail (persisted for restore/export;
 *                                 previously regenerated only in-memory)
 *
 * Idempotent: safe to run multiple times.
 * Run: bun run db:migrate:v2b3
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf-8');
const match = envFile.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}
const connectionString = match[1].trim().replace(/^["']|["']$/g, '');

const sql = postgres(connectionString, { max: 1, prepare: false });

const migrations = [
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS revenue_state text`,
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS revenue_explanation jsonb`,
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS revenue_calculation text`,
];

try {
  for (const m of migrations) {
    await sql.unsafe(m);
    console.log(`OK: ${m.slice(0, 70)}...`);
  }
  console.log('[db:migrate:v2b3] Done.');
  process.exit(0);
} catch (error) {
  console.error('[db:migrate:v2b3] FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sql.end();
}
