/**
 * BRAIN V2B — INTERVENTION AUDIT HARNESS (READ-ONLY)
 *
 * Runs the REAL production classifier (classifyProposedSolution) and the REAL
 * production calculator (calculateAcrOpportunity) against realistic
 * proposed-solution strings for the 23 V2B interventions. No production code
 * is modified; this script exists only to produce the audit matrix evidence.
 *
 * Run: bun scripts/audit-interventions.ts
 */

import { classifyProposedSolution, type InterventionDimension } from '../src/lib/analysis/solution-classifier';
import { calculateAcrOpportunity } from '../src/lib/analysis/calculator';
import { deriveRevenueState } from '../src/lib/research/revenue-state';
import { validateFirstPartyInput } from '../src/lib/research/first-party';
import type { CalculatedMetrics } from '../src/lib/analysis/types';

interface InterventionSpec {
  n: number;
  name: string;
  dimension: 'Conversion' | 'Retention' | 'Acquisition';
  proposedSolution: string;
  /** Realistic observed-data best case for testing whether the path CAN run when inputs exist. */
  observed?: {
    aov?: number;
    monthlyBuyers?: number;
    repeatPurchaseRate?: number;
    conversionRate?: number;
  };
}

const INTERVENTIONS: InterventionSpec[] = [
  // --- CONVERSION ---
  { n: 1, name: 'AI product recommendation', dimension: 'Conversion', proposedSolution: 'Implement an AI-powered product recommendation system on the storefront', observed: { aov: 54 } },
  { n: 2, name: 'AI skincare routine creator', dimension: 'Conversion', proposedSolution: 'Implement an AI Skincare Routine Creator using customer zero-party data', observed: { aov: 54 } },
  { n: 3, name: 'Product finder / quiz', dimension: 'Conversion', proposedSolution: 'Build a product finder quiz to help shoppers choose the right item', observed: { aov: 54 } },
  { n: 4, name: 'Personalized product recommendations', dimension: 'Conversion', proposedSolution: 'Deploy personalized product recommendations based on browsing behavior', observed: { aov: 54 } },
  { n: 5, name: 'Website personalization', dimension: 'Conversion', proposedSolution: 'Add website personalization that adapts homepage content per visitor', observed: { aov: 54 } },
  { n: 6, name: 'Upsells', dimension: 'Conversion', proposedSolution: 'Set up post-add-to-cart upsell offers at checkout', observed: { aov: 54 } },
  { n: 7, name: 'Cross-sells', dimension: 'Conversion', proposedSolution: 'Add cross-sell product suggestions on product pages', observed: { aov: 54 } },
  { n: 8, name: 'Bundles', dimension: 'Conversion', proposedSolution: 'Create product bundles with volume discounts to raise AOV', observed: { aov: 54 } },
  { n: 9, name: 'Abandoned checkout recovery', dimension: 'Conversion', proposedSolution: 'Launch abandoned checkout recovery emails and SMS flows', observed: { aov: 54 } },
  { n: 10, name: 'CRO / checkout optimization', dimension: 'Conversion', proposedSolution: 'Run CRO improvements on the checkout flow to reduce friction', observed: { aov: 54 } },
  { n: 11, name: 'Reviews / social proof optimization', dimension: 'Conversion', proposedSolution: 'Implement a reviews and social proof program across the site', observed: { aov: 54 } },

  // --- RETENTION ---
  { n: 12, name: 'Replenishment automation', dimension: 'Retention', proposedSolution: 'Set up replenishment automation reminders timed to product usage', observed: { aov: 54, monthlyBuyers: 2400, repeatPurchaseRate: 0.18 } },
  { n: 13, name: 'Post-purchase lifecycle', dimension: 'Retention', proposedSolution: 'Build a post-purchase email lifecycle for onboarding and education', observed: { aov: 54, monthlyBuyers: 2400, repeatPurchaseRate: 0.18 } },
  { n: 14, name: 'Win-back automation', dimension: 'Retention', proposedSolution: 'Launch win-back automation for lapsed customers', observed: { aov: 54, monthlyBuyers: 2400, repeatPurchaseRate: 0.18 } },
  { n: 15, name: 'Loyalty program', dimension: 'Retention', proposedSolution: 'Introduce a loyalty program with points and rewards', observed: { aov: 54, monthlyBuyers: 2400, repeatPurchaseRate: 0.18 } },
  { n: 16, name: 'Subscription / replenishment program', dimension: 'Retention', proposedSolution: 'Launch a subscription replenishment program for consumable products', observed: { aov: 54, monthlyBuyers: 2400, repeatPurchaseRate: 0.18 } },
  { n: 17, name: 'Customer education lifecycle', dimension: 'Retention', proposedSolution: 'Create a customer education lifecycle with how-to content drips', observed: { aov: 54, monthlyBuyers: 2400, repeatPurchaseRate: 0.18 } },
  { n: 18, name: 'Personalized retention', dimension: 'Retention', proposedSolution: 'Deploy personalized retention messaging driven by customer preference data', observed: { aov: 54, monthlyBuyers: 2400, repeatPurchaseRate: 0.18 } },

  // --- ACQUISITION ---
  { n: 19, name: 'SEO', dimension: 'Acquisition', proposedSolution: 'Improve SEO with technical audits and content optimization', observed: { aov: 54 } },
  { n: 20, name: 'Paid acquisition', dimension: 'Conversion', proposedSolution: 'Run paid acquisition campaigns on Meta and Google', observed: { aov: 54 } },
  { n: 21, name: 'Lead generation', dimension: 'Acquisition', proposedSolution: 'Run lead generation campaigns with targeted outreach', observed: { aov: 54 } },
  { n: 22, name: 'Lead magnet / signup acquisition', dimension: 'Acquisition', proposedSolution: 'Offer a lead magnet with email capture signup form to acquire subscribers', observed: { aov: 54 } },
  { n: 23, name: 'Referral acquisition', dimension: 'Acquisition', proposedSolution: 'Build a referral acquisition program rewarding customer referrals', observed: { aov: 54 } },
];

