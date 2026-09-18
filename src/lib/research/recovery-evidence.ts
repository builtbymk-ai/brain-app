/**
 * BRAIN V2D.3 — First-Party Recovery Experiment Evidence (validation).
 *
 * Implements the V2D.2 audit's L3 evidence contract: a documented controlled
 * comparison over the SAME abandoned-checkout population, the SAME measurement
 * window, with a documented intervention difference and measured recovery
 * outcomes. This module performs intake validation ONLY — all arithmetic lives
 * in the calculator (the sole authority).
 *
 * Hard rules (V2D.2 §5/§6/§8/§9, V2D.3 spec):
 *  - L0 (population only) / L1 (attributed recovery) / L2 (pre-post) NEVER
 *    qualify. There is deliberately NO field for attributed recovered orders:
 *    it cannot produce lift and its presence must not imply it can.
 *  - Reject, never clamp (first-party.ts convention, MODEL RULES R7): a
 *    malformed experiment must never enter the evidence chain as a plausible
 *    number.
 *  - Population consistency is validated (§8): treatment/control arms must
 *    both exceed zero, recovered orders cannot exceed their own arm's
 *    population, and arm populations must be of the same order of magnitude
 *    (same conceptual population).
 *  - The measurement window is mandatory (§9). No default window exists.
 *  - The evidence is owner-mode only (§18): prospect mode never supplies it.
 */

import type { RecoveryExperimentEvidence } from '../analysis/types';

export interface RecoveryEvidenceError {
  field: string;
  message: string;
}

export interface RecoveryValidationResult {
  values: RecoveryExperimentEvidence | null;
  errors: RecoveryEvidenceError[];
}

/** Whether ANY recovery evidence field is present in the raw intake. */
export function hasRecoveryEvidence(raw: Record<string, unknown>): boolean {
  return [
    'recoveryAbandonedCheckouts',
    'recoveryTreatmentEligible',
    'recoveryControlEligible',
    'recoveryTreatmentRecovered',
    'recoveryControlRecovered',
    'recoveryWindowDays',
    'recoveryInterventionDifference',
    'recoveryAov',
  ].some((k) => raw[k] !== undefined && raw[k] !== null && raw[k] !== '');
}

/** Bounded numeric parse: rejects '', NaN, ±Infinity, string junk. */
function parseNumber(raw: unknown): { ok: true; value: number } | { ok: false } {
  if (typeof raw === 'number') {
    if (Number.isNaN(raw) || !Number.isFinite(raw)) return { ok: false };
    return { ok: true, value: raw };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return { ok: false };
    const n = Number(trimmed);
    if (Number.isNaN(n) || !Number.isFinite(n)) return { ok: false };
    return { ok: true, value: n };
  }
  return { ok: false };
}

const MAX_MONTHLY_CHECKOUTS = 100_000_000;
const MAX_WINDOW_DAYS = 366;
const MAX_AOV = 100_000;
/** Arm-size ratio guard: arms of the same population cannot differ wildly. */
const MAX_ARM_RATIO = 100;

/**
 * Validate raw owner-supplied recovery experiment evidence.
 * Returns `values: null` with per-field errors when the evidence is absent
 * or fails any L3 rule — an invalid experiment NEVER partially enters the
 * chain (V2D.2 §5: every listed requirement must hold together).
 */
