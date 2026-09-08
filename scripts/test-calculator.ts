/**
 * BRAIN QA — Calculator verification (QA task item 7 + item 8).
 *
 * Hand-computes the expected ACR results and asserts the calculator produces
 * exactly those numbers. Also asserts every hard guard is enforced in code.
 *
 * Run: bun scripts/test-calculator.ts
 */

import {
  calculateAcrOpportunity,
} from '../src/lib/analysis/calculator';
import { guardIncrementalFirstPurchases, guardProjectedRpr, guardAdditionalRepeatBuyers, canDriveRevenueMath, REALIZATION_FACTORS, RISK_BUFFERS, AUTOMATION_MATURITY_MODIFIERS } from '../src/lib/analysis/model-rules';
import { selectVerifiedIndustryAov, getBenchmark } from '../src/lib/analysis/benchmarks';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function approx(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps;
}

// ---------------------------------------------------------------------------
// Case 1: Apparel business — verified industry AOV (BMK-043 $89.17).
// Quiz path is INSUFFICIENT (no verified participation/to-purchase), so the
// conversion path is null; retention path uses observed monthly buyers.
// ---------------------------------------------------------------------------
function case1() {
  console.log('\n[Case 1] Apparel — verified industry AOV basis, observed buyers');
  const industry = 'apparel' as const;
  const aovBench = selectVerifiedIndustryAov(industry);
  check('apparel has a verified industry AOV benchmark', !!aovBench && aovBench.id === 'BMK-043');
  if (!aovBench) return;

  const traffic = 40_000;
  const observedBuyers = 800;
  const observedRpr = 0.18;
  const maturity = 'basic' as const;

  const m = calculateAcrOpportunity(
    {
      domain: 'qa-case1.example.com',
      displayName: 'QA Apparel Co',
      industrySignals: ['apparel clothing fashion'],
      hasQuiz: false,
      observedMonthlyBuyers: observedBuyers,
      observedRepeatPurchaseRate: observedRpr,
    },
    traffic,
    { userType: 'owner', automationMaturity: maturity }
  );

  // --- Hand computation (apparel selects BMK-015 = 0.282) ---
  // AOV basis: BMK-043 = 89.17 [BMK]
  // Baseline CVR: not observable → conversion path INSUFFICIENT_DATA
  // Retention: gap = 0.282 − 0.18 = 0.102
  //   conservative eff = 0.25 × 1.00 = 0.25 → projected = 0.2055
  //     additional = 800 × 0.0255 = 20.4 → units = 20 → raw = 20.4 × 89.17 = 1819.07
  //     realized = round(1819.07 × 0.25) = 455
  //   base eff = 0.50 → projected = 0.231 → additional = 40.8 → units 41
  //     raw = 3638.14 → realized = round(3638.14 × 0.5) = 1819
  //   upside eff = 0.75 → projected = 0.2565 → additional = 61.2 → units 61
  //     raw = 5457.20 → realized = round(5457.20 × 0.75) = 4093
  // Combined base = riskAdjusted(0 + 1819, 'base') = round(1819 × 0.9) = 1637

  check('sufficiency is PARTIAL (AOV benchmarked, CVR missing)', m.sufficiency.status === 'PARTIAL', `got ${m.sufficiency.status}`);
  check('industry classified as apparel', m.inputs.industry === 'apparel');
  check('AOV basis is BMK (verified category benchmark)', m.inputs.aov.basis === 'BMK' && m.inputs.aov.benchmarkId === 'BMK-043', `got ${m.inputs.aov.basis}/${m.inputs.aov.benchmarkId}`);
  check('AOV value = 89.17', m.inputs.aov.value === 89.17);
  check('conversion path INSUFFICIENT (baseline CVR unobservable)', m.conversion.base.incrementalUnits === null && m.conversion.base.basis === 'INSUFFICIENT_DATA');
  check('benchmark high RPR = 0.282 [BMK-015 apparel]', m.inputs.benchmarkHighRpr.value === 0.282 && m.inputs.benchmarkHighRpr.benchmarkId === 'BMK-015', `got ${m.inputs.benchmarkHighRpr.value}/${m.inputs.benchmarkHighRpr.benchmarkId}`);
  check('RPR gap ledger present (0.102)', m.evidenceLedger.some((s) => s.formula.includes('RPR Gap') && approx(s.output as number, 0.102)));

  check('retention conservative realized = 455', m.retention.conservative.realizedRevenueLift === 455, `got ${m.retention.conservative.realizedRevenueLift}`);
  check('retention base realized = 1819', m.retention.base.realizedRevenueLift === 1819, `got ${m.retention.base.realizedRevenueLift}`);
  check('retention upside realized = 4093', m.retention.upside.realizedRevenueLift === 4093, `got ${m.retention.upside.realizedRevenueLift}`);
  check('retention conservative units = 20', m.retention.conservative.incrementalUnits === 20, `got ${m.retention.conservative.incrementalUnits}`);
  check('retention base units = 41', m.retention.base.incrementalUnits === 41, `got ${m.retention.base.incrementalUnits}`);
  check('retention upside units = 61', m.retention.upside.incrementalUnits === 61, `got ${m.retention.upside.incrementalUnits}`);
  check('effective realization base = 0.5 (basic maturity)', m.retention.base.effectiveRealization === 0.5);

  check('combined base = 1637 (risk-adjusted)', m.combined.base?.low === 1637 && m.combined.base?.high === 1637, `got ${m.combined.base?.low}`);
  check('combined conservative = 387 (round(455×0.85))', m.combined.conservative?.low === 387, `got ${m.combined.conservative?.low}`);
  check('combined upside = 3888 (round(4093×0.95))', m.combined.upside?.low === 3888, `got ${m.combined.upside?.low}`);
  check('primary opportunity = retention', m.opportunity.primary === 'retention');
  check('workspace opportunity.retention = 1819', m.opportunity.retention === 1819, `got ${m.opportunity.retention}`);
  check('opportunity.conversion null (path insufficient)', m.opportunity.conversion === null);
}

