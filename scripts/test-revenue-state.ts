/**
 * BRAIN V2B.3 — Evidence Boundary State regression tests.
 *
 * Proves the four analytically distinct outcomes survive the full pipeline:
 *   Case A — CALCULATED with positive revenue (supported Conversion intervention)
 *   Case B — INSUFFICIENT_DATA: retention pathway exists, owner supplied no
 *            observed RPR → benchmark-only degenerate gap (evidence wording)
 *   Case B2 — INSUFFICIENT_DATA: observed RPR at the ceiling → degenerate-gap
 *            guard holds, wording reflects that RPR WAS provided
 *   Case C — NOT_SUPPORTED: no validated pathway (abandoned checkout recovery)
 *   Case D — TRUE ZERO: a genuine calculated $0/mo stays CALCULATED
 *   Plus: state derivation units + export survival (CSV + JSON) for all four.
 *
 * Run: bun scripts/test-revenue-state.ts
 */

import { calculateAcrOpportunity } from '../src/lib/analysis/calculator';
import type { CalculatedMetrics } from '../src/lib/analysis/types';
import { classifyProposedSolution, type InterventionDimension } from '../src/lib/analysis/solution-classifier';
import {
  deriveRevenueState,
  buildRevenueExplanation,
  isTrueZero,
} from '../src/lib/research/revenue-state';
import type { BusinessResult } from '../src/lib/research/types';
import { toCsv, toJson } from '../src/lib/export/serialize';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ---------------------------------------------------------------------------
// Case A — CALCULATED: supported conversion intervention (routine creator,
// counterfactual collection path), realistic traffic.
// ---------------------------------------------------------------------------
function caseA() {
  console.log('\n[Case A] Calculated — supported conversion intervention');
  const m = calculateAcrOpportunity(
    {
      domain: 'v2b3-a.example.com',
      displayName: 'Case A Skincare',
      industrySignals: ['skincare', 'serum'],
      hasQuiz: false,
      solutionActivatesDataCollection: true,
    },
    120_000,
    { userType: 'prospect' }
  );

  const state = deriveRevenueState(m, classifyProposedSolution('AI skincare routine creator using customer zero-party data').dimension);
  const explanation = buildRevenueExplanation(state, m);

  check('A: state = CALCULATED', state === 'CALCULATED', `got ${state}`);
  check('A: combined.base is a positive figure', m.combined.base !== null && m.combined.base.low > 0, `got ${m.combined.base?.low}`);
  check('A: no explanation payload', explanation.statusLine === 'Calculated' && explanation.additionalEvidence === null);
  check('A: isTrueZero false', isTrueZero(m) === false);
}

// ---------------------------------------------------------------------------
// Case B — INSUFFICIENT_DATA: retention pathway exists (replenishment
// automation), owner supplied NO observed RPR → benchmark-only degenerate gap.
// ---------------------------------------------------------------------------
function caseB() {
  console.log('\n[Case B] Insufficient data — retention pathway, no observed RPR');
  const m = calculateAcrOpportunity(
    {
      domain: 'v2b3-b.example.com',
      displayName: 'Case B Beauty',
      industrySignals: ['skincare', 'beauty'],
      hasQuiz: false,
    },
    120_000,
    { userType: 'owner' }
  );

  const state = deriveRevenueState(m, classifyProposedSolution('replenishment automation').dimension);
  const explanation = buildRevenueExplanation(state, m);

  check('B: state = INSUFFICIENT_DATA', state === 'INSUFFICIENT_DATA', `got ${state}`);
  check('B: combined.base null (no revenue number)', m.combined.base === null);
  check('B: collectionActivation none (retention dimension detected via solution)',
    m.inputs.collectionActivation === 'none');
  check('B: retention path blocked (basis INSUFFICIENT_DATA)',
    m.retention.base.basis === 'INSUFFICIENT_DATA');
  check('B: statusLine = Unavailable', explanation.statusLine === 'Unavailable');
  check('B: reason is evidence wording, not "$0" or "no opportunity"',
    explanation.reason === 'Insufficient evidence to establish a defensible revenue lift for this calculation pathway.');
  check('B: names Observed Repeat Purchase Rate as additional evidence',
    (explanation.additionalEvidence ?? '').includes('Observed Repeat Purchase Rate'));
  check('B: no gating language ("unlock")',
    !(explanation.additionalEvidence ?? '').toLowerCase().includes('unlock'));
  check('B: why = benchmark baseline explanation',
    explanation.why === 'The available benchmark evidence does not establish a defensible improvement over the current retention baseline.');
  check('B: does not expose guard/coefficient mechanics',
    !JSON.stringify(explanation).match(/ceiling|guard|realization|coefficient|factor|BMK-\d/i));
}

