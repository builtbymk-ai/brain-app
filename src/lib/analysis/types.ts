/**
 * BRAIN ACR Revenue Opportunity Model — calculated metrics contract.
 *
 * These types are produced exclusively by src/lib/analysis/calculator.ts
 * (the deterministic calculation engine) and CONSUMED by the Gemini
 * interpretation layer. Gemini never performs arithmetic: it receives
 * calculated metrics and interprets them.
 *
 * Evidence tags:
 *   [OBS] Observed   [BMK] Benchmark   [ASM] Assumption   [DRV] Derived
 *   [EST] Externally Estimated
 */

export type ScenarioKey = 'conservative' | 'base' | 'upside';

export type EvidenceBasis = 'OBS' | 'BMK' | 'ASM' | 'DRV' | 'EST' | 'INSUFFICIENT_DATA';

export type AutomationMaturity = 'none' | 'basic' | 'mature';

export type UserType = 'owner' | 'prospect';

export type IndustryKey =
  | 'beauty'
  | 'apparel'
  | 'food'
  | 'electronics'
  | 'home'
  | 'automotive'
  | 'travel'
  | 'generic';

/** One resolved model input, with full provenance. */
export interface ResolvedInput {
  /** Numeric value used by the calculator (fraction for rates). */
  value: number | null;
  /** Which evidence layer supplied the value. */
  basis: EvidenceBasis;
  /** Human-readable provenance: where the number came from. */
  provenance: string;
  /** Benchmark ID when basis === 'BMK'. */
  benchmarkId?: string;
}

/** A single scenario result for one ACR path. */
export interface PathScenario {
  /** Incremental units (purchases) after guards. Null when insufficient. */
  incrementalUnits: number | null;
  /** Raw revenue lift before realization/buffer (USD). */
  rawRevenueLift: number | null;
  /** Base realization factor × maturity modifier for this scenario. */
  effectiveRealization: number;
  /** Revenue lift after effective realization (USD). */
  realizedRevenueLift: number | null;
  /** Dominant evidence basis for this path's inputs. */
  basis: EvidenceBasis;
}

/**
 * V2D.3 — First-party abandoned-checkout recovery experiment evidence (L3).
 *
 * Canonical, validated representation of a documented controlled comparison
 * (V2D.2 audit §5–§6): treatment and control arms over the SAME abandoned-
 * checkout population, the SAME measurement window, a documented intervention
 * difference, and measured recovery outcomes. Every numeric field is OBS —
 * the merchant supplied it from their own experiment. Derived quantities
 * (rates, incremental effect) are computed by the calculator and labelled DRV.
 * This type is intake output only; all arithmetic lives in the calculator.
 */
export interface RecoveryExperimentEvidence {
  /**
   * Monthly abandoned checkouts (checkout-stage abandoners, Definition C).
   * Opportunity population context [OBS]; the experiment arms define lift.
   */
  monthlyAbandonedCheckouts: number;
  /** Abandoned checkouts in the treatment arm. [OBS] */
  treatmentEligible: number;
  /** Abandoned checkouts in the control (holdout) arm. [OBS] */
  controlEligible: number;
  /** Orders recovered in the treatment arm during the window. [OBS attributed-arm outcome] */
  treatmentRecovered: number;
  /** Orders recovered in the control arm during the window. [OBS] */
  controlRecovered: number;
  /** Experiment measurement window in days (arm-identical). [OBS setting] */
  windowDays: number;
  /** What differs between treatment and control (documented intervention). */
  interventionDifference: string;
  /**
   * Recovery-specific average order value of recovered orders (USD), when the
   * merchant can observe it. Absent = fall back to the V2D.2 AOV hierarchy
   * (general OBS AOV → verified category benchmark) resolved by the calculator.
   */
  recoveryAov?: number;
}

/** input → formula → output trace for one calculation step. */
export interface FormulaStep {
  formula: string;
  inputs: Record<string, number | string | null>;
  output: number | string | null;
  evidence: string;
}

export interface AppliedBenchmark {
  id: string;
  metric: string;
  value: string;
  source: string;
  verification: 'verified' | 'unverified';
  /** How the calculator used this record. */
  use: string;
}

export interface AppliedAssumption {
  key: string;
  /** Scenario-keyed values when the assumption is banded. */
  value: string;
  note: string;
}

export interface CalculatedMetrics {
  sufficiency: {
    status: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT_DATA';
    missingInputs: string[];
    limitations: string[];
  };

