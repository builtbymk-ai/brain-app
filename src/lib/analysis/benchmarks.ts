/**
 * Typed benchmark catalog for the ACR calculator.
 *
 * Source of truth: src/lib/analysis/benchmark.txt (human-editable library),
 * bundled by scripts/build-benchmarks.ts into benchmark-bundle.generated.ts.
 * THIS file adds the typed, numeric layer the calculator consumes — every
 * record keeps its metadata (source, dataset, period, caution, verification)
 * per Benchmark Architecture Part 13.
 *
 * Unverified records (BENCHMARK 075, 076) are included but marked
 * verification: 'unverified' — model-rules.canDriveRevenueMath() refuses
 * to let them drive quantitative revenue calculations.
 */

import { BenchmarkRecord, IndustryKey } from './types';

function rec(
  id: string,
  metric: string,
  dimension: BenchmarkRecord['dimension'],
  value: number,
  displayValue: string,
  source: string,
  verification: BenchmarkRecord['verification'],
  opts: Partial<Omit<BenchmarkRecord, 'id' | 'metric' | 'dimension' | 'value' | 'displayValue' | 'source' | 'verification'>> = {}
): BenchmarkRecord {
  return { id, metric, dimension, value, displayValue, source, verification, ...opts };
}

/**
 * Conversion-basis benchmarks. Selection order per benchmark directory
 * Section 25: industry-matched first, then generic ecommerce.
 */
export const CONVERSION_BENCHMARKS: BenchmarkRecord[] = [
  rec('BMK-002', 'Beauty & Personal Care Conversion Rate', 'CONVERSION', 0.0539, '~5.39%', 'Dynamic Yield XP² Ecommerce Benchmarks', 'verified', {
    dataset: 'Dynamic Yield XP², 12-month average',
    caution: 'Do not merge Dynamic Yield figures with Shopify/Triple Whale datasets.',
  }),
  rec('BMK-001', 'Global Ecommerce Conversion Rate (Triple Whale)', 'CONVERSION', 0.0266, '~2.66%', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {
    dataset: 'August 2025 – July 2026',
    sampleSize: '53,000+ ecommerce brands',
    caution: 'Do NOT compare against global average without considering industry, traffic source, device, geography, price, business model.',
  }),
  rec('BMK-003', 'Global Ecommerce Conversion Rate (Dynamic Yield)', 'CONVERSION', 0.0272, '~2.72%', 'Dynamic Yield XP² Ecommerce Benchmarks', 'verified', {}),
  rec('BMK-050', 'Paid Advertising Conversion Rate', 'CONVERSION', 0.0169, '~1.69%', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {
    dataset: 'August 2025 – July 2026',
    sampleSize: '53,000+ ecommerce brands',
  }),
];

/**
 * Quiz-funnel benchmarks. Participation is UNVERIFIED — contextual only.
 * Quiz completion uses the V1 range (BENCHMARK 074, Outgrow-derived).
 */
export const QUIZ_BENCHMARKS: BenchmarkRecord[] = [
  rec('BMK-074', 'Quiz Completion Rate (V1 range)', 'CONVERSION', 0.65, '50% / 65% / 80%', 'Outgrow + related references (BRAIN V1 range)', 'verified', {
    caution: 'Benchmark assumption range, NOT observed business data.',
  }),
  rec('BMK-075', 'Quiz-to-Purchase Rate', 'CONVERSION', 0.12, '8% / 12% / 18%', 'Historical reference (Octane AI skincare) — REQUIRES SOURCE VALIDATION', 'unverified', {
    caution: 'UNVERIFIED: must NEVER drive quantitative revenue calculations. Context only.',
  }),
];

/**
 * Retention-basis benchmarks. 90-day RPR (076) is UNVERIFIED; the
 * calculator uses Shopify/Smile.io verified records instead.
 */
export const RETENTION_BENCHMARKS: BenchmarkRecord[] = [
  rec('BMK-015', 'Average Ecommerce Repeat Customer Rate', 'RETENTION', 0.282, '~28.2%', 'Shopify — Ecommerce Customer Retention', 'verified', {
    caution: 'Varies substantially by product type, purchase cycle, consumability, subscription model, price.',
  }),
  rec('BMK-017', 'Repeat Purchase Rate — Consumable Products', 'RETENTION', 0.29, '~29%', 'Shopify (meal delivery and supplements)', 'verified', {
    caution: 'Do not directly equate skincare with supplements or meal delivery.',
  }),
  rec('BMK-076', '90-Day Repeat Purchase Rate', 'RETENTION', 0.2, '15% / 20% / 25%', 'Historical reference — REQUIRES SOURCE VALIDATION', 'unverified', {
    caution: 'UNVERIFIED: must NEVER drive quantitative revenue calculations. Context only.',
  }),
];

/**
 * AOV benchmarks by industry. Selection order: industry-matched first,
 * then DTC paid-channel median (041), then global (039/040).
 */