// ---------------------------------------------------------------------------
// Case B2 — INSUFFICIENT_DATA via the guard itself: owner DID supply RPR at
// the verified ceiling. Guard must hold; wording must not ask for RPR again.
// ---------------------------------------------------------------------------
function caseB2() {
  console.log('\n[Case B2] Insufficient data — observed RPR at ceiling (guard holds)');
  const m = calculateAcrOpportunity(
    {
      domain: 'v2b3-b2.example.com',
      displayName: 'Case B2 Beauty',
      industrySignals: ['skincare', 'beauty'],
      hasQuiz: false,
      observedRepeatPurchaseRate: 0.29,
      observedMonthlyBuyers: 2400,
    },
    120_000,
    { userType: 'owner' }
  );

  const state = deriveRevenueState(m, classifyProposedSolution('replenishment automation').dimension);
  const explanation = buildRevenueExplanation(state, m);

  check('B2: state = INSUFFICIENT_DATA (degenerate-gap guard intact)', state === 'INSUFFICIENT_DATA', `got ${state}`);
  check('B2: combined.base null', m.combined.base === null);
  check('B2: RPR provenance is OBS', m.inputs.repeatPurchaseRate.basis === 'OBS');
  check('B2: statusLine = Unavailable', explanation.statusLine === 'Unavailable');
  check('B2: does not ask for RPR again (already supplied)',
    !((explanation.additionalEvidence ?? '').includes('Observed Repeat Purchase Rate is not available')));
  check('B2: why = benchmark baseline explanation',
    explanation.why === 'The available benchmark evidence does not establish a defensible improvement over the current retention baseline.');
}

// ---------------------------------------------------------------------------
// Case C — NOT_SUPPORTED: abandoned checkout recovery has no validated
// revenue calculation pathway.
// ---------------------------------------------------------------------------
function caseC() {
  console.log('\n[Case C] Not supported — abandoned checkout recovery');
  const m = calculateAcrOpportunity(
    {
      domain: 'v2b3-c.example.com',
      displayName: 'Case C Store',
      industrySignals: ['skincare'],
      hasQuiz: false,
    },
    120_000,
    { userType: 'prospect' }
  );

  const state = deriveRevenueState(m, classifyProposedSolution('abandoned checkout recovery').dimension);
  const explanation = buildRevenueExplanation(state, m);

  check('C: state = NOT_SUPPORTED', state === 'NOT_SUPPORTED', `got ${state}`);
  check('C: combined.base null', m.combined.base === null);
  check('C: statusLine = Not currently supported', explanation.statusLine === 'Not currently supported');
  check('C: reason = pathway wording', explanation.reason === 'BRAIN does not currently have a validated revenue calculation pathway for this intervention.');
  check('C: no evidence ask (pathway gap, not evidence gap)',
    explanation.additionalEvidence === null && explanation.why === null);
}

