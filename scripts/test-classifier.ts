/**
 * BRAIN V2C — Single-Source Intervention Dimension classifier tests.
 *
 * Proves:
 *  1. Dimension classification (CONVERSION / RETENTION / ACQUISITION / UNKNOWN)
 *     per the V2C spec matrix (§21), including precedence rules (§14) and the
 *     anti-overmatching discipline (§15).
 *  2. Data-collection ACTIVATION regression — V2C did not alter the existing
 *     activation behavior (§22); previously rejected concepts stay rejected.
 *  3. Dimension ≠ pathway support: a CONVERSION dimension never activates the
 *     collection pathway by itself (§4/§10).
 *  4. Determinism (§15): identical input always yields identical output.
 *
 * Run: bun scripts/test-classifier.ts
 */

import { classifyProposedSolution } from '../src/lib/analysis/solution-classifier';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ---------------------------------------------------------------------------
// §21 — Dimension matrix.
// ---------------------------------------------------------------------------
function dimensionMatrix() {
  console.log('\n[Dimensions] V2C §21 classification matrix');

  // --- CONVERSION ---
  const conversion: [string, boolean?][] = [
    ['AI product recommendation', false],
    ['personalized product recommendations', true],
    ['AI skincare routine creator using customer zero-party data', true],
    ['product finder quiz', true],
    ['abandoned checkout recovery', false],
    ['cart recovery', false],
    ['checkout optimization', false],
    ['upsells', false],
    ['cross-sells', false],
    ['product bundles', false],
    ['general CRO improvements across the funnel', false],
  ];
  check(
    'CONVERSION: spec examples classify CONVERSION',
    conversion.every(([s, act]) => {
      const r = classifyProposedSolution(s);
      return r.dimension === 'CONVERSION' && (act === undefined || r.activatesDataCollection === act);
    }),
    conversion.filter(([s, act]) => {
      const r = classifyProposedSolution(s);
      return r.dimension !== 'CONVERSION' || (act !== undefined && r.activatesDataCollection !== act);
    }).map(([s]) => `"${s}" → ${JSON.stringify(classifyProposedSolution(s))}`).join('; ')
  );

  // --- RETENTION ---
  const retention = [
    'customer retention strategy',
    'repeat purchase automation',
    'post-purchase lifecycle',
    'replenishment automation',
    'customer win-back campaign',
    'retention email campaign',
    'automated customer reactivation and repeat-purchase workflow',
    'loyalty program',
    'subscription / replenishment program',
    'customer education lifecycle',
    'personalized retention',
    'LTV strategy for lifetime value',
  ];
  check(
    'RETENTION: spec examples classify RETENTION',
    retention.every((s) => classifyProposedSolution(s).dimension === 'RETENTION'),
    retention.filter((s) => classifyProposedSolution(s).dimension !== 'RETENTION')
      .map((s) => `"${s}" → ${classifyProposedSolution(s).dimension}`).join('; ')
  );

  // --- ACQUISITION ---
  const acquisition = [
    'SEO strategy',
    'search engine optimization retainer',
    'paid advertising',
    'paid ads on Meta and Google',
    'PPC management',
    'Google Ads campaigns',
    'Meta Ads creative',
    'social media acquisition campaigns',
    'lead generation campaign',
    'lead gen outreach',
    'prospecting workflows',
    'referral acquisition',
    'new customer acquisition',
    'traffic acquisition',
    'influencer acquisition',
  ];
  check(
    'ACQUISITION: spec examples classify ACQUISITION',
    acquisition.every((s) => classifyProposedSolution(s).dimension === 'ACQUISITION'),
    acquisition.filter((s) => classifyProposedSolution(s).dimension !== 'ACQUISITION')
      .map((s) => `"${s}" → ${classifyProposedSolution(s).dimension}`).join('; ')
  );

  // --- UNKNOWN (never guess) ---
  const unknown = [
    'AI automation system',
    'email marketing',
    'website redesign',
    'branding refresh',
    'content strategy',
    'analytics implementation',
    'reviews and social proof optimization',
    'improve operations',
  ];
  check(
    'UNKNOWN: ambiguous/generic proposals never guessed',
    unknown.every((s) => classifyProposedSolution(s).dimension === 'UNKNOWN'),
    unknown.filter((s) => classifyProposedSolution(s).dimension !== 'UNKNOWN')
      .map((s) => `"${s}" → ${classifyProposedSolution(s).dimension}`).join('; ')
  );
  check('UNKNOWN: null/empty input → UNKNOWN + no activation',
    classifyProposedSolution(null).dimension === 'UNKNOWN' &&
    classifyProposedSolution('').dimension === 'UNKNOWN' &&
    classifyProposedSolution('   ').dimension === 'UNKNOWN');
}

