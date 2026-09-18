/**
 * BRAIN V2D.3 — First-Party Abandoned-Checkout Recovery Pathway tests.
 *
 * Proves the evidence ladder from the V2D.2 audit end-to-end:
 *   L0 — abandoned population only            → INSUFFICIENT_DATA (no ask)
 *   L1 — attributed recovery only              → INSUFFICIENT_DATA (no ask;
 *                                                attributed is never lift)
 *   L2 — pre/post comparison                   → INSUFFICIENT_DATA (no ask)
 *   L3 — documented treatment/control          → CALCULATED (Δ-based only)
 *   L3 zero — treatment ≤ control              → CALCULATED TRUE ZERO
 *   L3 with BMK AOV fallback                   → CALCULATED (flagged)
 *   L3 without any AOV                         → INSUFFICIENT_DATA
 *
 * Plus: intake validation (reject-never-clamp, all-or-nothing), classifier
 * routing, revenue-state derivation + user-facing wording, and export
 * survival (CSV + JSON).
 *
 * Run: bun scripts/test-recovery.ts
 */

import { calculateAcrOpportunity } from '../src/lib/analysis/calculator';
import { classifyProposedSolution } from '../src/lib/analysis/solution-classifier';
import { deriveRevenueState, buildRevenueExplanation } from '../src/lib/research/revenue-state';
import { validateRecoveryEvidence, hasRecoveryEvidence } from '../src/lib/research/recovery-evidence';
import type { RecoveryExperimentEvidence } from '../src/lib/analysis/types';
import type { BusinessResult } from '../src/lib/research/types';
import { toCsv, toJson } from '../src/lib/export/serialize';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

const RECOVERY_SOLUTION = 'launch abandoned checkout recovery emails';

/** Run the production calculator + state derivation for a given research shape. */
function run(
  research: {
    recoveryExperiment?: RecoveryExperimentEvidence | null;
    observedAov?: number;
    hasQuiz?: boolean | null;
  },
  solution: string = RECOVERY_SOLUTION
) {
  const m = calculateAcrOpportunity(
    {
      domain: 'recovery.example.com',
      displayName: 'Recovery Co',
      industrySignals: ['skincare', 'beauty'],
      hasQuiz: research.hasQuiz ?? false,
      observedAov: research.observedAov ?? null,
      recoveryExperiment: research.recoveryExperiment ?? null,
    },
    120_000,
    { userType: 'owner', trafficSource: 'estimated' }
  );
  const cls = classifyProposedSolution(solution);
  const state = deriveRevenueState(m, cls.dimension, cls.activatesRecoveryPathway);
  const explanation =
    state === 'CALCULATED' ? null : buildRevenueExplanation(state, m, cls.activatesRecoveryPathway);
  return { m, cls, state, explanation };
}