// ---------------------------------------------------------------------------
// Case D — TRUE ZERO: a genuine calculated $0/mo must remain CALCULATED.
// Single-visitor observed-quiz case: every funnel quantity floors to zero —
// the calculator computes a real (zero) result rather than refusing.
// ---------------------------------------------------------------------------
function caseD() {
  console.log('\n[Case D] True zero — calculated $0/mo stays CALCULATED');
  const m = calculateAcrOpportunity(
    {
      domain: 'v2b3-d.example.com',
      displayName: 'Case D Micro Store',
      industrySignals: [],
      hasQuiz: true,
    },
    1,
    { userType: 'prospect' }
  );

  const state = deriveRevenueState(m, classifyProposedSolution('product quiz').dimension);

  check('D: state = CALCULATED (a calculated zero is a calculation)', state === 'CALCULATED', `got ${state}`);
  check('D: combined.base is exactly {low: 0, high: 0}',
    m.combined.base !== null && m.combined.base.low === 0 && m.combined.base.high === 0,
    `got ${JSON.stringify(m.combined.base)}`);
  check('D: isTrueZero true', isTrueZero(m) === true);
  check('D: sufficiency does NOT claim INSUFFICIENT_DATA', m.sufficiency.status !== 'INSUFFICIENT_DATA', `got ${m.sufficiency.status}`);
  check('D: explanation marks it Calculated',
    buildRevenueExplanation(state, m).statusLine === 'Calculated');
}

// ---------------------------------------------------------------------------
// Retention unlock regression (V2B.1 acceptance, expressed as state):
// observed RPR below ceiling → the retention path CALCULATES.
// ---------------------------------------------------------------------------
function retentionUnlock() {
  console.log('\n[Retention] Observed RPR below ceiling → CALCULATED');
  const m = calculateAcrOpportunity(
    {
      domain: 'v2b3-ret.example.com',
      displayName: 'Retention Co',
      industrySignals: ['skincare', 'beauty'],
      hasQuiz: false,
      observedRepeatPurchaseRate: 0.18,
      observedMonthlyBuyers: 2400,
    },
    120_000,
    { userType: 'owner' }
  );

  const state = deriveRevenueState(m, classifyProposedSolution('replenishment automation').dimension);
  check('Retention: state = CALCULATED', state === 'CALCULATED', `got ${state}`);
  check('Retention: positive risk-adjusted figure', m.combined.base !== null && m.combined.base.low > 0, `got ${m.combined.base?.low}`);
  check('Retention: retention path produced units', m.retention.base.incrementalUnits !== null);
}

// ---------------------------------------------------------------------------
// Unit tests — state derivation primitives.
// ---------------------------------------------------------------------------
function units() {
  console.log('\n[Units] deriveRevenueState / dimension mapping');

  const fake = (over: Partial<CalculatedMetrics> & { inputs: CalculatedMetrics['inputs'] }) =>
    ({
      sufficiency: { status: 'INSUFFICIENT_DATA', missingInputs: [], limitations: [] },
      conversion: {} as never,
      retention: {} as never,
      combined: { conservative: null, base: null, upside: null },
      opportunity: { conversion: null, retention: null, primary: null },
      ...over,
    }) as CalculatedMetrics;

  const inputsNone = { collectionActivation: 'none' } as CalculatedMetrics['inputs'];
  const inputsCounterfactual = { collectionActivation: 'counterfactual' } as CalculatedMetrics['inputs'];
  const dim = (s: string): InterventionDimension => classifyProposedSolution(s).dimension;

  check('U: counterfactual pathway + null revenue → INSUFFICIENT_DATA',
    deriveRevenueState(fake({ inputs: inputsCounterfactual }), dim('anything data-capture related quiz')) === 'INSUFFICIENT_DATA');
  check('U: no pathway + UNKNOWN dimension → NOT_SUPPORTED',
    deriveRevenueState(fake({ inputs: inputsNone }), 'UNKNOWN' as InterventionDimension) === 'NOT_SUPPORTED');
  check('U: no pathway + generic marketing solution → NOT_SUPPORTED',
    deriveRevenueState(fake({ inputs: inputsNone }), dim('generic branding and content strategy')) === 'NOT_SUPPORTED');
  check('U: no pathway + upsell (CONVERSION) → NOT_SUPPORTED',
    deriveRevenueState(fake({ inputs: inputsNone }), dim('post-purchase upsells')) === 'NOT_SUPPORTED');
  check('U: no pathway + abandoned checkout (CONVERSION) → NOT_SUPPORTED',
    deriveRevenueState(fake({ inputs: inputsNone }), dim('abandoned checkout recovery')) === 'NOT_SUPPORTED');
  check('U: no pathway + retention solution → INSUFFICIENT_DATA',
    deriveRevenueState(fake({ inputs: inputsNone }), dim('win-back email automation')) === 'INSUFFICIENT_DATA');
  check('U: no pathway + loyalty program → INSUFFICIENT_DATA',
    deriveRevenueState(fake({ inputs: inputsNone }), dim('loyalty program')) === 'INSUFFICIENT_DATA');
  check('U: calculated zero (typed) → CALCULATED',
    deriveRevenueState(fake({
      inputs: inputsNone,
      combined: { conservative: { low: 0, high: 0 }, base: { low: 0, high: 0 }, upside: { low: 0, high: 0 } },
    })) === 'CALCULATED');

  // V2C anti-regression: new retention wording flows through the classifier —
  // no revenue-state keyword list involved.
  check('U: novel retention wording classifies RETENTION and state consumes it',
    dim('automated customer reactivation and repeat-purchase workflow') === 'RETENTION' &&
    deriveRevenueState(fake({ inputs: inputsNone }), dim('automated customer reactivation and repeat-purchase workflow')) === 'INSUFFICIENT_DATA');

  // Every retention intervention from the V2B audit (#12–18).
  const audit12to18 = [
    'replenishment automation',
    'post-purchase lifecycle',
    'win-back automation',
    'loyalty program',
    'subscription / replenishment program',
    'customer education lifecycle',
    'personalized retention',
  ];
  check('U: all V2B retention interventions #12–18 map to INSUFFICIENT_DATA (no owner data)',
    audit12to18.every((s) => deriveRevenueState(fake({ inputs: inputsNone }), dim(s)) === 'INSUFFICIENT_DATA'));

  // V2B-unsupported set stays NOT_SUPPORTED.
  const unsupported = [
    'upsells', 'cross-sells', 'product bundles', 'abandoned checkout recovery',
    'generic CRO / checkout optimization', 'reviews and social proof optimization',
    'SEO', 'paid acquisition', 'referral acquisition',
  ];
  check('U: V2B-unsupported interventions remain NOT_SUPPORTED',
    unsupported.every((s) => deriveRevenueState(fake({ inputs: inputsNone }), dim(s)) === 'NOT_SUPPORTED'));
}