export const AOV_BENCHMARKS: BenchmarkRecord[] = [
  rec('BMK-BEAUTY-AOV', 'Beauty / Skincare AOV (category placeholder)', 'CONVERSION', 0, 'Not established', 'Pending source validation (Section 27)', 'unverified', {
    caution: 'UNVERIFIED: skincare AOV $45/$65/$85 requires source validation. Context only.',
  }),
  rec('BMK-043', 'Industry AOV — Apparel', 'CONVERSION', 89.17, '~$89.17', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {}),
  rec('BMK-044', 'Industry AOV — Electronics', 'CONVERSION', 113.41, '~$113.41', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {}),
  rec('BMK-045', 'Industry AOV — Food & Beverage', 'CONVERSION', 63.32, '~$63.32', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {}),
  rec('BMK-046', 'Industry AOV — Home & Garden', 'CONVERSION', 114.43, '~$114.43', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {}),
  rec('BMK-047', 'Industry AOV — Automotive', 'CONVERSION', 116.34, '~$116.34', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {}),
  rec('BMK-048', 'Industry AOV — Travel Accessories & Luggage', 'CONVERSION', 130.91, '~$130.91', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {}),
  rec('BMK-041', 'Triple Whale Paid-Channel Median AOV', 'CONVERSION', 61.22, '~$61.22', 'Triple Whale — Ecommerce Benchmarks 2026', 'verified', {
    dataset: 'August 2025 – July 2026',
    caution: 'HIGH priority for DTC; better reference than global AOV for paid-heavy brands.',
  }),
  rec('BMK-040', 'Global AOV (Shopify guide)', 'CONVERSION', 145, '~$145', 'Shopify — Average Order Value', 'verified', {
    caution: 'Generic cross-industry figure; use only when no closer match exists.',
  }),
];

/** Revenue Protection context (reported separately, never deducted). */
export const SUPPORT_BENCHMARKS: BenchmarkRecord[] = [
  rec('BMK-064', 'Tickets per 100 Orders — Health & Beauty', 'REVENUE_PROTECTION', 0.21, '~21 / 100 orders', 'Gorgias Ecom Lab, March 2026', 'verified', {
    caution: 'Support intensity varies by category (Electronics ~46, Apparel ~22, F&B ~20 per 100 orders).',
  }),
];

/** Industry → applicable benchmark sets (Section 25 selection order). */
const INDUSTRY_AOV_ID: Partial<Record<IndustryKey, string>> = {
  apparel: 'BMK-043',
  electronics: 'BMK-044',
  food: 'BMK-045',
  home: 'BMK-046',
  automotive: 'BMK-047',
  travel: 'BMK-048',
};

const INDUSTRY_CVR_ID: Partial<Record<IndustryKey, string>> = {
  beauty: 'BMK-002',
};

const ALL_BENCHMARKS: BenchmarkRecord[] = [
  ...CONVERSION_BENCHMARKS,
  ...QUIZ_BENCHMARKS,
  ...RETENTION_BENCHMARKS,
  ...AOV_BENCHMARKS,
  ...SUPPORT_BENCHMARKS,
];

export function getBenchmark(id: string): BenchmarkRecord | undefined {
  return ALL_BENCHMARKS.find((b) => b.id === id);
}

/**
 * Select the most applicable conversion benchmark for an industry
 * (industry-matched before generic, per Section 25).
 */
export function selectConversionBenchmark(industry: IndustryKey): BenchmarkRecord {
  const industryMatch = INDUSTRY_CVR_ID[industry];
  if (industryMatch) {
    const found = getBenchmark(industryMatch);
    if (found) return found;
  }
  return getBenchmark('BMK-001') as BenchmarkRecord;
}

/**
 * Select the most applicable AOV benchmark for an industry:
 * industry match → DTC paid median → global.
 */
export function selectAovBenchmark(industry: IndustryKey): BenchmarkRecord {
  const industryMatch = INDUSTRY_AOV_ID[industry];
  if (industryMatch) {
    const found = getBenchmark(industryMatch);
    if (found) return found;
  }
  return getBenchmark('BMK-041') as BenchmarkRecord;
}

/**
 * Select the most applicable retention benchmark:
 * consumable-leaning industries get the consumable RPR record.
 */
export function selectRetentionBenchmark(industry: IndustryKey): BenchmarkRecord {
  if (industry === 'beauty' || industry === 'food') {
    return getBenchmark('BMK-017') as BenchmarkRecord;
  }
  return getBenchmark('BMK-015') as BenchmarkRecord;
}

/**
 * The benchmark "high" RPR ceiling used for the theoretical RPR gap:
 * the highest VERIFIED retention reference for the industry. A verified
 * ceiling only constitutes a valid gap when it sits strictly above the
 * business's resolved baseline RPR — that comparison happens in the
 * calculator (where the resolved baseline is known), so a baseline equal
 * to the ceiling can never masquerade as a "29% → 29% improvement"
 * (forensic-audit fix; unverified BMK-076 can never serve, R6).
 */
export function selectBenchmarkHighRpr(industry: IndustryKey): BenchmarkRecord {
  // The consumable RPR (0.29) is the higher verified retention reference.
  return selectRetentionBenchmark(industry);
}

/**
 * The VERIFIED industry-matched AOV benchmark for an industry, or null when
 * only generic/unverified references exist. Per MODEL RULES P4 the AOV basis
 * may be observed OR category-matched benchmarked; generic (BMK-041) and
 * unverified (BMK-BEAUTY-AOV) records never serve as the basis (R6/R10).
 */
export function selectVerifiedIndustryAov(industry: IndustryKey): BenchmarkRecord | null {
  const id = INDUSTRY_AOV_ID[industry];
  if (!id) return null;
  const found = getBenchmark(id);
  if (!found || found.verification !== 'verified') return null;
  return found;
}