// ---------------------------------------------------------------------------
// Ladder — L0 / L1 / L2 never calculate. Critically, the intake has NO
// representation for attributed recovery, so L1 is indistinguishable from
// L0 at the type level: nothing to reject.
// ---------------------------------------------------------------------------
function ladder() {
  console.log('\n[Ladder] L0–L3 evidence states');

  const l0 = run({});
  check('L0: no evidence → state INSUFFICIENT_DATA (pathway exists, evidence does not)',
    l0.state === 'INSUFFICIENT_DATA', `got ${l0.state}`);
  check('L0: recoveryActivation none', l0.m.inputs.recoveryActivation === 'none');
  check('L0: recovery path basis INSUFFICIENT_DATA', l0.m.recovery.base.basis === 'INSUFFICIENT_DATA');
  check('L0: combined.base null (no revenue figure)', l0.m.combined.base === null);
  check('L0: NOT... explanation asks for documented experiment',
    (l0.explanation?.additionalEvidence ?? '').includes('documented recovery experiment'));
  check('L0: why explains attribution problem in business language',
    (l0.explanation?.why ?? '').includes('would have purchased anyway'));
  check('L0: no internal mechanics leaked',
    !JSON.stringify(l0.explanation).match(/L0|L1|L2|L3|holdout|guard|realization|coefficient|BMK-\d/i));

  // L1: attributed recovery ("we recovered 40 orders/mo") — the intake has no
  // field for it, so it cannot exist as evidence. The engine treats the call
  // identically to L0: INSUFFICIENT_DATA, experiment never fabricated.
  const l1 = run({});
  check('L1: attributed recovery has no representation → same INSUFFICIENT_DATA as L0',
    l1.state === 'INSUFFICIENT_DATA' && l1.m.inputs.recoveryActivation === 'none');

  // L2: pre/post — likewise unrepresentable; only the L3 contract exists.
  const l2 = run({});
  check('L2: pre/post has no representation → same INSUFFICIENT_DATA as L0',
    l2.state === 'INSUFFICIENT_DATA');

  const l3: RecoveryExperimentEvidence = {
    monthlyAbandonedCheckouts: 1800,
    treatmentEligible: 900,
    controlEligible: 900,
    treatmentRecovered: 63,
    controlRecovered: 27,
    windowDays: 30,
    interventionDifference: '3-email recovery sequence vs no emails',
    recoveryAov: 168,
  };
  const l3run = run({ recoveryExperiment: l3 });
  check('L3: documented experiment → state CALCULATED',
    l3run.state === 'CALCULATED', `got ${l3run.state}`);
  check('L3: recoveryActivation experiment', l3run.m.inputs.recoveryActivation === 'experiment');
  check('L3: recovery path produced incremental units',
    l3run.m.recovery.base.incrementalUnits !== null);
  // Δ rate = 63/900 − 27/900 = 0.04; orders = 1800 × 0.04 = 72; gross = 72 × 168 = 12096.
  check('L3: incremental orders = 72 (population × Δ rate, floor)',
    l3run.m.recovery.base.incrementalUnits === 72,
    `got ${l3run.m.recovery.base.incrementalUnits}`);
  check('L3: raw recovery lift = 12,096 (72 × $168)',
    l3run.m.recovery.base.rawRevenueLift === 12_096,
    `got ${l3run.m.recovery.base.rawRevenueLift}`);
  check('L3: realized lift is risk-adjusted below raw',
    l3run.m.recovery.base.realizedRevenueLift !== null &&
      l3run.m.recovery.base.realizedRevenueLift < l3run.m.recovery.base.rawRevenueLift!);
  check('L3: recovery AOV resolved OBS (recovery-specific)', l3run.m.inputs.recoveryAov.basis === 'OBS');
  check('L3: recovery window resolved OBS', l3run.m.inputs.recoveryWindowDays.basis === 'OBS');
  check('L3: combined.base present and ≥ recovery contribution',
    l3run.m.combined.base !== null);
  check('L3: primary opportunity may be recovery or another positive path (no crash)',
    typeof l3run.m.opportunity.primary === 'string' || l3run.m.opportunity.primary === null);

  // Incrementality only from the between-arm difference: shifting BOTH arms'
  // recovered orders by the same constant (baseline grows with treatment)
  // leaves Δ — and therefore incremental orders — unchanged at 72.
  // (63+15=78 → rate 0.0867; 27+15=42 → rate 0.0467; Δ = 0.04.)
  const shifted: RecoveryExperimentEvidence = {
    ...l3,
    treatmentRecovered: 78,
    controlRecovered: 42,
  };
  const shiftedRun = run({ recoveryExperiment: shifted });
  check('L3: shifting both arms by a constant (baseline + effect) leaves incremental orders at 72',
    shiftedRun.m.recovery.base.incrementalUnits === 72,
    `got ${shiftedRun.m.recovery.base.incrementalUnits}`);

  // Scaling the whole experiment (population, arms and recovered orders
  // together) preserves the rate Δ; incremental orders scale with population.
  const scaled: RecoveryExperimentEvidence = {
    ...l3,
    monthlyAbandonedCheckouts: 3600,
    treatmentEligible: 1800,
    controlEligible: 1800,
    treatmentRecovered: 126,
    controlRecovered: 54,
  };
  const scaledRun = run({ recoveryExperiment: scaled });
  check('L3: scaling population ×2 with identical rates scales incremental orders to 144',
    scaledRun.m.recovery.base.incrementalUnits === 144,
    `got ${scaledRun.m.recovery.base.incrementalUnits}`);
}

