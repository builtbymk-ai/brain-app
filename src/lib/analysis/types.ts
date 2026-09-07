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
 */

export type ScenarioKey = 'conservative' | 'base' | 'upside';

export type EvidenceBasis = 'OBS' | 'BMK' | 'ASM' | 'DRV' | 'INSUFFICIENT_DATA';

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
    replenishmentWindow: string;
  };

  conversion: Record<ScenarioKey, PathScenario>;
  retention: Record<ScenarioKey, PathScenario>;

  /** Risk-adjusted combined opportunity per scenario (USD). */
  combined: Record<ScenarioKey, { low: number; high: number } | null>;

  /** Base-scenario totals used for the workspace opportunity columns. */
  opportunity: {
    conversion: number | null;
    retention: number | null;
    primary: 'conversion' | 'retention' | null;
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
  /** Observed baseline conversion rate (fraction) if ever established. */
  observedConversionRate?: number | null;
  /** Observed repeat purchase rate (fraction) if ever established. */
  observedRepeatPurchaseRate?: number | null;
  /** Observed monthly buyers eligible for the LTV System, if established. */
  observedMonthlyBuyers?: number | null;
  /** Observed AOV (USD) if ever established. */
  observedAov?: number | null;
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
