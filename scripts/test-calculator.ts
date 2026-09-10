/**
 * BRAIN calculator tests — deterministic ACR engine coverage.
 *
 * Baseline suite was 66/66. The V1 benchmark-based input-resolution update
 * changes model behaviour by design (documented ASM bands now participate;
 * verified benchmarks may fill unobservable baselines; the incremental
 * subtraction defect is fixed), so this suite is intentionally updated:
 * 66 tests across the old behavior → a superset covering the same guards
 * plus the six required resolution cases.
 */

import {
  calculateAcrOpportunity,
  AUTOMATION_MATURITY_MODIFIERS,
} from '../src/lib/analysis/calculator';
import {
  REALIZATION_FACTORS,
  RISK_BUFFERS,
  AUTOMATION_MATURITY_MODIFIERS as MATURITY,
  canDriveRevenueMath,
  guardIncrementalFirstPurchases,
  guardProjectedRpr,
  guardAdditionalRepeatBuyers,
  DATA_COLLECTION_ASSUMPTIONS,
} from '../src/lib/analysis/model-rules';
import {
  getBenchmark,
  selectVerifiedIndustryAov,
  selectConversionBenchmark,
  selectRetentionBenchmark,
} from '../src/lib/analysis/benchmarks';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}
function approx(a: number, b: number, eps = 0.5) {
  return Math.abs(a - b) <= eps;
}