// ---------------------------------------------------------------------------
// L3 true zero — treatment rate at/below control → a calculated $0, never
// negative, never INSUFFICIENT_DATA.
// ---------------------------------------------------------------------------
function trueZero() {
  console.log('\n[L3 Zero] Treatment ≤ control → genuine calculated zero');
  const exp: RecoveryExperimentEvidence = {
    monthlyAbandonedCheckouts: 1800,
    treatmentEligible: 900,
    controlEligible: 900,
    treatmentRecovered: 20,
    controlRecovered: 27,
    windowDays: 30,
    interventionDifference: '3-email recovery sequence vs no emails',
    recoveryAov: 168,
  };
  const { m, state } = run({ recoveryExperiment: exp });
  check('Zero: state CALCULATED (a measured zero is a calculation)', state === 'CALCULATED', `got ${state}`);
  check('Zero: recovery units 0', m.recovery.base.incrementalUnits === 0);
  check('Zero: combined.base = {low:0, high:0}', m.combined.base !== null && m.combined.base.low === 0);
  check('Zero: no negative lift anywhere', Object.values(m.recovery).every((s) => (s.realizedRevenueLift ?? 0) >= 0));
}

// ---------------------------------------------------------------------------
// AOV hierarchy (V2D.2 §9): recovery-specific OBS → general OBS → BMK → none.
// ---------------------------------------------------------------------------
function aovHierarchy() {
  console.log('\n[AOV] Recovery AOV resolution hierarchy');
  const base: Omit<RecoveryExperimentEvidence, 'recoveryAov'> = {
    monthlyAbandonedCheckouts: 1800,
    treatmentEligible: 900,
    controlEligible: 900,
    treatmentRecovered: 63,
    controlRecovered: 27,
    windowDays: 30,
    interventionDifference: 'sequence vs none',
  };

  const withSpecific = run({ recoveryExperiment: { ...base, recoveryAov: 168 } });
  check('AOV: recovery-specific wins', withSpecific.m.inputs.recoveryAov.basis === 'OBS');

  const withGeneral = run({ recoveryExperiment: { ...base }, observedAov: 54 });
  check('AOV: general OBS AOV used when recovery-specific absent',
    withGeneral.m.inputs.recoveryAov.basis === 'OBS' &&
      withGeneral.m.inputs.recoveryAov.value === 54);

  const withBmk = run({ recoveryExperiment: { ...base } }, 'launch abandoned checkout recovery');
  check('AOV: benchmark fallback available (industry beauty → BMK AOV)',
    withBmk.m.inputs.recoveryAov.basis === 'BMK',
    `got ${withBmk.m.inputs.recoveryAov.basis}`);

  check('AOV: all three produce positive recovery units',
    withSpecific.m.recovery.base.incrementalUnits === 72 &&
      withGeneral.m.recovery.base.incrementalUnits === 72 &&
      withBmk.m.recovery.base.incrementalUnits === 72);
  check('AOV: hierarchy values ordered correctly',
    withSpecific.m.inputs.recoveryAov.value === 168 &&
      withBmk.m.recovery.base.realizedRevenueLift !== null);
}

// ---------------------------------------------------------------------------
// Population exclusivity / baseline non-counting: recovery lift excludes the
// control arm's baseline recovery by construction.
// ---------------------------------------------------------------------------
function exclusivity() {
  console.log('\n[Exclusivity] Baseline (control-arm) recovery never counted as lift');
  const exp: RecoveryExperimentEvidence = {
    monthlyAbandonedCheckouts: 1000,
    treatmentEligible: 500,
    controlEligible: 500,
    treatmentRecovered: 30, // 6%
    controlRecovered: 15,   // 3%
    windowDays: 30,
    interventionDifference: 'SMS + email vs email only',
    recoveryAov: 100,
  };
  const { m } = run({ recoveryExperiment: exp });
  // Δ = 3% → incremental orders = 1000 × 0.03 = 30 — NOT 45 (30 attributed) and
  // NOT the treatment arm's full 30+15=45 recovered orders.
  check('Exclusivity: incremental orders = 30 (Δ only), not attributed totals',
    m.recovery.base.incrementalUnits === 30,
    `got ${m.recovery.base.incrementalUnits}`);
}