// ---------------------------------------------------------------------------
// Export survival — all four states through toCsv + toJson.
// ---------------------------------------------------------------------------
function exportRow(over: Partial<BusinessResult> & { revenueState: BusinessResult['revenueState']; revenueOpportunity: string }): BusinessResult {
  return {
    domain: 'export.example.com',
    displayName: 'Export Co',
    brandName: null,
    proposedSolution: 'proposed solution',
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

function exportTests(rows: Record<string, BusinessResult>) {
  console.log('\n[Export] State survival through CSV + JSON');

  const list = Object.values(rows);
  const userType = rows.calculated.proposedSolution != null ? 'owner' : 'prospect';

  // --- CSV ---
  const csv = toCsv(list.map((business) => ({ business })), userType);
  const lines = csv.split('\n');
  const header = lines[0];
  const dataRows = lines.slice(1);

  check('CSV: RevenueStatus column present once', (header.match(/RevenueStatus/g) ?? []).length === 1);
  check('CSV: RevenueStatus sits between PotentialRevenueLift and RevenueCalculation',
    /PotentialRevenueLift,RevenueStatus,RevenueCalculation/.test(header));

  const calcLine = dataRows.find((l) => l.includes(rows.calculated.revenueOpportunity))!;
  check('CSV: CALCULATED row tagged CALCULATED', calcLine.includes(',CALCULATED,'));
  check('CSV: CALCULATED row keeps its calculation trail verbatim', calcLine.includes('AOV = $61.22 [BMK]'));

  const zeroLine = dataRows.find((l) => l.includes(rows.trueZero.revenueOpportunity))!;
  check('CSV: TRUE ZERO row shows $0/mo', zeroLine.includes('$0/mo'));
  check('CSV: TRUE ZERO row tagged CALCULATED (not INSUFFICIENT_DATA / NOT_SUPPORTED)',
    zeroLine.includes(',CALCULATED,') && !zeroLine.includes('INSUFFICIENT_DATA') && !zeroLine.includes('NOT_SUPPORTED'));

  const insLine = dataRows.find((l) => l.includes('INSUFFICIENT_DATA'))!;
  check('CSV: INSUFFICIENT_DATA row tagged INSUFFICIENT_DATA', insLine.includes(',INSUFFICIENT_DATA,'));
  check('CSV: INSUFFICIENT_DATA row carries structured limitation',
    insLine.includes('Status: INSUFFICIENT_DATA') && insLine.includes('Additional evidence:'));
  check('CSV: INSUFFICIENT_DATA row never shows a revenue figure', !/\$[\d,]+\/mo/.test(insLine));

  const nsLine = dataRows.find((l) => l.includes('NOT_SUPPORTED'))!;
  check('CSV: NOT_SUPPORTED row tagged NOT_SUPPORTED', nsLine.includes(',NOT_SUPPORTED,'));
  check('CSV: NOT_SUPPORTED row carries pathway limitation',
    nsLine.includes('Status: NOT_SUPPORTED') && nsLine.includes('no validated revenue calculation pathway'));

  // --- JSON ---
  const json = JSON.parse(toJson(list.map((business) => ({ business })), userType));
  const byDomain = Object.fromEntries(
    (json.businesses as { domain: string; revenueStatus: string; potentialRevenueLift: string; revenueCalculation: string | null }[]).map(
      (b) => [b.domain, b]
    )
  );

  check('JSON: calculated row → revenueStatus CALCULATED', byDomain['calc.example.com'].revenueStatus === 'CALCULATED');
  check('JSON: insufficient row → revenueStatus INSUFFICIENT_DATA + structured reason', 
    byDomain['ins.example.com'].revenueStatus === 'INSUFFICIENT_DATA' &&
    (byDomain['ins.example.com'].revenueCalculation ?? '').includes('INSUFFICIENT_DATA'));
  check('JSON: not-supported row → revenueStatus NOT_SUPPORTED',
    byDomain['ns.example.com'].revenueStatus === 'NOT_SUPPORTED');
  check('JSON: true-zero row → revenueStatus CALCULATED with $0/mo lift',
    byDomain['zero.example.com'].revenueStatus === 'CALCULATED' &&
    byDomain['zero.example.com'].potentialRevenueLift === '$0/mo');
  check('JSON: revenueStatus never undefined on any row',
    Object.values(byDomain).every((b) => typeof b.revenueStatus === 'string'));
}

// ---------------------------------------------------------------------------
function main() {
  caseA();
  caseB();
  caseB2();
  caseC();
  caseD();
  retentionUnlock();
  units();

  const rows = {
    calculated: exportRow({
      domain: 'calc.example.com',
      revenueState: 'CALCULATED',
      revenueOpportunity: '$8,420/mo',
      revenueExplanation: null,
    }),
    insufficient: exportRow({
      domain: 'ins.example.com',
      revenueState: 'INSUFFICIENT_DATA',
      revenueOpportunity: 'Unavailable',
      revenueExplanation: {
        statusLine: 'Unavailable',
        reason: 'Insufficient evidence to establish a defensible revenue lift for this calculation pathway.',
        additionalEvidence: 'Observed Repeat Purchase Rate is not available. Providing this first-party metric may allow BRAIN to evaluate the existing retention pathway.',
        why: 'The available benchmark evidence does not establish a defensible improvement over the current retention baseline.',
      },
      revenueCalculation: undefined,
    }),
    notSupported: exportRow({
      domain: 'ns.example.com',
      revenueState: 'NOT_SUPPORTED',
      revenueOpportunity: 'Not currently supported',
      revenueExplanation: {
        statusLine: 'Not currently supported',
        reason: 'BRAIN does not currently have a validated revenue calculation pathway for this intervention.',
        additionalEvidence: null,
        why: null,
      },
      revenueCalculation: undefined,
    }),
    trueZero: exportRow({
      domain: 'zero.example.com',
      revenueState: 'CALCULATED',
      revenueOpportunity: '$0/mo',
      revenueExplanation: null,
    }),
  };
  exportTests(rows);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