// ---------------------------------------------------------------------------
// Case 1: Apparel with observed buyers + observed RPR.
// AOV = BMK-043 (verified category). CVR = BMK-001 fallback (not observable).
// No quiz → no conversion path; retention via observed population.
// ---------------------------------------------------------------------------
function case1() {
  console.log('\n[Case 1] Apparel — observed buyers/RPR, category AOV, no quiz');

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
  // Baseline CVR: BMK-001 = 0.0266 [BMK fallback]
  // Conversion path: hasQuiz=false → participation INSUFFICIENT → null
  // Retention: gap = 0.282 − 0.18 = 0.102
  //   conservative eff = 0.25 → projected = 0.2055
  //     additional = 800 × 0.0255 = 20.4 → units = 20 → raw = 20.4 × 89.17 = 1819.07
  //     realized = round(1819.07 × 0.25) = 455
  //   base eff = 0.50 → additional = 40.8 → units 41 → raw 3638.14 → realized 1819
  //   upside eff = 0.75 → additional = 61.2 → units 61 → raw 5457.20 → realized 4093
  // Combined base = round(1819 × 0.9) = 1637

  check('sufficiency SUFFICIENT (all required inputs resolved; absent collection is an observed property, not missing evidence)', m.sufficiency.status === 'SUFFICIENT', `got ${m.sufficiency.status}`);
  check('industry classified as apparel', m.inputs.industry === 'apparel');
  check('AOV basis is BMK (verified category benchmark)', m.inputs.aov.basis === 'BMK' && m.inputs.aov.benchmarkId === 'BMK-043', `got ${m.inputs.aov.basis}/${m.inputs.aov.benchmarkId}`);
  check('AOV value = 89.17', m.inputs.aov.value === 89.17);
  check('AOV did NOT need the BMK-041 fallback', m.inputs.aov.benchmarkId !== 'BMK-041');
  check('baseline CVR resolved from validated benchmark [BMK]', m.inputs.conversionRate.basis === 'BMK', `got ${m.inputs.conversionRate.basis}`);
  check('baseline CVR value = 0.0266 (BMK-001)', m.inputs.conversionRate.value === 0.0266 && m.inputs.conversionRate.benchmarkId === 'BMK-001');
  check('conversion path INSUFFICIENT (no collection mechanism)', m.conversion.base.incrementalUnits === null && m.conversion.base.basis === 'INSUFFICIENT_DATA');
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
// Case 2: Beauty with observed AOV + observed buyers; quiz present.
// Collection path runs on documented ASM bands; completion from BMK-074.
// ---------------------------------------------------------------------------
function case2() {
  console.log('\n[Case 2] Beauty — observed AOV/RPR/buyers, quiz present (ASM funnel)');
  const observedAov = 54.0;
  const observedBuyers = 2400;
  const observedRpr = 0.22;
  const traffic = 120_000;
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
    traffic,
    { userType: 'owner', automationMaturity: maturity }
  );

  // --- Hand computation ---
  // Conversion (ASM bands: participation 3/5/8%, purchase 8/12/18%;
  // completion = 0.65 [BMK-074]; CVR = BMK-002 0.0539 [BMK fallback]):
  //   base: participants = 120000 × 0.05 = 6000
  //     completions = 6000 × 0.65 = 3900
  //     purchases = 3900 × 0.12 = 468
  //     baselineSegment = 6000 × 0.0539 = 323.4
  //     incremental = MIN(468 − 323.4, 6000) = 144.6 → units 145
  //     raw = 144.6 × 54 = 7808.4 → base eff = 0.5×1.2 = 0.6 → realized 4685
  // Retention: customersEntering = 2400 + 145 (quiz incremental) = 2545;
  // maturity none → eff ×1.2; gap = 0.29 − 0.22 = 0.07 (BMK-017 beauty/food)
  //   conservative eff = 0.30 → additional = 2545×0.021 = 53.445 → units 53
  //     raw = 53.445 × 54 = 2886.03 → realized = round(2886.03 × 0.3) = 866
  //   base eff = 0.60 → additional = 2545×0.042 = 106.89 → raw 5772.06
  //     realized = round(5772.06 × 0.6) = 3463
  //   upside eff = 0.90 → additional = 2545×0.063 = 160.335 → raw 8658.09
  //     realized = round(8658.09 × 0.9) = 7792
  // Combined base = round((4685 + 3463) × 0.9) = round(8148 × 0.9) = 7333

  check('industry classified as beauty', m.inputs.industry === 'beauty');
  check('AOV basis OBS (54.00)', m.inputs.aov.basis === 'OBS' && m.inputs.aov.value === 54);
  check('quiz completion resolved from verified BMK-074', m.inputs.quizCompletion.basis === 'BMK');
  check('participation resolves to ASM (documented band, not BMK)', m.inputs.quizParticipation.basis === 'ASM', `got ${m.inputs.quizParticipation.basis}`);
  check('purchase rate resolves to ASM (documented band, not BMK)', m.inputs.quizToPurchase.basis === 'ASM', `got ${m.inputs.quizToPurchase.basis}`);
  check('BMK-075 remains unverified and unused', getBenchmark('BMK-075')?.verification === 'unverified');
  check('ASM band values match Section 27', DATA_COLLECTION_ASSUMPTIONS.participation.base === 0.05 && DATA_COLLECTION_ASSUMPTIONS.purchase.base === 0.12);

  check('conversion path runs (base units = 145)', m.conversion.base.incrementalUnits === 145, `got ${m.conversion.base.incrementalUnits}`);
  check('conversion base realized = 4685', m.conversion.base.realizedRevenueLift === 4685, `got ${m.conversion.base.realizedRevenueLift}`);
  check('baseline subtraction applied (not raw 468×54×0.6=15163)', m.conversion.base.realizedRevenueLift !== 15163);

  check('retention conservative realized = 866', m.retention.conservative.realizedRevenueLift === 866, `got ${m.retention.conservative.realizedRevenueLift}`);
  check('retention base realized = 3463', m.retention.base.realizedRevenueLift === 3463, `got ${m.retention.base.realizedRevenueLift}`);
  check('retention upside realized = 7792', m.retention.upside.realizedRevenueLift === 7792, `got ${m.retention.upside.realizedRevenueLift}`);
  check('combined base = 7333 (round((4685+3463)×0.9))', m.combined.base?.low === 7333, `got ${m.combined.base?.low}`);
  check('primary opportunity = conversion', m.opportunity.primary === 'conversion', `got ${m.opportunity.primary}`);
}

