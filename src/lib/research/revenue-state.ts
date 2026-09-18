/**
 * BRAIN V2B.3/V2C — Evidence Boundary State Layer
 *
 * Authoritative derivation of the three analytically distinct revenue states
 * established by the V2B audit, from ALREADY-EXISTING calculator output plus
 * the intervention DIMENSION supplied by the solution classifier (V2C: the
 * single-source deterministic classifier). This module contains NO arithmetic,
 * NO keyword classification, and NO duplicated calculator logic — it reads the
 * calculator's own results (CalculatedMetrics) and the classifier's
 * SolutionClassification and maps them to a typed state the UI and export can
 * rely on without inferring from display strings.
 *
 * State model (never collapsed):
 *   CALCULATED        — the calculator produced a defensible revenue number
 *                       (includes TRUE ZERO: a calculated $0 is still a
 *                       calculation, and must never be shown as unavailable)
 *   INSUFFICIENT_DATA — a valid calculation pathway exists for the proposed
 *                       intervention, but the evidence is insufficient
 *   NOT_SUPPORTED     — BRAIN has no validated calculation pathway for the
 *                       proposed intervention
 *
 * Derivation uses ONLY existing authoritative signals:
 *   - calculated.combined.base !== null  → a calculation exists (any value,
 *     including genuine zero)
 *   - calculated.inputs.collectionActivation !== 'none' → the calculator saw a
 *     data-collection pathway (observed or counterfactual), i.e. the pathway
 *     EXISTS and its failure is evidential, not architectural
 *   - dimension === 'RETENTION' → the retention/LTV analytical pathway exists
 *     for retention-dimension interventions (V2B audit #12–18), so their
 *     failure is evidential. A dimension alone NEVER implies pathway support:
 *     CONVERSION/ACQUISITION interventions without a collection pathway
 *     (upsells, bundles, cart recovery, CRO, SEO, paid, referral…) remain
 *     NOT_SUPPORTED. Supported-pathway knowledge lives in the calculator and
 *     here — never in the classifier.
 */

import type { CalculatedMetrics } from '../analysis/types';
import type { InterventionDimension } from '../analysis/solution-classifier';

export type RevenueState =
  | 'CALCULATED'
  | 'INSUFFICIENT_DATA'
  | 'NOT_SUPPORTED';

/** True when the calculator produced a real revenue figure (incl. true zero). */
export function isCalculatedWithMetrics(
  calculated: CalculatedMetrics,
): boolean {
  return calculated.combined.base !== null;
}

/** True when the calculator genuinely computed zero — a CALCULATED result. */
export function isTrueZero(calculated: CalculatedMetrics): boolean {
  return calculated.combined.base !== null && calculated.combined.base.low === 0;
}

/**
 * Derive the authoritative RevenueState. Consumes the SINGLE-SOURCE
 * classifier's dimension (V2C) — this module performs no intervention text
 * matching of its own. The UI must use this (or a value carried from it) —
 * never re-derive state from a formatted revenue string.
 */
export function deriveRevenueState(
  calculated: CalculatedMetrics,
  dimension: InterventionDimension = 'UNKNOWN',
): RevenueState {
  // A calculated figure exists — includes genuine zero (TRUE_ZERO is a
  // CALCULATED state, never "unavailable").
  if (isCalculatedWithMetrics(calculated)) return 'CALCULATED';

  // The data-collection pathway was engaged (observed mechanism or proposed
  // counterfactual): the pathway exists, so a failure is evidential.
  if (calculated.inputs.collectionActivation !== 'none') {
    return 'INSUFFICIENT_DATA';
  }

  // No data-collection pathway — but the retention/LTV analytical pathway
  // exists for retention-dimension interventions, so their failure is also
  // evidential. (Dimension ≠ pathway support: only RETENTION maps to an
  // existing analytical pathway here; CONVERSION/ACQUISITION/UNKNOWN do not.)
  if (dimension === 'RETENTION') {
    return 'INSUFFICIENT_DATA';
  }

  // No validated calculation pathway for this intervention.
  return 'NOT_SUPPORTED';
}

// ---------------------------------------------------------------------------
// User-facing explanation — analytical wording only. Never exposes ACR
// coefficients, realization factors, risk buffers, maturity modifiers,
// benchmark-selection mechanics, or internal guard implementation.
// ---------------------------------------------------------------------------