  inputs: {
    traffic: ResolvedInput;
    aov: ResolvedInput;
    conversionRate: ResolvedInput;
    quizParticipation: ResolvedInput;
    quizCompletion: ResolvedInput;
    quizToPurchase: ResolvedInput;
    repeatPurchaseRate: ResolvedInput;
    benchmarkHighRpr: ResolvedInput;
    productLifespanDays: ResolvedInput;
    automationMaturity: AutomationMaturity;
    industry: IndustryKey;
    industryBasis: string;
    replenishmentWindow: string;    /**
   * How the data-collection funnel was activated:
   *   'observed'       — existing on-site mechanism (hasQuiz === true) [OBS]
   *   'counterfactual' — created by the proposed solution (hasQuiz === false,
   *                      solutionActivatesDataCollection === true)
   *   'none'           — no mechanism observed or proposed
   */
  collectionActivation: 'observed' | 'counterfactual' | 'none';
    /**
     * V2D.3 — recovery-path activation state:
     *   'experiment' — documented L3 treatment/control evidence supplied [OBS]
     *   'none'       — no experiment (attributed recovery / population only /
     *                  nothing) → recovery is INSUFFICIENT_DATA or NOT_SUPPORTED
     */
    recoveryActivation: 'experiment' | 'none';
    /** V2D.3 — resolved recovery AOV, after the V2D.2 hierarchy. */
    recoveryAov: ResolvedInput;
    /** V2D.3 — the mandatory experiment measurement window (days). */
    recoveryWindowDays: ResolvedInput;
  };

  conversion: Record<ScenarioKey, PathScenario>;
  retention: Record<ScenarioKey, PathScenario>;

  /**
   * V2D.3 — Abandoned-checkout recovery path (first-party L3 experiment).
   * Populated only when documented treatment/control evidence exists.
   * Null scenarios = INSUFFICIENT_DATA for this path.
   */
  recovery: Record<ScenarioKey, PathScenario>;

  /** Risk-adjusted combined opportunity per scenario (USD). */
  combined: Record<ScenarioKey, { low: number; high: number } | null>;

  /** Base-scenario totals used for the workspace opportunity columns. */
  opportunity: {
    conversion: number | null;
    retention: number | null;
    recovery: number | null;
    primary: 'conversion' | 'retention' | 'recovery' | null;
  };

  /** Revenue Protection is reported separately — never deducted from opportunity. */
  revenueProtection: {
    supportContactRate: ResolvedInput;
    note: string;
  };

  assumptions: AppliedAssumption[];
  benchmarksApplied: AppliedBenchmark[];
  evidenceLedger: FormulaStep[];
  formulasApplied: string[];
  dataLimitations: string[];
}

/** Research evidence handed to the calculator. */
export interface CalculatorResearchData {
  domain: string;
  displayName: string;
  industrySignals: string[];
  hasQuiz: boolean | null;
  /**
   * Deterministic classification of the PROPOSED SOLUTION (prospect mode):
   * true when the solution explicitly creates an on-site data-collection
   * mechanism. This is a counterfactual MODEL-ACTIVATION flag — distinct
   * from `hasQuiz`, which is the OBSERVED current business state.
   * Absent (undefined) = no proposed solution or no data-collection concept.
   */
  solutionActivatesDataCollection?: boolean;
  /** Observed baseline conversion rate (fraction) if ever established. */
  observedConversionRate?: number | null;
  /** Observed repeat purchase rate (fraction) if ever established. */
  observedRepeatPurchaseRate?: number | null;
  /** Observed monthly buyers eligible for the LTV System, if established. */
  observedMonthlyBuyers?: number | null;
  /** Observed AOV (USD) if ever established. */
  observedAov?: number | null;
  /**
   * V2D.3 — documented controlled recovery experiment (L3 evidence), when the
   * merchant supplied one. Absent/null = no experiment: the recovery pathway
   * is evidentially unavailable (L0–L2 → INSUFFICIENT_DATA).
   */
  recoveryExperiment?: RecoveryExperimentEvidence | null;
}

/** Applicable benchmark records handed to the calculator (metadata preserved). */
export interface BenchmarkRecord {
  id: string;
  metric: string;
  dimension: 'ACQUISITION' | 'CONVERSION' | 'RETENTION' | 'REVENUE_PROTECTION';
  /** Numeric value the calculator may use (fraction for rates, USD for money). */
  value: number;
  /** Display form, e.g. "~2.66%". */
  displayValue: string;
  source: string;
  dataset?: string;
  period?: string;
  sampleSize?: string;
  caution?: string;
  /** Unverified records can NEVER drive quantitative revenue math. */
  verification: 'verified' | 'unverified';
}

/** Mode/user configuration for the calculator. */
export interface AnalysisConfig {
  userType: UserType;
  automationMaturity?: AutomationMaturity;
}