// ---------------------------------------------------------------------------
// Case 3: No traffic → INSUFFICIENT_DATA everywhere. Zero revenue.
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
  check('missing inputs include traffic', m.sufficiency.missingInputs.some((x) => x.includes('traffic')));
  check('AOV resolves via BMK-041 fallback (verified record exists)', m.inputs.aov.basis === 'BMK' && m.inputs.aov.benchmarkId === 'BMK-041', `got ${m.inputs.aov.basis}/${m.inputs.aov.benchmarkId}`);
  check('conversion all scenarios null (no traffic, no collection)', ['conservative', 'base', 'upside'].every((k) => m.conversion[k as keyof typeof m.conversion].incrementalUnits === null));
  check('retention all scenarios null', ['conservative', 'base', 'upside'].every((k) => m.retention[k as keyof typeof m.retention].incrementalUnits === null));
  check('combined all null', ['conservative', 'base', 'upside'].every((k) => m.combined[k as keyof typeof m.combined] === null));
  check('opportunity.primary null', m.opportunity.primary === null);
  check('no fabricated industry (generic)', m.inputs.industry === 'generic');
}

// ---------------------------------------------------------------------------
// Case 4: Hard guards + benchmark integrity.
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
  check('beauty industry has NO verified category AOV (placeholder unverified)', selectVerifiedIndustryAov('beauty') === null);
  check('generic industry has NO verified category AOV (BMK-041 is fallback, not category)', selectVerifiedIndustryAov('generic') === null);
}

// ---------------------------------------------------------------------------
// Case 5: Model rules parameter integrity.
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
  check('ASM participation band = 3%/5%/8%', DATA_COLLECTION_ASSUMPTIONS.participation.conservative === 0.03 && DATA_COLLECTION_ASSUMPTIONS.participation.base === 0.05 && DATA_COLLECTION_ASSUMPTIONS.participation.upside === 0.08);
  check('ASM purchase band = 8%/12%/18%', DATA_COLLECTION_ASSUMPTIONS.purchase.conservative === 0.08 && DATA_COLLECTION_ASSUMPTIONS.purchase.base === 0.12 && DATA_COLLECTION_ASSUMPTIONS.purchase.upside === 0.18);
}

// ---------------------------------------------------------------------------
// Case 6: AOV falls back to BMK-041 for a generic business; CVR/RPR resolve
// from validated benchmarks; modelled buyer proxy drives retention.
// ---------------------------------------------------------------------------
function case6() {
  console.log('\n[Case 6] Generic brand — BMK-041 AOV fallback + benchmark CVR/RPR + buyer proxy');

  const traffic = 60_000;
  const m = calculateAcrOpportunity(
    {
      domain: 'qa-case6.example.com',
      displayName: 'QA Generic Store',
      industrySignals: ['online store shop'],
      hasQuiz: false,
    },
    traffic,
    { userType: 'prospect' }
  );

  // --- Hand computation ---
  // AOV = BMK-041 = 61.22 [BMK fallback, ASM-flagged]
  // CVR = BMK-001 = 0.0266 [BMK fallback]; RPR = BMK-015 = 0.282 [BMK fallback]
  // No quiz → conversion INSUFFICIENT. Buyer proxy = 60000 × 0.0266 = 1596
  // Retention gap = 0.282 − 0.282 = 0 → zero improvement → all lifts 0
  //   → combined null (both paths null/0 → c===null && r===0 → combined set
  //     with raw 0 → riskAdjusted(0) = 0)
  check('AOV resolved via BMK-041 fallback [BMK]', m.inputs.aov.basis === 'BMK' && m.inputs.aov.benchmarkId === 'BMK-041', `got ${m.inputs.aov.basis}/${m.inputs.aov.benchmarkId}`);
  check('AOV fallback assumption recorded', m.assumptions.some((a) => a.key === 'aovFallback'));
  check('CVR resolved from validated benchmark', m.inputs.conversionRate.basis === 'BMK' && m.inputs.conversionRate.value === 0.0266);
  check('RPR resolved from validated benchmark', m.inputs.repeatPurchaseRate.basis === 'BMK' && m.inputs.repeatPurchaseRate.value === 0.282);
  check('buyer proxy ledger present (1596 = 60000 × 0.0266)', m.evidenceLedger.some((s) => s.formula.includes('Modelled Monthly Buyers') && s.output === 1596), JSON.stringify(m.evidenceLedger.filter((s) => s.formula.includes('Modelled'))));
  check('conversion path INSUFFICIENT (no collection mechanism)', m.conversion.base.incrementalUnits === null);
  check('retention runs with proxy population (units = 0, zero gap)', m.retention.base.incrementalUnits === 0, `got ${m.retention.base.incrementalUnits}`);
  check('LTV ledger notes proxy evidence [DRV]', m.evidenceLedger.some((s) => s.evidence.includes('[DRV]') && s.evidence.includes('no observed buyer population')));
  check('sufficiency SUFFICIENT (all required inputs resolved)', m.sufficiency.status === 'SUFFICIENT', `got ${m.sufficiency.status}`);
}