const INSUFFICIENT_DATA_BASIS = 'INSUFFICIENT_DATA';

interface MissingInput {
  basis: string;
}

const MISSING_INPUT_LABELS: Record<string, string> = {
  monthlyTraffic: 'Monthly traffic estimate',
  aov: 'Average Order Value',
  conversionRate: 'Store conversion rate',
  repeatPurchaseRate: 'Observed Repeat Purchase Rate',
};

function listMissingEvidence(calculated: CalculatedMetrics): string[] {
  const inputs = calculated.inputs as unknown as Record<
    string,
    MissingInput | undefined
  >;
  const missing: string[] = [];
  for (const key of Object.keys(MISSING_INPUT_LABELS)) {
    const input = inputs[key];
    if (input && input.basis === INSUFFICIENT_DATA_BASIS) {
      missing.push(MISSING_INPUT_LABELS[key]);
    }
  }
  return missing;
}

export interface RevenueExplanation {
  /** One-line status for the Potential Revenue Lift cell. */
  statusLine: string;
  /** Concise analytical explanation of the limitation. */
  reason: string;
  /** Business evidence that would allow the existing pathway to evaluate. */
  additionalEvidence: string | null;
  /** Why the current evidence does not establish a defensible lift. */
  why: string | null;
}

export function buildRevenueExplanation(
  state: RevenueState,
  calculated: CalculatedMetrics,
): RevenueExplanation {
  if (state === 'CALCULATED') {
    return {
      statusLine: 'Calculated',
      reason: 'A defensible revenue calculation exists for this intervention.',
      additionalEvidence: null,
      why: null,
    };
  }

  if (state === 'NOT_SUPPORTED') {
    return {
      statusLine: 'Not currently supported',
      reason:
        'BRAIN does not currently have a validated revenue calculation pathway for this intervention.',
      additionalEvidence: null,
      why: null,
    };
  }

  // INSUFFICIENT_DATA — pathway exists, evidence does not establish a lift.
  const missing = listMissingEvidence(calculated);
  const retentionBlocked =
    calculated.retention.base.basis === INSUFFICIENT_DATA_BASIS;

  // Retention-specific wording (V2B.3 §5/§6): analytical, never "enter your
  // RPR to unlock". When the owner already supplied RPR, the blocker is the
  // ceiling evidence — say so without exposing guard mechanics.
  if (retentionBlocked) {
    const rprObserved =
      calculated.inputs.repeatPurchaseRate.basis === 'OBS';
    if (!rprObserved) {
      return {
        statusLine: 'Unavailable',
        reason:
          'Insufficient evidence to establish a defensible revenue lift for this calculation pathway.',
        additionalEvidence:
          'Observed Repeat Purchase Rate is not available. Providing this first-party metric may allow BRAIN to evaluate the existing retention pathway.',
        why: 'The available benchmark evidence does not establish a defensible improvement over the current retention baseline.',
      };
    }
    return {
      statusLine: 'Unavailable',
      reason:
        'Insufficient evidence to establish a defensible revenue lift for this calculation pathway.',
      additionalEvidence: null,
      why: 'The available benchmark evidence does not establish a defensible improvement over the current retention baseline.',
    };
  }

  return {
    statusLine: 'Unavailable',
    reason:
      'Insufficient evidence to establish a defensible revenue lift for this calculation pathway.',
    additionalEvidence: missing.length > 0 ? missing.join(', ') : null,
    why: null,
  };
}

// ---------------------------------------------------------------------------
// Export payload — explicit RevenueStatus on every row. The state is never
// encoded indirectly through "$0", blank, or "N/A": those are ambiguous to a
// downstream consumer.
// ---------------------------------------------------------------------------

export const EXPORT_STATUS_CALCULATED = 'CALCULATED';
export const EXPORT_STATUS_INSUFFICIENT_DATA = 'INSUFFICIENT_DATA';
export const EXPORT_STATUS_NOT_SUPPORTED = 'NOT_SUPPORTED';

export const EXPORT_STATUS_HEADER = 'RevenueStatus';

export const EXPORT_INSUFFICIENT_DATA_CALCULATION =
  'Status: INSUFFICIENT_DATA. Reason: required evidence is not sufficient to establish a defensible revenue lift.';

export const EXPORT_NOT_SUPPORTED_CALCULATION =
  'Status: NOT_SUPPORTED. Reason: no validated revenue calculation pathway currently exists for this intervention.';