// ---------------------------------------------------------------------------
// Case 2: Beauty business — observed AOV + observed buyers; quiz present but
// quiz path still INSUFFICIENT (participation/to-purchase unverified).
// ---------------------------------------------------------------------------
function case2() {
  console.log('\n[Case 2] Beauty — observed AOV, observed RPR, quiz present');
  const observedAov = 54.0;
  const observedBuyers = 2400;
  const observedRpr = 0.22;
  const maturity = 'none' as const;

  const m = calculateAcrOpportunity(
    {
      domain: 'qa-case2.example.com',
      displayName: 'QA Beauty Co',
      industrySignals: ['skincare serum cream'],
      hasQuiz: true,
      observedAov,
      observedMonthlyBuyers: observedBuyers,
      observedRepeatPurchaseRate: observedRpr,
    },
    120_000,
    { userType: 'owner', automationMaturity: maturity }
  );

  // --- Hand computation ---
  // AOV = 54 [OBS]. Conversion path INSUFFICIENT (participation unverified).
  // Retention: gap = 0.29 − 0.22 = 0.07; maturity none → modifier 1.2
  //   conservative eff = 0.25 × 1.2 = 0.30 → projected = 0.22 + 0.07×0.30 = 0.241
  //     additional = 2400 × 0.021 = 50.4 → raw = 50.4 × 54 = 2721.6 → realized = round(816.48) = 816
  //   base eff = 0.60 → projected = 0.262 → additional = 2400 × 0.042 = 100.8
  //     raw = 5443.2 → realized = round(5443.2 × 0.6) = 3266
  //   upside eff = 0.90 → projected = 0.283 → additional = 2400 × 0.063 = 151.2
  //     raw = 8164.8 → realized = round(8164.8 × 0.9) = 7348

  check('sufficiency reflects ALL model-input gaps (INSUFFICIENT_DATA at 3+ missing)', m.sufficiency.status === 'INSUFFICIENT_DATA', `got ${m.sufficiency.status}`);
  check('NOTE: revenue math still ran (P4 needs only traffic+AOV) — status/outputs divergence documented', m.retention.base.realizedRevenueLift === 3266);
  check('industry classified as beauty', m.inputs.industry === 'beauty');
  check('AOV basis OBS (54.00)', m.inputs.aov.basis === 'OBS' && m.inputs.aov.value === 54);
  check('quiz completion resolved from verified BMK-074', m.inputs.quizCompletion.basis === 'BMK');
  check('quiz participation INSUFFICIENT (unverified benchmark excluded)', m.inputs.quizParticipation.basis === 'INSUFFICIENT_DATA');
  check('quiz-to-purchase INSUFFICIENT (R6 exclusion)', m.inputs.quizToPurchase.basis === 'INSUFFICIENT_DATA');
  check('conversion path INSUFFICIENT despite quiz present', m.conversion.base.incrementalUnits === null);
  check('maturity modifier none applied (×1.2)', m.retention.base.effectiveRealization === 0.6, `got ${m.retention.base.effectiveRealization}`);

  check('retention conservative realized = 816', m.retention.conservative.realizedRevenueLift === 816, `got ${m.retention.conservative.realizedRevenueLift}`);
  check('retention base realized = 3266', m.retention.base.realizedRevenueLift === 3266, `got ${m.retention.base.realizedRevenueLift}`);
  check('retention upside realized = 7348', m.retention.upside.realizedRevenueLift === 7348, `got ${m.retention.upside.realizedRevenueLift}`);
  check('combined base = 2939 (round(3266×0.9))', m.combined.base?.low === 2939, `got ${m.combined.base?.low}`);
  check('primary opportunity = retention', m.opportunity.primary === 'retention');
}