export function validateRecoveryEvidence(
  raw: Record<string, unknown>
): RecoveryValidationResult {
  const errors: RecoveryEvidenceError[] = [];
  const num = (
    key: string,
    label: string,
    opts: { integer?: boolean; min?: number; max?: number } = {}
  ): number | null => {
    const parsed = parseNumber(raw[key]);
    if (!parsed.ok) {
      errors.push({ field: key, message: `${label} must be a valid number.` });
      return null;
    }
    const v = parsed.value;
    if (opts.integer && (!Number.isInteger(v) || v < 0)) {
      errors.push({ field: key, message: `${label} must be a whole number ≥ 0.` });
      return null;
    }
    if (opts.min !== undefined && v < opts.min) {
      errors.push({ field: key, message: `${label} must be ≥ ${opts.min}.` });
      return null;
    }
    if (opts.max !== undefined && v > opts.max) {
      errors.push({ field: key, message: `${label} must be ≤ ${opts.max}.` });
      return null;
    }
    return v;
  };

  // --- Core L3 fields (all mandatory together) ---
  const abandoned = num('recoveryAbandonedCheckouts', 'Monthly abandoned checkouts', { integer: true, min: 1, max: MAX_MONTHLY_CHECKOUTS });
  const treatmentEligible = num('recoveryTreatmentEligible', 'Treatment eligible population', { integer: true, min: 1, max: MAX_MONTHLY_CHECKOUTS });
  const controlEligible = num('recoveryControlEligible', 'Control eligible population', { integer: true, min: 1, max: MAX_MONTHLY_CHECKOUTS });
  const treatmentRecovered = num('recoveryTreatmentRecovered', 'Treatment recovered orders', { integer: true, min: 0, max: MAX_MONTHLY_CHECKOUTS });
  const controlRecovered = num('recoveryControlRecovered', 'Control recovered orders', { integer: true, min: 0, max: MAX_MONTHLY_CHECKOUTS });
  const windowDays = num('recoveryWindowDays', 'Measurement window (days)', { integer: true, min: 1, max: MAX_WINDOW_DAYS });

  const diffRaw = raw['recoveryInterventionDifference'];
  const interventionDifference =
    typeof diffRaw === 'string' && diffRaw.trim().length > 0
      ? diffRaw.trim().slice(0, 300)
      : null;
  if (interventionDifference === null) {
    errors.push({
      field: 'recoveryInterventionDifference',
      message: 'Describe what differed between treatment and control (the documented intervention).',
    });
  }

  // Optional recovery-specific AOV (V2D.2 AOV hierarchy, priority 1).
  let recoveryAov: number | undefined;
  if (raw['recoveryAov'] !== undefined && raw['recoveryAov'] !== null && raw['recoveryAov'] !== '') {
    const aov = num('recoveryAov', 'Recovery average order value', { min: 0.01, max: MAX_AOV });
    if (aov !== null) recoveryAov = aov;
  }

  // --- L3 consistency rules (V2D.2 §5/§8) ---
  const core = [abandoned, treatmentEligible, controlEligible, treatmentRecovered, controlRecovered, windowDays, interventionDifference];
  if (core.every((v) => v !== null)) {
    // Recovered orders cannot exceed their own arm's eligible population.
    if (treatmentRecovered! > treatmentEligible!) {
      errors.push({ field: 'recoveryTreatmentRecovered', message: 'Treatment recovered orders cannot exceed the treatment eligible population.' });
    }
    if (controlRecovered! > controlEligible!) {
      errors.push({ field: 'recoveryControlRecovered', message: 'Control recovered orders cannot exceed the control eligible population.' });
    }
    // Same conceptual population: wildly unequal arms are not comparable.
    const ratio = Math.max(treatmentEligible!, controlEligible!) / Math.min(treatmentEligible!, controlEligible!);
    if (ratio > MAX_ARM_RATIO) {
      errors.push({
        field: 'recoveryControlEligible',
        message: 'Treatment and control populations are not comparable (sizes differ by more than 100×) — the experiment cannot establish a defensible comparison.',
      });
    }
  }

  if (errors.length > 0 || core.some((v) => v === null)) {
    return { values: null, errors };
  }

  return {
    values: {
      monthlyAbandonedCheckouts: abandoned!,
      treatmentEligible: treatmentEligible!,
      controlEligible: controlEligible!,
      treatmentRecovered: treatmentRecovered!,
      controlRecovered: controlRecovered!,
      windowDays: windowDays!,
      interventionDifference: interventionDifference!,
      ...(recoveryAov !== undefined ? { recoveryAov } : {}),
    },
    errors: [],
  };
}