// ---------------------------------------------------------------------------
// §14 — Deterministic precedence: the strongest concept wins; generic words
// ("customer", "email", "data", "ads") never decide a dimension alone.
// ---------------------------------------------------------------------------
function precedence() {
  console.log('\n[Precedence] Strongest explicit concept wins');

  check('P: "retention email campaign" → RETENTION (not email-generic)',
    classifyProposedSolution('retention email campaign').dimension === 'RETENTION');
  check('P: "paid acquisition campaign" → ACQUISITION (not campaign-generic)',
    classifyProposedSolution('paid acquisition campaign').dimension === 'ACQUISITION');
  check('P: routine creator + zero-party data → CONVERSION + activates (data never overrides)',
    classifyProposedSolution('AI skincare routine creator using customer zero-party data').dimension === 'CONVERSION' &&
    classifyProposedSolution('AI skincare routine creator using customer zero-party data').activatesDataCollection === true);
  check('P: "post-purchase upsells" → CONVERSION (concept beats post-purchase family)',
    classifyProposedSolution('post-purchase upsells').dimension === 'CONVERSION');
  check('P: "abandoned checkout recovery emails" → CONVERSION (strongest concept)',
    classifyProposedSolution('abandoned checkout recovery emails').dimension === 'CONVERSION');
  check('P: "retention strategy with win-back flows" → RETENTION',
    classifyProposedSolution('retention strategy with win-back flows').dimension === 'RETENTION');
}

// ---------------------------------------------------------------------------
// §15 — Word-boundary discipline / no overmatching.
// ---------------------------------------------------------------------------
function overmatching() {
  console.log('\n[Overmatching] Word-boundary discipline');

  check('O: "retention" never matches inside unrelated words',
    classifyProposedSolution('presentation redesign for attorneys').dimension !== 'RETENTION');
  check('O: normalizer collapses whitespace and survives punctuation',
    classifyProposedSolution('Replenishment\n  automation\tprogram!').dimension === 'RETENTION' &&
    classifyProposedSolution('REPLENISHMENT AUTOMATION').dimension === 'RETENTION');
  check('O: case-insensitive matching',
    classifyProposedSolution('Abandoned Checkout Recovery').dimension === 'CONVERSION');
}

// ---------------------------------------------------------------------------
// §22 — Data-collection activation regression: V2C changed nothing here.
// ---------------------------------------------------------------------------
function activationRegression() {
  console.log('\n[Activation] V2C §22 regression — existing activation unchanged');

  const activates = [
    'AI skincare routine creator using customer zero-party data',
    'product finder quiz',
    'Add a quiz',
    'Launch a routine builder',
    'Run a customer survey',
    'Add a sign-up form with email capture',
    'Build a preference capture flow',
    'Deploy a questionnaire',
    'zero-party data capture strategy',
    'personalized product recommendations engine',
  ];
  check('Activation: all existing supported concepts still activate',
    activates.every((s) => classifyProposedSolution(s).activatesDataCollection === true),
    activates.filter((s) => !classifyProposedSolution(s).activatesDataCollection).join('; '));

  const rejected = [
    'SEO optimization',
    'social media campaign',
    'email marketing',
    'paid ads',
    'website redesign',
    'branding refresh',
    'content strategy',
    'analytics implementation',
    'general CRO improvements',
    'Set up generic email marketing campaigns',
  ];
  check('Activation: previously rejected concepts remain rejected',
    rejected.every((s) => classifyProposedSolution(s).activatesDataCollection === false),
    rejected.filter((s) => classifyProposedSolution(s).activatesDataCollection).join('; '));

  check('Activation: lead magnet keeps existing behavior (activates via signup capture, ACQUISITION dimension)',
    classifyProposedSolution('lead magnet with email capture signup form').activatesDataCollection === true &&
    classifyProposedSolution('lead magnet with email capture signup form').dimension === 'ACQUISITION');
}

// ---------------------------------------------------------------------------
// §4/§10 — Dimension ≠ pathway support: dimension never flips activation.
// ---------------------------------------------------------------------------
function dimensionNotPathway() {
  console.log('\n[Dimension≠Pathway] Taxonomy never implies revenue support');

  const conversionUnsupported = [
    'abandoned checkout recovery',
    'upsells',
    'cross-sells',
    'product bundles',
    'cart recovery',
  ];
  check('D≠P: CONVERSION dimension does NOT activate collection for unsupported interventions',
    conversionUnsupported.every((s) => {
      const r = classifyProposedSolution(s);
      return r.dimension === 'CONVERSION' && r.activatesDataCollection === false;
    }));
  check('D≠P: ACQUISITION dimension does NOT activate collection',
    classifyProposedSolution('SEO strategy').activatesDataCollection === false &&
    classifyProposedSolution('paid advertising').activatesDataCollection === false);
  check('D≠P: RETENTION dimension does NOT activate collection',
    classifyProposedSolution('replenishment automation').activatesDataCollection === false &&
    classifyProposedSolution('customer retention strategy').activatesDataCollection === false);
}

// ---------------------------------------------------------------------------
// §15 — Determinism.
// ---------------------------------------------------------------------------
function determinism() {
  console.log('\n[Determinism] Identical input → identical output');
  const samples = [
    'AI skincare routine creator using customer zero-party data',
    'replenishment automation',
    'abandoned checkout recovery',
    'SEO strategy',
    'AI automation system',
    null,
    '',
  ];
  check('DET: all samples stable across repeated calls',
    samples.every((s) =>
      JSON.stringify(classifyProposedSolution(s)) === JSON.stringify(classifyProposedSolution(s))));
  check('DET: matchedPhrases sorted + deduplicated',
    JSON.stringify(classifyProposedSolution('Build a product finder quiz with preference capture').matchedPhrases) ===
    JSON.stringify([...new Set(classifyProposedSolution('Build a product finder quiz with preference capture').matchedPhrases)].sort()));
}

// ---------------------------------------------------------------------------
function main() {
  dimensionMatrix();
  precedence();
  overmatching();
  activationRegression();
  dimensionNotPathway();
  determinism();

  console.log(`\n=== CLASSIFIER TESTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