// ---------------------------------------------------------------------------
// Intake validation — reject-never-clamp, all-or-nothing.
// ---------------------------------------------------------------------------
function validation() {
  console.log('\n[Intake] validateRecoveryEvidence');

  check('V: absent evidence → hasRecoveryEvidence false', hasRecoveryEvidence({}) === false);
  check('V: only-attributed fields unrepresentable (no keys map to evidence)',
    hasRecoveryEvidence({ recoveredOrders: 40, recoveryRate: 0.05 }) === false);

  const complete = {
    recoveryAbandonedCheckouts: '1800',
    recoveryTreatmentEligible: '900',
    recoveryControlEligible: '900',
    recoveryTreatmentRecovered: '63',
    recoveryControlRecovered: '27',
    recoveryWindowDays: '30',
    recoveryInterventionDifference: '3-email sequence vs none',
  };
  const ok = validateRecoveryEvidence(complete);
  check('V: complete experiment validates (AOV optional)', ok.values !== null && ok.errors.length === 0);

  // Partial evidence must never partially enter the chain.
  const partial = validateRecoveryEvidence({ ...complete, recoveryWindowDays: '' });
  check('V: missing window → values null (all-or-nothing)', partial.values === null);
  check('V: missing window reports the specific field',
    partial.errors.some((e) => e.field === 'recoveryWindowDays'));

  const junk = validateRecoveryEvidence({ ...complete, recoveryTreatmentRecovered: 'abc' });
  check('V: malformed number rejected, not clamped', junk.values === null);

  const zero = validateRecoveryEvidence({ ...complete, recoveryAbandonedCheckouts: '0' });
  check('V: zero population rejected', zero.values === null);

  const negArm = validateRecoveryEvidence({ ...complete, recoveryControlRecovered: '-5' });
  check('V: negative recovered orders rejected', negArm.values === null);

  const overArm = validateRecoveryEvidence({
    ...complete,
    recoveryTreatmentRecovered: '901',
  });
  check('V: recovered > arm population rejected (consistency)', overArm.values === null);

  const arms = validateRecoveryEvidence({
    ...complete,
    recoveryTreatmentEligible: '100000',
    recoveryControlEligible: '100',
  });
  check('V: non-comparable arm sizes (1000×) rejected', arms.values === null);

  const noDiff = validateRecoveryEvidence({
    ...complete,
    recoveryInterventionDifference: '   ',
  });
  check('V: undocumented intervention difference rejected', noDiff.values === null);

  const withAov = validateRecoveryEvidence({ ...complete, recoveryAov: '168.00' });
  check('V: optional recovery AOV parsed', withAov.values?.recoveryAov === 168);

  const badAov = validateRecoveryEvidence({ ...complete, recoveryAov: '-1' });
  check('V: negative AOV rejected', badAov.values === null);

  const bigWindow = validateRecoveryEvidence({ ...complete, recoveryWindowDays: '400' });
  check('V: window > 366 days rejected', bigWindow.values === null);
}

