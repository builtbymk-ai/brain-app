/**
 * BRAIN MODEL RULES — executable mathematical specification.
 *
 * This is the SINGLE SOURCE OF TRUTH for all arithmetic parameters:
 * realization factors, risk buffers, automation maturity modifiers,
 * scenario definitions and calculation guardrails.
 *
 * Nothing else (gemini.ts, owner.ts, prospect.ts, the UI) may hardcode
 * these values. The human-readable methodology reference lives in
 * src/lib/analysis/model-rules.txt — keep the two in sync conceptually.
 *
 * These are BRAIN's internal reasoning parameters. They are NOT
 * benchmarks and must never be presented as market data.
 */

import { ScenarioKey, AutomationMaturity } from './types';

// ---------------------------------------------------------------------------
// P1 — Realization factors
// ---------------------------------------------------------------------------

/**
 * The share of a measured benchmark gap that BRAIN treats as
 * potentially addressable, per scenario.
 */
export const REALIZATION_FACTORS: Record<ScenarioKey, number> = {
  conservative: 0.25,
  base: 0.5,
  upside: 0.75,
};

// ---------------------------------------------------------------------------
// P2 — Model risk buffers (independent of support contact rate)
// ---------------------------------------------------------------------------

/** Haircut applied after realization to account for model error. */
export const RISK_BUFFERS: Record<ScenarioKey, number> = {
  conservative: 0.15,
  base: 0.1,
  upside: 0.05,
};

// ---------------------------------------------------------------------------
// P3 — Automation maturity modifier (multiplier, NOT a benchmark)
// ---------------------------------------------------------------------------

/**
 * Adjusts the confidence-weighting of opportunity sizing, not the
 * size of the underlying gap. Applied to the realization factor.
 */
export const AUTOMATION_MATURITY_MODIFIERS: Record<AutomationMaturity, number> = {
  none: 1.2,
  basic: 1.0,
  mature: 0.75,
};

/** Effective realization factor = base factor × maturity modifier. */
export function effectiveRealization(
  scenario: ScenarioKey,
  maturity: AutomationMaturity
): number {
  return REALIZATION_FACTORS[scenario] * AUTOMATION_MATURITY_MODIFIERS[maturity];
}

// ---------------------------------------------------------------------------
// P4 — Data sufficiency
// ---------------------------------------------------------------------------

/** Inputs that MUST resolve before any revenue math is allowed. */
export const REQUIRED_FOR_REVENUE = ['traffic', 'aov'] as const;

// ---------------------------------------------------------------------------
// M4 — Scenario model procedure
// ---------------------------------------------------------------------------

/**
 * Scenario labels in fixed execution order.
 * 'upside' replaces the user-facing word 'Aggressive'.
 */
export const SCENARIO_ORDER: ScenarioKey[] = ['conservative', 'base', 'upside'];

// ---------------------------------------------------------------------------
// R-guards — hard mathematical guardrails
// ---------------------------------------------------------------------------

/**
 * Glow Curator incremental first purchases:
 *   1. never negative,
 *   2. never more than quiz participants (both guards applied together).
 */
export function guardIncrementalFirstPurchases(
  quizPurchases: number,
  quizParticipants: number
): number {
  return Math.max(0, Math.min(quizPurchases, quizParticipants));
}

/**
 * LTV System projected RPR: clamped to [0, 1] (i.e. 0%–100%).
 */
export function guardProjectedRpr(rpr: number): number {
  return Math.min(1, Math.max(0, rpr));
}

/**
 * Additional repeat buyers: never negative.
 */
export function guardAdditionalRepeatBuyers(value: number): number {
  return Math.max(0, value);
}

// ---------------------------------------------------------------------------
// Risk-adjustment procedure (P2 + R1)
// ---------------------------------------------------------------------------

/** Raw opportunity × (1 − risk buffer), rounded to whole dollars. */
export function riskAdjusted(value: number, scenario: ScenarioKey): number {
  return Math.round(value * (1 - RISK_BUFFERS[scenario]));
}

// ---------------------------------------------------------------------------
// M5 — Evidence traceability (R10)
// ---------------------------------------------------------------------------

/**
 * Every quantitative output must trace to at least one of:
 * [OBS] input, [BMK] benchmark with source, or a documented [ASM].
 * Unverified benchmarks are categorically excluded from revenue math.
 */
export function canDriveRevenueMath(verification: 'verified' | 'unverified'): boolean {
  return verification === 'verified';
}

// ---------------------------------------------------------------------------
// Scenario presentation labels
// ---------------------------------------------------------------------------

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  conservative: 'Conservative',
  base: 'Base',
  upside: 'Upside',
};