function resultLabel(
  m: CalculatedMetrics,
  dimension?: InterventionDimension,
  activatesRecoveryPathway = false,
): 'CALCULATED' | 'INSUFFICIENT_DATA' | 'TRUE_ZERO' | 'NOT_SUPPORTED' {
  const conv = m.conversion.base;
  const ret = m.retention.base;
  const rec = m.recovery.base;
  if (conv.incrementalUnits === null && ret.incrementalUnits === null && rec.incrementalUnits === null) {
    // V2B.3: the authoritative three-state derivation, shared with production.
    // V2D.3: the classifier's recovery flag participates (recovery proposals
    // without experiment evidence are INSUFFICIENT_DATA, not NOT_SUPPORTED).
    const state = deriveRevenueState(m, dimension, activatesRecoveryPathway);
    if (state === 'NOT_SUPPORTED') return 'NOT_SUPPORTED';
    return 'INSUFFICIENT_DATA';
  }
  const anyPositive = [conv.realizedRevenueLift, ret.realizedRevenueLift, rec.realizedRevenueLift].some(
    (v) => v !== null && v > 0
  );
  if (anyPositive) return 'CALCULATED';
  // All paths resolved but zero.
  const anyResolved =
    (conv.incrementalUnits !== null || ret.incrementalUnits !== null || rec.incrementalUnits !== null);
  if (anyResolved && m.combined.base !== null && m.combined.base.low === 0) return 'TRUE_ZERO';
  return 'INSUFFICIENT_DATA';
}

function scenarioValues(m: CalculatedMetrics): string {
  const fmt = (v: { low: number; high: number } | null) =>
    v === null ? 'null' : `$${v.low.toLocaleString()}`;
  return `cons=${fmt(m.combined.conservative)} base=${fmt(m.combined.base)} up=${fmt(m.combined.upside)}`;
}

console.log('BRAIN V2B — INTERVENTION AUDIT (real classifier + real calculator)\n');
console.log('Scenario: beauty business, 120K monthly visits [EST SimilarWeb], hasQuiz=false (observed),');
console.log('observed data only where the spec provides it. Owner+prospect identical for calculator.\n');

for (const spec of INTERVENTIONS) {
  const cls = classifyProposedSolution(spec.proposedSolution);
  // V2C: the classifier result is the single source — dimension is passed
  // straight through to state derivation, exactly like the engine.
  const m = calculateAcrOpportunity(
    {
      domain: `audit-${spec.n}.example.com`,
      displayName: `Audit ${spec.n}`,
      industrySignals: ['skincare serum cream'], // beauty: BMK-002 CVR, BMK-017 RPR ceiling, BMK-041 AOV fallback
      hasQuiz: false,
      solutionActivatesDataCollection: cls.activatesDataCollection,
      observedAov: spec.observed?.aov,
      observedMonthlyBuyers: spec.observed?.monthlyBuyers,
      observedRepeatPurchaseRate: spec.observed?.repeatPurchaseRate,
      observedConversionRate: spec.observed?.conversionRate,
    },
    120_000,
    { userType: 'prospect', trafficSource: 'estimated' }
  );

  const label = resultLabel(m, cls.dimension, cls.activatesRecoveryPathway);
  const phrases = cls.matchedPhrases.length ? cls.matchedPhrases.join(' | ') : '—';
  console.log(`#${String(spec.n).padStart(2, '0')} ${spec.name} [${spec.dimension}]`);
  console.log(`    classifier: ${cls.activatesDataCollection ? 'ACTIVATES' : 'no match'} ${phrases === '—' ? '' : `(${phrases})`}`);
  console.log(`    collectionActivation: ${m.inputs.collectionActivation} | status: ${m.sufficiency.status}`);
  console.log(`    conv base: ${m.conversion.base.incrementalUnits === null ? 'null' : `${m.conversion.base.incrementalUnits} units / $${m.conversion.base.realizedRevenueLift?.toLocaleString()}`} | ret base: ${m.retention.base.incrementalUnits === null ? 'null' : `${m.retention.base.incrementalUnits} units / $${m.retention.base.realizedRevenueLift?.toLocaleString()}`}`);
  console.log(`    combined: ${scenarioValues(m)} | RESULT: ${label}`);
  console.log('');
}

