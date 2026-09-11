/**
 * BRAIN ACR REVENUE OPPORTUNITY MODEL — deterministic calculation engine.
 *
 * This is the authoritative calculator. ALL numerical calculations for the
 * proprietary ACR Revenue Opportunity Model happen here. Gemini receives
 * the CalculatedMetrics object and INTERPRETS it — it never performs
 * arithmetic, alters results, or changes parameters.
 *
 * Architecture (hard boundary):
 *   Research → Evidence → Benchmark Selection → ACR Calculator
 *   → Calculated Metrics → Gemini Interpretation → Mode-Specific Output
 *
 * Paths (sequential, not independent):
 *   Glow Curator → Conversion  (first purchase / customer intelligence)
 *   LTV System  → Retention    (repeat purchase / replenishment)
 *
 * Every number is traceable: input → formula → output, with evidence tags.
 * Where a required variable cannot be established, the result is
 * INSUFFICIENT_DATA — never a fabricated value (MODEL RULES P4/R7).
 */

import {
  AppliedAssumption,
  AppliedBenchmark,
  AutomationMaturity,
  BenchmarkRecord,
  CalculatedMetrics,
  CalculatorResearchData,
  EvidenceBasis,
  FormulaStep,
  IndustryKey,
  PathScenario,
  ResolvedInput,
  ScenarioKey,
} from './types';
import {
  AUTOMATION_MATURITY_MODIFIERS,
  AUTOMATION_MATURITY_MODIFIERS as MATURITY,
  canDriveRevenueMath,
  DATA_COLLECTION_ASM_NOTE,
  DATA_COLLECTION_ASSUMPTIONS,
  effectiveRealization,
  guardAdditionalRepeatBuyers,
  guardIncrementalFirstPurchases,
  guardProjectedRpr,
  riskAdjusted,
  SCENARIO_ORDER,
} from './model-rules';
import {
  AOV_BENCHMARKS,
  QUIZ_BENCHMARKS,
  getBenchmark,
  selectAovBenchmark,
  selectBenchmarkHighRpr,
  selectConversionBenchmark,
  selectRetentionBenchmark,
  selectVerifiedIndustryAov,
} from './benchmarks';
import { compact } from '../research/signals';

// ---------------------------------------------------------------------------
// Internal resolution helpers
// ---------------------------------------------------------------------------

function insufficient(name: string, reason: string): ResolvedInput {
  return {
    value: null,
    basis: 'INSUFFICIENT_DATA',
    provenance: `${name}: ${reason}`,
  };
}

function assumed(value: number, key: string, note: string): ResolvedInput {
  return { value, basis: 'ASM', provenance: `[ASM] ${key} — ${note}` };
}

