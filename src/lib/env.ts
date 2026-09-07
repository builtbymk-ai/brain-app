/**
 * Centralized environment access. Checked server-side only — never expose
 * secret keys to the browser. Runtime values are read from process.env.
 */
const required = (name: string): string | null => process.env[name] ?? null;

export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL;
  },
  get firecrawlKey() {
    return process.env.FIRECRAWL_API_KEY;
  },
  get apifyToken() {
    return process.env.APIFY_TOKEN;
  },
  get apolloKey() {
    return process.env.APOLLO_API_KEY;
  },
  get serpapiKey() {
    return process.env.SERPAPI_KEY;
  },
  get googleKey() {
    return process.env.GOOGLE_API_KEY;
  },
  get paystackSecret() {
    return process.env.PAYSTACK_SECRET_KEY;
  },
  get paystackPublicKey() {
    return process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  },
  get r2AccountId() {
    return process.env.CLOUDFLARE_ACCOUNT_ID;
  },
  get r2AccessKeyId() {
    return process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  },
  get r2SecretAccessKey() {
    return process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  },
  get r2Bucket() {
    return process.env.R2_BUCKET_NAME;
  },
  get baseUrl() {
    return (
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.VERCEL_URL ??
      ''
    );
  },
  get paystackWebhookSecret() {
    return process.env.PAYSTACK_WEBHOOK_SECRET ?? null;
  },

  // OpenRouter secondary AI provider
  get openrouterKey() {
    return process.env.OPENROUTER_API_KEY ?? null;
  },
  get openrouterPrimaryModel() {
    return process.env.OPENROUTER_PRIMARY_MODEL ?? null;
  },
  get openrouterFallbackModel() {
    return process.env.OPENROUTER_FALLBACK_MODEL ?? null;
  },

  // GitHub integration
  get githubToken() {
    return process.env.GITHUB_TOKEN ?? null;
  },
};
