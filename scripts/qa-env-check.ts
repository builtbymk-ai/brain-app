export {};

/**
 * QA — check which server env vars are visible to the app process.
 * Prints presence only (never values).
 */
const names = [
  'BACHS_API_KEY',
  'BACHS_BASE_URL',
  'BACHS_WEBHOOK_SECRET',
  'NEXT_PUBLIC_EXPORT_CURRENCY',
  'GOOGLE_API_KEY',
  'FIRECRAWL_API_KEY',
  'SERPAPI_KEY',
  'APIFY_TOKEN',
  'APOLLO_API_KEY',
  'DATABASE_URL',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

for (const n of names) {
  const v = process.env[n];
  console.log(`${n}: ${v ? 'PRESENT' : 'MISSING'}`);
}