function benchmarkInput(rec: BenchmarkRecord, key: string, use: string): ResolvedInput {
  return {
    value: rec.value,
    basis: 'BMK',
    provenance: `[BMK ${rec.id}] ${key} — ${use}`,
    benchmarkId: rec.id,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Classify industry from observed signals. Conservative keyword matching —
 * 'generic' means NO industry-specific benchmark is justified.
 */
function classifyIndustry(signals: string[]): { industry: IndustryKey; basis: string } {
  const text = signals.join(' ').toLowerCase();
  if (/skin|beauty|cosmetic|skincare|serum|cream|spa/.test(text)) {
    return { industry: 'beauty', basis: 'Beauty/skincare markers observed on the site [OBS]' };
  }
  if (/apparel|clothing|fashion|jewel/.test(text)) return { industry: 'apparel', basis: 'Apparel markers observed on the site [OBS]' };
  if (/food|beverage|snack|coffee|tea|supplement/.test(text)) return { industry: 'food', basis: 'Food & beverage markers observed on the site [OBS]' };
  if (/electronic|gadget|tech/.test(text)) return { industry: 'electronics', basis: 'Electronics markers observed on the site [OBS]' };
  if (/home|garden|furniture|decor/.test(text)) return { industry: 'home', basis: 'Home & garden markers observed on the site [OBS]' };
  if (/automotive|car|auto parts/.test(text)) return { industry: 'automotive', basis: 'Automotive markers observed on the site [OBS]' };
  if (/travel|luggage/.test(text)) return { industry: 'travel', basis: 'Travel markers observed on the site [OBS]' };
  return { industry: 'generic', basis: 'No reliable industry markers found — generic ecommerce benchmarks only' };
}

// ---------------------------------------------------------------------------
// Input resolution
// ---------------------------------------------------------------------------

interface ResolvedInputs {
  traffic: ResolvedInput;
  aov: ResolvedInput;
  /** True when AOV required the BMK-041 fallback basis (no verified category match). */
  aovFallbackUsed: boolean;
  conversionRate: ResolvedInput;
  quizParticipation: ResolvedInput;
  quizCompletion: ResolvedInput;
  quizToPurchase: ResolvedInput;
  repeatPurchaseRate: ResolvedInput;
  benchmarkHighRpr: ResolvedInput;
  productLifespanDays: ResolvedInput;
  replenishmentWindow: string;
  assumptions: AppliedAssumption[];
  benchmarksUsed: AppliedBenchmark[];
}

/**
 * Resolve every model input with provenance, following the approved
 * evidence hierarchy: OBS → EST → validated BMK → documented ASM → DRV.
 * Unknown required values resolve to INSUFFICIENT_DATA — never silently
 * invented (R7). Unverified records (BMK-075/076) never drive revenue math
 * or masquerade as benchmarks (R6).
 */
function resolveInputs(
  research: CalculatorResearchData,
  industry: IndustryKey
): ResolvedInputs {
  const assumptions: AppliedAssumption[] = [];
  const benchmarksUsed: AppliedBenchmark[] = [];

  // --- Traffic ---
  const traffic: ResolvedInput = insufficient('Monthly visitors', 'no reliable traffic estimate captured');
  // Traffic comes from research evidence; presence implies the engine found a display value.

  // --- AOV ---
  // Resolution hierarchy: observed → verified category-matched benchmark
  // → BMK-041 (verified DTC paid-channel median) as an explicitly labelled
  // fallback basis. The fallback keeps the verified record's identity but is
  // flagged as a modelling fallback, never as observed data (R6/R10).
  const verifiedIndustryAov = selectVerifiedIndustryAov(industry);
  const dtcMedianAov = getBenchmark('BMK-041');
  let aov: ResolvedInput;
  let aovFallbackUsed = false;
  if (research.observedAov != null) {
    aov = { value: research.observedAov, basis: 'OBS', provenance: `[OBS] AOV observed from business data` };
  } else if (verifiedIndustryAov) {
    aov = benchmarkInput(verifiedIndustryAov, 'AOV', 'verified category-matched AOV benchmark used as the AOV basis (P4)');
    benchmarksUsed.push(toApplied(verifiedIndustryAov, 'AOV basis for ACR paths (P4 category-matched)'));
  } else if (dtcMedianAov && dtcMedianAov.verification === 'verified') {
    aov = {
      value: dtcMedianAov.value,
      basis: 'BMK',
      provenance: `[BMK ${dtcMedianAov.id}] AOV — verified DTC paid-channel median used as fallback basis (no verified category AOV for ${industry}) [ASM-flagged fallback]`,
      benchmarkId: dtcMedianAov.id,
    };
    benchmarksUsed.push(toApplied(dtcMedianAov, 'AOV fallback basis (P4) — no verified category match'));
    aovFallbackUsed = true;
    assumptions.push({
      key: 'aovFallback',
      value: `$${dtcMedianAov.value.toFixed(2)} (BMK-041)`,
      note: 'No verified category AOV exists for this business — the verified DTC paid-channel median is used as an explicitly flagged fallback basis, not as observed business data.',
    });
  } else {
    aov = insufficient('AOV', 'not observed and no verified category AOV benchmark is confirmed for this business');
  }

  // --- Conversion rate ---
  // Resolution hierarchy: observed → validated benchmark (category-matched
  // where applicable, otherwise BMK-001 global ecommerce CVR). The benchmark
  // is ALWAYS labelled [BMK], never presented as observed.
  const cvrBench = selectConversionBenchmark(industry);
  const conversionRate: ResolvedInput =
    research.observedConversionRate != null
      ? { value: research.observedConversionRate, basis: 'OBS', provenance: '[OBS] Baseline conversion rate observed' }
      : cvrBench && cvrBench.verification === 'verified'
        ? benchmarkInput(cvrBench, 'Baseline conversion rate', 'validated benchmark fallback — business-specific conversion rate is not observable from public signals')
        : insufficient('Baseline conversion rate', 'no observed value and no validated benchmark available');

  // --- Quiz funnel ---
  // Activation condition (forensic-fix): the collection funnel may be modelled
  // when an on-site mechanism is OBSERVED (hasQuiz === true) OR when the
  // PROPOSED SOLUTION explicitly creates one (counterfactual activation).
  // hasQuiz and solutionActivatesDataCollection are different concepts and
  // must never be conflated: the observed state stays labelled [OBS]; the
  // counterfactual is always presented as a MODELLED opportunity.
  const collectionMechanismActive =
    research.hasQuiz === true || research.solutionActivatesDataCollection === true;

  const completionBench = QUIZ_BENCHMARKS.find((b) => b.id === 'BMK-074');
  let quizCompletion: ResolvedInput;
  if (collectionMechanismActive) {
    if (completionBench && canDriveRevenueMath(completionBench.verification)) {
      quizCompletion = benchmarkInput(completionBench, 'Quiz completion rate', 'V1 range (50/65/80) base value applied as labelled benchmark assumption');
      benchmarksUsed.push(toApplied(completionBench, 'Quiz completion rate for Glow Curator path'));
      assumptions.push({
        key: 'quizCompletion',
        value: '65% (base scenario value)',
        note: 'BENCHMARK 074 V1 range used as [ASM]-labelled benchmark assumption — not observed business data. Low/high completion scenarios are not independently configured; the single verified 65% base value applies to all scenarios.',
      });
    } else {
      quizCompletion = insufficient('Quiz completion rate', 'no verified benchmark available');
    }
  } else {
    quizCompletion = insufficient('Quiz completion rate', research.hasQuiz === false ? 'no quiz found on the site and the proposed solution does not create a data-collection mechanism' : 'quiz presence undetermined');
  }

  // On-site Data Collection participation: scenario-banded explicit [ASM]
  // (documented V1 working assumption, benchmark.txt Section 27) when a
  // collection mechanism is present — observed on the site or created by the
  // proposed solution. BMK-075 is unverified and is NEVER used or labelled as
  // a benchmark (R6).
  let quizParticipation: ResolvedInput;
  if (collectionMechanismActive) {
    const counterfactual = research.hasQuiz !== true && research.solutionActivatesDataCollection === true;
    quizParticipation = {
      value: DATA_COLLECTION_ASSUMPTIONS.participation.base,
      basis: 'ASM',
      provenance: counterfactual
        ? `[ASM] Data-collection start rate — 3%/5%/8% scenario band (base shown), documented V1 working assumption (benchmark.txt Section 27). Not a validated benchmark. COUNTERFACTUAL: applied to the collection mechanism created by the proposed solution — the business does not currently operate one [OBS hasQuiz=false].`
        : `[ASM] Data-collection start rate — 3%/5%/8% scenario band (base shown), documented V1 working assumption (benchmark.txt Section 27). Not a validated benchmark.`,
    };
    assumptions.push({
      key: 'dataCollectionParticipation',
      value: '3% / 5% / 8% (conservative / base / upside)',
      note: counterfactual
        ? `${DATA_COLLECTION_ASM_NOTE} — applied as a counterfactual to the mechanism the proposed solution would create.`
        : DATA_COLLECTION_ASM_NOTE,
    });
  } else if (research.hasQuiz === false) {
    quizParticipation = insufficient('Data-collection start rate', 'no on-site data collection mechanism was found on the site and the proposed solution does not create one');
  } else {
    quizParticipation = insufficient('Data-collection start rate', 'presence of on-site data collection undetermined');
  }

  // On-site Data Collection purchase conversion: scenario-banded explicit
  // [ASM] from the same documented source. R4 discipline preserved: purchase
  // conversion is never inferred from completion.
  let quizToPurchase: ResolvedInput;
  if (collectionMechanismActive) {
    const counterfactual = research.hasQuiz !== true && research.solutionActivatesDataCollection === true;
    quizToPurchase = {
      value: DATA_COLLECTION_ASSUMPTIONS.purchase.base,
      basis: 'ASM',
      provenance: counterfactual
        ? `[ASM] Data-collection purchase rate — 8%/12%/18% scenario band (base shown), documented V1 working assumption (benchmark.txt Section 27). Not a validated benchmark. COUNTERFACTUAL: applied to the collection mechanism created by the proposed solution.`
        : `[ASM] Data-collection purchase rate — 8%/12%/18% scenario band (base shown), documented V1 working assumption (benchmark.txt Section 27). Not a validated benchmark.`,
    };
    assumptions.push({
      key: 'dataCollectionPurchase',
      value: '8% / 12% / 18% (conservative / base / upside)',
      note: counterfactual
        ? `${DATA_COLLECTION_ASM_NOTE} — applied as a counterfactual to the mechanism the proposed solution would create.`
        : DATA_COLLECTION_ASM_NOTE,
    });
  } else {
    quizToPurchase = insufficient(
      'Data-collection purchase rate',
      research.hasQuiz === false
        ? 'no on-site data collection mechanism exists on the site and the proposed solution does not create one'
        : 'presence of on-site data collection undetermined'
    );
  }

  // --- Retention ---
  // Baseline RPR: observed → validated benchmark fallback (consumable-matched
  // BMK-017 where applicable, otherwise BMK-015). Never labelled as observed.
  const rprBench = selectRetentionBenchmark(industry);
  const repeatPurchaseRate: ResolvedInput =
    research.observedRepeatPurchaseRate != null
      ? { value: research.observedRepeatPurchaseRate, basis: 'OBS', benchmarkId: undefined, provenance: '[OBS] Repeat purchase rate observed' }
      : rprBench && rprBench.verification === 'verified'
        ? benchmarkInput(rprBench, 'Baseline repeat purchase rate', 'validated benchmark fallback — business-specific RPR is not observable from public signals')
        : insufficient('Repeat purchase rate', 'no observed value and no validated benchmark available');

  const highRprBench = selectBenchmarkHighRpr(industry);
  let benchmarkHighRpr: ResolvedInput;
  if (highRprBench && canDriveRevenueMath(highRprBench.verification)) {
    benchmarkHighRpr = benchmarkInput(highRprBench, 'Benchmark high RPR', 'verified repeat-purchase reference for the theoretical RPR-gap ceiling');
    benchmarksUsed.push(toApplied(highRprBench, 'Benchmark high RPR for the LTV System theoretical gap'));
  } else {
    benchmarkHighRpr = insufficient('Benchmark high RPR', 'no verified retention benchmark available');
  }

  // --- Product lifespan / replenishment window ---
  let productLifespanDays: ResolvedInput;
  let replenishmentWindow: string;
  if (industry === 'beauty' || industry === 'food') {
    productLifespanDays = assumed(45, 'product lifespan', 'consumable category → 45-day [ASM] → Day-50 primary replenishment window');
    replenishmentWindow = 'Day-50 primary replenishment window (30–45 day lifespan)';
  } else if (industry === 'generic') {
    productLifespanDays = insufficient('Product lifespan', 'unknown category — 45-day [ASM] applies to timing only and does not derive RPR');
    replenishmentWindow = '45-day assumption [ASM] → Day-50 pre-replenishment timing guidance only';
  } else {
    productLifespanDays = insufficient('Product lifespan', 'category-dependent; requires business data');
    replenishmentWindow = 'Category-dependent — strategic timing guidance only';
  }

  return {
    traffic,
    aov,
    aovFallbackUsed,
    conversionRate,
    quizParticipation,
    quizCompletion,
    quizToPurchase,
    repeatPurchaseRate,
    benchmarkHighRpr,
    productLifespanDays,
    replenishmentWindow,
    assumptions,
    benchmarksUsed,
  };
}

function toApplied(rec: BenchmarkRecord, use: string): AppliedBenchmark {
  return {
    id: rec.id,
    metric: rec.metric,
    value: rec.displayValue,
    source: rec.source,
    verification: rec.verification,
    use,
  };
}

// ---------------------------------------------------------------------------
// Path calculations
// ---------------------------------------------------------------------------

/**
 * Glow Curator → Conversion path.
 *
 * Baseline buyers = traffic × baseline conversion rate.
 * Quiz participants = traffic × quiz participation.
 * Quiz purchases = participants × completion × quiz-to-purchase.
 * Incremental = MAX(0, quiz purchases − participants × baseline CVR),
 *   additionally capped at quiz participants (both guards, Part 15).
 */
function calculateConversionPath(
  traffic: number,
  aov: number,
  conversionRate: ResolvedInput,
  quizParticipation: ResolvedInput,
  quizCompletion: ResolvedInput,
  quizToPurchase: ResolvedInput,
  maturity: AutomationMaturity,
  ledger: FormulaStep[],
  missing: string[]
): Record<ScenarioKey, PathScenario> {
  const result = {} as Record<ScenarioKey, PathScenario>;

  // Any unresolved critical input degrades the whole path honestly.
  const unresolved =
    conversionRate.basis === 'INSUFFICIENT_DATA' ||
    quizParticipation.basis === 'INSUFFICIENT_DATA' ||
    quizCompletion.basis === 'INSUFFICIENT_DATA' ||
    quizToPurchase.basis === 'INSUFFICIENT_DATA';

  if (unresolved) {
    for (const key of SCENARIO_ORDER) {
      missing.forEach((m) => {
        if (!ledger.some((l) => l.formula === m)) {
          ledger.push({
            formula: 'INSUFFICIENT_DATA',
            inputs: {},
            output: m,
            evidence: 'MODEL RULES P4/R7 — no fabricated values',
          });
        }
      });
      result[key] = {
        incrementalUnits: null,
        rawRevenueLift: null,
        effectiveRealization: effectiveRealization(key, maturity),
        realizedRevenueLift: null,
        basis: 'INSUFFICIENT_DATA',
      };
    }
    return result;
  }

  // Scenario-banded funnel: ASM participation/purchase use their documented
  // per-scenario values; completion stays the single verified BMK-074 value.
  // ResolvedInput values are base-scenario values; the bands come from the
  // ASM configuration so each scenario reflects its own band.
  for (const key of SCENARIO_ORDER) {
    const participation =
      quizParticipation.basis === 'ASM'
        ? DATA_COLLECTION_ASSUMPTIONS.participation[key]
        : (quizParticipation.value as number);
    const purchaseRate =
      quizToPurchase.basis === 'ASM'
        ? DATA_COLLECTION_ASSUMPTIONS.purchase[key]
        : (quizToPurchase.value as number);

    const participants = traffic * participation;
    const completions = participants * (quizCompletion.value as number);
    const quizPurchases = completions * purchaseRate;
    const baselineSegmentPurchases = participants * (conversionRate.value as number);

    if (key === 'base') {
      ledger.push({
        formula: 'Data-Collection Participants = Monthly Visitors × Start Rate',
        inputs: { traffic, participation: round2(participation), basis: quizParticipation.basis },
        output: Math.round(participants),
        evidence: `[${quizParticipation.basis}] ${quizParticipation.provenance}`,
      });
    }

    const incremental = guardIncrementalFirstPurchases(
      quizPurchases - baselineSegmentPurchases,
      participants
    );

    if (key === 'base') {
      ledger.push({
        formula: 'Incremental First Purchases = MAX(0, Collection Purchases − Participants × Baseline CVR), capped at Participants',
        inputs: { quizPurchases: Math.round(quizPurchases), baselineSegmentPurchases: Math.round(baselineSegmentPurchases), participants: Math.round(participants) },
        output: Math.round(incremental),
        evidence: 'Guards per MODEL RULES (Part 15): never negative, never more than participants',
      });
    }

    const eff = effectiveRealization(key, maturity);
    const raw = incremental * aov;
    result[key] = {
      incrementalUnits: Math.round(incremental),
      rawRevenueLift: Math.round(raw),
      effectiveRealization: round2(eff),
      realizedRevenueLift: Math.round(raw * eff),
      basis: 'DRV',
    };
  }

  return result;
}

/**
 * LTV System → Retention path.
 *
 * Customers entering = Glow Curator quiz purchases + observed monthly
 * buyers (never fabricated). Theoretical gap = benchmark high RPR −
 * baseline RPR. Projected RPR = baseline + gap × effective realization,
 * clamped to [0, 1]. Additional repeat buyers = customers entering ×
 * (projected − baseline), floored at zero.
 */
function calculateRetentionPath(
  customersEntering: number | null,
  aov: number | null,
  repeatPurchaseRate: ResolvedInput,
  benchmarkHighRpr: ResolvedInput,
  maturity: AutomationMaturity,
  ledger: FormulaStep[],
  missing: string[]
): Record<ScenarioKey, PathScenario> {
  const result = {} as Record<ScenarioKey, PathScenario>;

  const unresolved =
    customersEntering === null ||
    customersEntering <= 0 ||
    aov === null ||
    repeatPurchaseRate.basis === 'INSUFFICIENT_DATA' ||
    benchmarkHighRpr.basis === 'INSUFFICIENT_DATA';

  if (unresolved) {
    for (const key of SCENARIO_ORDER) {
      result[key] = {
        incrementalUnits: null,
        rawRevenueLift: null,
        effectiveRealization: effectiveRealization(key, maturity),
        realizedRevenueLift: null,
        basis: 'INSUFFICIENT_DATA',
      };
    }
    return result;
  }

  const baselineRpr = repeatPurchaseRate.value as number;
  const highRpr = (benchmarkHighRpr as ResolvedInput).value as number;

  // Degenerate-gap guard (forensic-audit fix): when the resolved baseline
  // already sits at or above the verified ceiling, there is no defensible
  // RPR gap to realize. Report the path honestly unavailable (MODEL RULES
  // R7) instead of a "calculated" zero that implies headroom was measured.
  if (highRpr <= baselineRpr) {
    for (const key of SCENARIO_ORDER) {
      result[key] = {
        incrementalUnits: null,
        rawRevenueLift: null,
        effectiveRealization: effectiveRealization(key, maturity),
        realizedRevenueLift: null,
        basis: 'INSUFFICIENT_DATA',
      };
    }
    return result;
  }

  ledger.push({
    formula: 'Theoretical RPR Gap = Benchmark High RPR − Baseline RPR',
    inputs: { benchmarkHighRpr: highRpr, baselineRpr },
    output: round2(highRpr - baselineRpr),
    evidence: `[${benchmarkHighRpr.basis}] ${benchmarkHighRpr.provenance}`,
  });

  for (const key of SCENARIO_ORDER) {
    const eff = effectiveRealization(key, maturity);
    const modeledImprovement = (highRpr - baselineRpr) * eff;
    const projectedRpr = guardProjectedRpr(baselineRpr + modeledImprovement);
    const additional = guardAdditionalRepeatBuyers((customersEntering as number) * (projectedRpr - baselineRpr));
    const raw = additional * (aov as number);

    ledger.push({
      formula: `Projected RPR = clamp(Baseline + Gap × ${eff.toFixed(2)}, 0, 1); Additional Buyers = Entering × (Projected − Baseline)`,
      inputs: { baselineRpr, modeledImprovement: round2(modeledImprovement), projectedRpr: round2(projectedRpr) },
      output: Math.round(additional),
      evidence: 'Guards per MODEL RULES (Part 16): RPR clamped 0–100%, buyers never negative',
    });

    result[key] = {
      incrementalUnits: Math.round(additional),
      rawRevenueLift: Math.round(raw),
      effectiveRealization: round2(eff),
      realizedRevenueLift: Math.round(raw * eff),
      basis: 'DRV',
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full ACR calculation for one business.
 * Returns a fully traceable CalculatedMetrics object. Where critical
 * inputs cannot be responsibly established, the corresponding values are
 * null and sufficiency.status reflects exactly why.
 */
export function calculateAcrOpportunity(
  research: CalculatorResearchData,
  researchTraffic: number | null,
  analysisConfig: { userType: 'owner' | 'prospect'; automationMaturity?: 'none' | 'basic' | 'mature'; trafficSource?: 'observed' | 'estimated' }
): CalculatedMetrics {
  const ledger: FormulaStep[] = [];
  const missing: string[] = [];
  const limitations: string[] = [];

  const industryInfo = classifyIndustry(research.industrySignals);
  const industry = industryInfo.industry;
  const maturity = analysisConfig.automationMaturity ?? 'basic';
  const userType = analysisConfig.userType;

  // Traffic comes from the research layer (display value already parsed).
  // trafficSource distinguishes observed (website-declared) from estimated (SimilarWeb).
  const trafficSource = analysisConfig.trafficSource ?? 'estimated';
  const trafficBasis = trafficSource === 'observed' ? 'OBS' : 'EST';
  const trafficProvenance = trafficSource === 'observed'
    ? '[OBS] Monthly traffic declared on website'
    : '[EST] Monthly traffic estimated by SimilarWeb';
  const traffic: ResolvedInput =
    researchTraffic != null && researchTraffic > 0
      ? { value: researchTraffic, basis: trafficBasis, provenance: trafficProvenance }
      : insufficient('Monthly visitors', 'no reliable traffic estimate captured');

  const resolved = resolveInputs(research, industry);

  // --- Data sufficiency (P4) ---
  // Status reflects whether the evidence for the specific pathways being
  // evaluated resolved — not merely that generic anchors exist. When the
  // collection pathway is inactive (no observed mechanism AND no proposed
  // solution creating one), its funnel inputs are the expected honest absence
  // (observed business property), not missing evidence.
  const collectionInactive =
    research.hasQuiz !== true && research.solutionActivatesDataCollection !== true;
  if (traffic.basis === 'INSUFFICIENT_DATA') missing.push('monthly traffic');
  if (resolved.aov.basis === 'INSUFFICIENT_DATA') missing.push('AOV (observed or benchmarked)');
  if (resolved.conversionRate.basis === 'INSUFFICIENT_DATA') missing.push('baseline conversion rate');
  if (
    resolved.quizParticipation.basis === 'INSUFFICIENT_DATA' &&
    !collectionInactive
  ) {
    missing.push('data-collection start rate');
  }
  if (
    resolved.quizToPurchase.basis === 'INSUFFICIENT_DATA' &&
    !collectionInactive
  )
  {
    missing.push('data-collection purchase rate');
  }

  // Revenue math requires traffic + AOV (P4). Without them, both paths
  // are INSUFFICIENT_DATA — a realization factor does not make an
  // invalid model valid.
  const revenueViable = traffic.value !== null && resolved.aov.value !== null;

  // When the revenue prerequisites themselves are missing, no pathway can
  // produce a figure — that is INSUFFICIENT_DATA regardless of how few
  // items landed in `missing` (pathway-inactive inputs are excluded above
  // as honest observed absences, not evidence gaps).
  const status: CalculatedMetrics['sufficiency']['status'] = !revenueViable && missing.length > 0
    ? 'INSUFFICIENT_DATA'
    : missing.length === 0
      ? 'SUFFICIENT'
      : missing.length <= 2
        ? 'PARTIAL'
        : 'INSUFFICIENT_DATA';

  const emptyScenario = (): Record<ScenarioKey, PathScenario> => {
    const out = {} as Record<ScenarioKey, PathScenario>;
    for (const key of SCENARIO_ORDER) {
      out[key] = {
        incrementalUnits: null,
        rawRevenueLift: null,
        effectiveRealization: round2(effectiveRealization(key, maturity)),
        realizedRevenueLift: null,
        basis: 'INSUFFICIENT_DATA',
      };
    }
    return out;
  };

  const conversion = revenueViable
    ? calculateConversionPath(
        traffic.value as number,
        resolved.aov.value as number,
        resolved.conversionRate,
        resolved.quizParticipation,
        resolved.quizCompletion,
        resolved.quizToPurchase,
        maturity,
        ledger,
        missing
      )
    : emptyScenario();

  // LTV System customer population:
  //   1. Observed monthly buyers ([OBS]) — highest priority
  //   2. Glow Curator incremental purchases when the collection path ran [DRV]
  //   3. Modelled monthly-buyer proxy = traffic × resolved baseline CVR
  //      ([DRV]) when no observed population and no collection path exist —
  //      a defensible, clearly labelled population, never fabricated.
  const observedBuyers = research.observedMonthlyBuyers ?? null;
  const quizPurchasesForLtv =
    conversion.base.incrementalUnits !== null ? conversion.base.incrementalUnits : null;
  let customersEntering: number | null;
  if (observedBuyers !== null && observedBuyers > 0) {
    customersEntering = observedBuyers + (quizPurchasesForLtv ?? 0);
  } else if (quizPurchasesForLtv !== null) {
    customersEntering = quizPurchasesForLtv;
  } else if (
    traffic.value !== null &&
    traffic.value > 0 &&
    resolved.conversionRate.value !== null
  ) {
    customersEntering = Math.round(traffic.value * resolved.conversionRate.value);
    ledger.push({
      formula: 'Modelled Monthly Buyers = Monthly Traffic × Baseline CVR (proxy population)',
      inputs: { traffic: traffic.value, baselineCvr: resolved.conversionRate.value },
      output: customersEntering,
      evidence: `[DRV] from traffic [${traffic.basis}] × CVR [${resolved.conversionRate.basis}] — no observed buyer population and no on-site data-collection path`,
    });
  } else {
    customersEntering = null;
  }

  const retention = revenueViable
    ? calculateRetentionPath(
        customersEntering,
        resolved.aov.value,
        resolved.repeatPurchaseRate,
        resolved.benchmarkHighRpr,
        maturity,
        ledger,
        missing
      )
    : emptyScenario();

  // --- Combined risk-adjusted opportunity ---
  const combined: CalculatedMetrics['combined'] = { conservative: null, base: null, upside: null };
  for (const key of SCENARIO_ORDER) {
    const c = conversion[key].realizedRevenueLift;
    const r = retention[key].realizedRevenueLift;
    if (c === null && r === null) {
      combined[key] = null;
    } else {
      const raw = (c ?? 0) + (r ?? 0);
      combined[key] = { low: riskAdjusted(raw, key), high: riskAdjusted(raw, key) };
      // low === high by design: realization + buffer already bound the
      // scenario. The export presents a single risk-adjusted figure.
    }
  }

  // --- Workspace opportunity columns (base scenario) ---
  const opportunity: CalculatedMetrics['opportunity'] = {
    conversion: conversion.base.realizedRevenueLift,
    retention: retention.base.realizedRevenueLift,
    primary: null,
  };
  if (opportunity.conversion !== null && opportunity.retention !== null) {
    opportunity.primary = opportunity.conversion >= opportunity.retention ? 'conversion' : 'retention';
  } else if (opportunity.conversion !== null) {
    opportunity.primary = 'conversion';
  } else if (opportunity.retention !== null) {
    opportunity.primary = 'retention';
  }

  // --- Revenue Protection (separate KPI, never deducted) ---
  const supportBench = getBenchmark('BMK-064');
  const supportContactRate: ResolvedInput = supportBench
    ? { value: supportBench.value, basis: 'BMK', provenance: `[BMK ${supportBench.id}] Health & Beauty support intensity — reported separately from revenue math`, benchmarkId: supportBench.id }
    : insufficient('Support contact rate', 'no verified benchmark match');

  // --- Limitations ---
  if (resolved.quizToPurchase.basis === 'ASM') {
    limitations.push(
      'Data-collection purchase conversion uses a documented scenario-band assumption (benchmark.txt Section 27), not a validated benchmark — treat the conversion opportunity as an indicative model, and verify with observed funnel data.'
    );
  }
  if (resolved.conversionRate.basis === 'BMK') {
    limitations.push('Baseline conversion rate resolved from a validated industry benchmark — replace with observed analytics data when available.');
  }
  if (resolved.repeatPurchaseRate.basis === 'BMK') {
    limitations.push('Baseline repeat-purchase rate resolved from a validated industry benchmark — replace with observed data when available.');
  }
  if (resolved.aovFallbackUsed) {
    limitations.push('AOV uses the verified DTC paid-channel median (BMK-041) as a fallback basis — no verified category AOV was available for this business.');
  }
  if (maturity === 'basic') {
    limitations.push('Automation maturity defaults to BASIC (×1.00) — specify the existing lifecycle stack for a modifier-adjusted estimate.');
  }
  if (
    research.solutionActivatesDataCollection === true &&
    research.hasQuiz !== true
  ) {
    limitations.push(
      'Potential Revenue Lift is a MODELLED opportunity: the proposed solution would create the on-site data-collection mechanism; funnel rates are documented scenario assumptions applied counterfactually — not observed funnel data.'
    );
  }

  // Provenance for how the collection funnel was activated.
  const collectionActivation: CalculatedMetrics['inputs']['collectionActivation'] =
    research.hasQuiz === true
      ? 'observed'
      : research.solutionActivatesDataCollection === true
        ? 'counterfactual'
        : 'none';

  return {
    sufficiency: {
      status,
      missingInputs: Array.from(new Set(missing)),
      limitations,
    },
    inputs: {
      traffic,
      aov: resolved.aov,
      conversionRate: resolved.conversionRate,
      quizParticipation: resolved.quizParticipation,
      quizCompletion: resolved.quizCompletion,
      quizToPurchase: resolved.quizToPurchase,
      repeatPurchaseRate: resolved.repeatPurchaseRate,
      benchmarkHighRpr: resolved.benchmarkHighRpr,
      productLifespanDays: resolved.productLifespanDays,
      automationMaturity: maturity,
      industry,
      industryBasis: industryInfo.basis,
      replenishmentWindow: resolved.replenishmentWindow,
      collectionActivation,
    },
    conversion,
    retention,
    combined,
    opportunity,
    revenueProtection: {
      supportContactRate,
      note: 'Support contact rate is a Revenue Protection KPI, reported separately. It is NOT deducted from revenue opportunity (MODEL RULES R9).',
    },
    assumptions: resolved.assumptions,
    benchmarksApplied: resolved.benchmarksUsed,
    evidenceLedger: ledger,
    formulasApplied: [
      'Glow Curator: Participants = Traffic × Participation; Purchases = Completions × Quiz-to-Purchase; Incremental = MAX(0, Purchases − Participants × Baseline CVR), capped at Participants',
      'LTV System: Gap = Benchmark High RPR − Baseline RPR; Projected RPR = clamp(Baseline + Gap × Effective Realization, 0, 1); Additional Buyers = Entering × ΔRPR (available only when a verified ceiling strictly above the baseline exists)',
      'Combined = (Conversion Lift + Retention Lift) × (1 − Risk Buffer), per scenario',
    ],
    dataLimitations: limitations,
  };
}

// Re-export for prompt-builder convenience.
export { AUTOMATION_MATURITY_MODIFIERS, MATURITY };