// --- Retention pathway probe: can retention EVER calculate? ---
console.log('--- RETENTION PATHWAY PROBE (interventions 12-18 group) ---');
console.log('Beauty baseline = BMK-017 (0.29) AND beauty ceiling = BMK-017 (0.29) → degenerate gap.');
console.log('Testing apparel (BMK-015 0.282 baseline + ceiling) and observed-low-RPR cases:\n');

const probeCases: Array<{ desc: string; industry: string[]; rpr?: number; buyers?: number }> = [
  { desc: 'apparel, RPR fallback 0.282 (= ceiling)', industry: ['apparel clothing fashion'] },
  { desc: 'beauty, observed RPR 0.18', industry: ['skincare'], rpr: 0.18, buyers: 2400 },
  { desc: 'beauty, observed RPR 0.25', industry: ['skincare'], rpr: 0.25, buyers: 2400 },
  { desc: 'beauty, observed RPR 0.29 (== ceiling)', industry: ['skincare'], rpr: 0.29, buyers: 2400 },
  { desc: 'generic, RPR fallback 0.282 (= ceiling)', industry: ['online store'] },
];

for (const c of probeCases) {
  const m = calculateAcrOpportunity(
    {
      domain: 'probe.example.com',
      displayName: 'Probe',
      industrySignals: c.industry,
      hasQuiz: false,
      observedRepeatPurchaseRate: c.rpr,
      observedMonthlyBuyers: c.buyers,
      observedAov: 54,
    },
    120_000,
    { userType: 'owner' }
  );
  console.log(`  ${c.desc}: ret base = ${m.retention.base.incrementalUnits === null ? 'null (INSUFFICIENT_DATA)' : `${m.retention.base.incrementalUnits} units / $${m.retention.base.realizedRevenueLift?.toLocaleString()}`}`);
}
console.log('\nKEY FINDING (V2B baseline): with the current benchmark library, retention calculates ONLY when');
console.log('an OBSERVED baseline RPR sits strictly below the single verified ceiling per industry');
console.log('(BMK-017 0.29 for beauty/food, BMK-015 0.282 for everything else).');
console.log('Baseline-from-benchmark == ceiling-from-benchmark → degenerate gap → NOT_SUPPORTED.');

// ---------------------------------------------------------------------------
// V2B.1 — FIRST-PARTY EVIDENCE INTAKE: production-path simulation.
// Simulates exactly what the API now does: validateFirstPartyInput() on the
// owner's raw intake strings, then researchBusiness() passes the canonical
// values into the calculator as firstPartyEconomics. No new pathways — the
// retention interventions were already structurally capable; they were
// starved of OBS evidence (V2B audit finding F3).
// ---------------------------------------------------------------------------

console.log('\n--- V2B.1: RETENTION WITH OWNER-SUPPLIED FIRST-PARTY DATA (interventions 12-18) ---');

const v2b1Cases: Array<{ desc: string; raw: Record<string, unknown> }> = [
  { desc: 'owner supplies RPR 18% + buyers 2400 (beauty, RPR < ceiling)', raw: { aov: '54.20', monthlyBuyers: '2400', repeatPurchaseRate: '18' } },
  { desc: 'owner supplies RPR 18% only (AOV/CVR/buyers fall back to benchmarks)', raw: { repeatPurchaseRate: '18' } },
  { desc: 'owner supplies RPR 29% (== BMK-017 ceiling → guard must hold)', raw: { monthlyBuyers: '2400', repeatPurchaseRate: '29' } },
  { desc: 'owner supplies nothing (V2B baseline — honest NOT_SUPPORTED)', raw: {} },
];

for (const c of v2b1Cases) {
  const { values, errors } = validateFirstPartyInput(c.raw);
  if (errors.length > 0) {
    console.log(`  ${c.desc}: VALIDATION REJECTED (${errors.map((e) => e.code).join(', ')})`);
    continue;
  }
  const m = calculateAcrOpportunity(
    {
      domain: 'v2b1-audit.example.com',
      displayName: 'V2B.1 Audit',
      industrySignals: ['skincare serum cream'],
      hasQuiz: false,
      ...values,
    },
    120_000,
    { userType: 'owner', trafficSource: 'estimated' }
  );
  const rprBasis = m.inputs.repeatPurchaseRate.basis;
  console.log(`  ${c.desc}:`);
  console.log(`    RPR basis=${rprBasis} | ret base = ${m.retention.base.incrementalUnits === null ? 'null (INSUFFICIENT_DATA — degenerate-gap guard intact)' : `${m.retention.base.incrementalUnits} units / $${m.retention.base.realizedRevenueLift?.toLocaleString()}`}`);
}

console.log('\nV2B.1 NOTE: unsupported interventions (#5-#11, #19-#21, #23) remain NOT_SUPPORTED —');
console.log('first-party evidence flows into EXISTING pathways only; no new calculator paths were added.');