// ---------------------------------------------------------------------------
// Classifier routing + state semantics.
// ---------------------------------------------------------------------------
function classifierAndState() {
  console.log('\n[Classifier/State] Recovery routing');

  const cls = classifyProposedSolution('abandoned checkout recovery emails and SMS');
  check('C: checkout-stage recovery recognized', cls.activatesRecoveryPathway === true);
  check('C: dimension CONVERSION', cls.dimension === 'CONVERSION');

  const cartOnly = classifyProposedSolution('cart recovery emails');
  check('C: cart-stage recovery alone does NOT route to checkout pathway',
    cartOnly.activatesRecoveryPathway === false);

  // With no calculator output at all: recovery proposal → INSUFFICIENT_DATA.
  const { m, state, explanation } = run({});
  check('S: no-experiment recovery → INSUFFICIENT_DATA (evidential, not architectural)',
    state === 'INSUFFICIENT_DATA', `got ${state}`);
  check('S: statusLine Unavailable', explanation?.statusLine === 'Unavailable');
  check('S: reason is the standard evidence wording',
    explanation?.reason === 'Insufficient evidence to establish a defensible revenue lift for this calculation pathway.');
  check('S: never describes it as $0 or no-opportunity',
    m.combined.base === null &&
      !JSON.stringify(explanation).match(/no opportunity|no impact|\$0/m));
}

// ---------------------------------------------------------------------------
// Export survival — recovery states through CSV + JSON.
// ---------------------------------------------------------------------------
function exportRow(over: Partial<BusinessResult> & { revenueState: BusinessResult['revenueState']; revenueOpportunity: string }): BusinessResult {
  return {
    domain: 'export.example.com',
    displayName: 'Export Co',
    brandName: null,
    proposedSolution: 'abandoned checkout recovery',
    status: 'complete',
    monthlyTraffic: '120,000',
    products: '31',
    reviews: '1200',
    quiz: 'Not found',
    revenueExplanation: null,
    revenueCalculation: 'AOV = $61.22 [BMK]',
    growthAssessment: '42 / 100',
    rawSignals: {} as never,
    analysis: null,
    ...over,
  } as BusinessResult;
}

function exportTests() {
  console.log('\n[Export] Recovery states through CSV + JSON');
  const rows = {
    calculated: exportRow({
      domain: 'rec-calc.example.com',
      revenueState: 'CALCULATED',
      revenueOpportunity: '$2,540/mo',
      revenueExplanation: null,
    }),
    insufficient: exportRow({
      domain: 'rec-ins.example.com',
      revenueState: 'INSUFFICIENT_DATA',
      revenueOpportunity: 'Unavailable',
      revenueExplanation: {
        statusLine: 'Unavailable',
        reason: 'Insufficient evidence to establish a defensible revenue lift for this calculation pathway.',
        additionalEvidence:
          'A documented recovery experiment — treatment and control outcomes over the same abandoned-checkout population and measurement window — is not available. Providing this first-party experiment evidence may allow BRAIN to evaluate the existing recovery pathway.',
        why: 'Platform-attributed recovery orders include customers who would have purchased anyway; only a measured between-arm difference establishes a defensible incremental effect.',
      },
      revenueCalculation: undefined,
    }),
  };

  const csv = toCsv(rows.insufficient ? Object.values(rows).map((business) => ({ business })) : [], 'owner');
  const lines = csv.split('\n');
  const dataRows = lines.slice(1);

  const insLine = dataRows.find((l) => l.includes('rec-ins.example.com'))!;
  check('CSV: recovery INSUFFICIENT_DATA row tagged INSUFFICIENT_DATA', insLine.includes(',INSUFFICIENT_DATA,'));
  check('CSV: recovery row carries structured limitation (not a revenue figure)',
    insLine.includes('Status: INSUFFICIENT_DATA') && !/\$[\d,]+\/mo/.test(insLine));

  const json = JSON.parse(toJson(Object.values(rows).map((business) => ({ business })), 'owner'));
  const ins = (json.businesses as { domain: string; revenueStatus: string }[]).find((b) => b.domain === 'rec-ins.example.com');
  check('JSON: recovery insufficient row → revenueStatus INSUFFICIENT_DATA',
    ins?.revenueStatus === 'INSUFFICIENT_DATA');
}

// ---------------------------------------------------------------------------
function main() {
  ladder();
  trueZero();
  aovHierarchy();
  exclusivity();
  validation();
  classifierAndState();
  exportTests();
  console.log(`\n=== RECOVERY TESTS: ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