// ---------------------------------------------------------------------------
// Case 7: Beauty AOV fallback (no verified category AOV) + no quiz at all →
// conversion INSUFFICIENT (collection absent), buyer proxy from CVR fallback.
// ---------------------------------------------------------------------------
function case7() {
  console.log('\n[Case 7] Beauty without quiz — BMK-041 fallback + proxy buyers');

  const traffic = 25_000;
  const m = calculateAcrOpportunity(
    {
      domain: 'qa-case7.example.com',
      displayName: 'QA Beauty Basic',
      industrySignals: ['beauty cosmetics store'],
      hasQuiz: false,
    },
    traffic,
    { userType: 'owner' }
  );

  // AOV: beauty has NO verified category AOV → BMK-041 fallback = 61.22.
  // CVR: beauty → BMK-002 = 0.0539 [BMK]. RPR: beauty → BMK-017 = 0.29.
  // Proxy = 25000 × 0.0539 = 1347 (rounded). Gap = 0.29 − 0.29 = 0.
  check('AOV falls back to BMK-041 (beauty placeholder unverified)', m.inputs.aov.benchmarkId === 'BMK-041' && m.inputs.aov.value === 61.22, `got ${m.inputs.aov.benchmarkId}`);
  check('CVR uses beauty category benchmark BMK-002 (5.39%)', m.inputs.conversionRate.benchmarkId === 'BMK-002' && m.inputs.conversionRate.value === 0.0539);
  check('RPR uses consumable benchmark BMK-017 (29%)', m.inputs.repeatPurchaseRate.benchmarkId === 'BMK-017' && m.inputs.repeatPurchaseRate.value === 0.29);
  check('buyer proxy = 1348 (round(25000 × 0.0539))', m.evidenceLedger.some((s) => s.formula.includes('Modelled Monthly Buyers') && s.output === 1348), `got ${JSON.stringify(m.evidenceLedger.filter((s) => s.formula.includes('Modelled')))}`);
  check('collection inputs report honest absence', m.inputs.quizParticipation.basis === 'INSUFFICIENT_DATA' && m.inputs.quizToPurchase.basis === 'INSUFFICIENT_DATA');
  check('retention units = 0 (zero benchmark gap, no fabrication)', m.retention.base.incrementalUnits === 0, `got ${m.retention.base.incrementalUnits}`);
}

// ---------------------------------------------------------------------------
// Case 8: Guard-defect verification — incremental subtracts baseline buyers.
// Quiz purchases (468) minus baseline segment (323.4) → 144.6, NOT 468.
// ---------------------------------------------------------------------------
function case8() {
  console.log('\n[Case 8] Incremental subtraction guard (defect regression)');
  const m = calculateAcrOpportunity(
    {
      domain: 'qa-case8.example.com',
      displayName: 'QA Subtraction',
      industrySignals: ['skincare'],
      hasQuiz: true,
      observedAov: 100,
      observedMonthlyBuyers: 10_000,
      observedRepeatPurchaseRate: 0.1,
    },
    120_000,
    { userType: 'owner' }
  );

  // base: participants 6000, purchases 468, baseline 323.4 → 145 units.
  // Without subtraction it would be 468 units.
  check('base units = 145 (subtraction applied)', m.conversion.base.incrementalUnits === 145, `got ${m.conversion.base.incrementalUnits}`);
  check('units never exceed participants', (m.conversion.base.incrementalUnits ?? 0) <= 6000);
  // upside: participants 120000×0.08=9600, completion ×0.65=6240,
  // purchase ×0.18=1123.2, baseline 9600×0.0539=517.44 → 605.76 → 606 units.
  check('upside uses upside band (606 units)', m.conversion.upside.incrementalUnits === 606, `got ${m.conversion.upside.incrementalUnits}`);
}

case1();
case2();
case3();
case4();
case5();
case6();
case7();
case8();

console.log(`\n=== CALCULATOR TESTS: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