// ---------------------------------------------------------------------------
// Case 3: No traffic, no AOV → everything INSUFFICIENT_DATA. Zero revenue.
// ---------------------------------------------------------------------------
function case3() {
  console.log('\n[Case 3] Data-starved business — INSUFFICIENT_DATA everywhere');
  const m = calculateAcrOpportunity(
    {
      domain: 'qa-case3.example.com',
      displayName: 'QA Ghost Store',
      industrySignals: [],
      hasQuiz: null,
    },
    null,
    { userType: 'prospect' }
  );

  check('sufficiency INSUFFICIENT_DATA', m.sufficiency.status === 'INSUFFICIENT_DATA', `got ${m.sufficiency.status}`);
  check('missing inputs include traffic and AOV', m.sufficiency.missingInputs.some((x) => x.includes('traffic')) && m.sufficiency.missingInputs.some((x) => x.includes('AOV')));
  check('conversion all scenarios null', ['conservative', 'base', 'upside'].every((k) => m.conversion[k as keyof typeof m.conversion].incrementalUnits === null));
  check('retention all scenarios null', ['conservative', 'base', 'upside'].every((k) => m.retention[k as keyof typeof m.retention].incrementalUnits === null));
  check('combined all null', ['conservative', 'base', 'upside'].every((k) => m.combined[k as keyof typeof m.combined] === null));
  check('opportunity.primary null', m.opportunity.primary === null);
  check('no fabricated industry (generic)', m.inputs.industry === 'generic');
  check('AOV INSUFFICIENT (no verified generic fallback)', m.inputs.aov.basis === 'INSUFFICIENT_DATA');
}

// ---------------------------------------------------------------------------
// Case 4 (guard verification): code-level enforcement of every hard guard.
// ---------------------------------------------------------------------------
function case4() {
  console.log('\n[Case 4] Hard guards — code-level enforcement');

  check('guard: negative quiz purchases → 0', guardIncrementalFirstPurchases(-50, 100) === 0);
  check('guard: purchases > participants → capped at participants', guardIncrementalFirstPurchases(150, 100) === 100);
  check('guard: normal case passes through', guardIncrementalFirstPurchases(60, 100) === 60);
  check('guard: zero participants → 0', guardIncrementalFirstPurchases(10, 0) === 0);

  check('guard: RPR below 0 → clamped to 0', guardProjectedRpr(-0.2) === 0);
  check('guard: RPR above 1 → clamped to 1 (100%)', guardProjectedRpr(1.4) === 1);
  check('guard: RPR within range unchanged', guardProjectedRpr(0.42) === 0.42);

  check('guard: negative buyers → 0', guardAdditionalRepeatBuyers(-12) === 0);

  check('guard: unverified benchmark refused', canDriveRevenueMath('unverified') === false);
  check('guard: verified benchmark allowed', canDriveRevenueMath('verified') === true);

  // BMK-075 quiz-to-purchase and BMK-076 (90-day RPR) must be unverified.
  const b075 = getBenchmark('BMK-075');
  const b076 = getBenchmark('BMK-076');
  check('BMK-075 (quiz-to-purchase) is unverified', b075?.verification === 'unverified');
  check('BMK-076 (90-day RPR) is unverified', b076?.verification === 'unverified');
  check('generic industry has NO verified AOV fallback (no fabrication)', selectVerifiedIndustryAov('generic') === null);
  check('beauty industry has NO verified AOV fallback (placeholder unverified)', selectVerifiedIndustryAov('beauty') === null);
}

// ---------------------------------------------------------------------------
// Parameter sanity (model-rules constants match the MODEL RULES document)
// ---------------------------------------------------------------------------
function case5() {
  console.log('\n[Case 5] Model rules parameter integrity');
  check('realization conservative = 0.25', REALIZATION_FACTORS.conservative === 0.25);
  check('realization base = 0.50', REALIZATION_FACTORS.base === 0.5);
  check('realization upside = 0.75', REALIZATION_FACTORS.upside === 0.75);
  check('buffer conservative = 0.15', RISK_BUFFERS.conservative === 0.15);
  check('buffer base = 0.10', RISK_BUFFERS.base === 0.1);
  check('buffer upside = 0.05', RISK_BUFFERS.upside === 0.05);
  check('maturity none = 1.2', AUTOMATION_MATURITY_MODIFIERS.none === 1.2);
  check('maturity basic = 1.0', AUTOMATION_MATURITY_MODIFIERS.basic === 1.0);
  check('maturity mature = 0.75', AUTOMATION_MATURITY_MODIFIERS.mature === 0.75);
}

case1();
case2();
case3();
case4();
case5();

console.log(`\n=== CALCULATOR TESTS: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
