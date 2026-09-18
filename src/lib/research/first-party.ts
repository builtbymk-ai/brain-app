/**
 * BRAIN V2B.1 — First-Party Evidence Intake (validation + normalization).
 *
 * Owner-mode users may supply their own verified business economics (AOV,
 * conversion rate, monthly buyers, repeat purchase rate). These values are
 * FIRST-PARTY OBSERVED data: the owner explicitly supplied them from their
 * own analytics/order history, so they carry the [OBS] evidence tag — the
 * highest tier in BRAIN's evidence hierarchy (MODEL RULES Section 32:
 * "HIGHEST: Direct business data [OBS]").
 *
 * Hard rules:
 *  - Nothing here derives a value from scraped data. Product prices are NOT
 *    AOV. SimilarWeb traffic is NOT observed traffic. Traffic ÷ X is NOT CVR.
 *    Review counts are NOT buyers. Only an explicit owner-supplied number is
 *    labelled OBS (V2B.1 §7).
 *  - Percentages arrive as human units (e.g. 2.6) and are stored as fractions
 *    (0.026) — the representation the ACR calculator consumes.
 *  - Validation REJECTS (never clamps) out-of-range or malformed input so a
 *    bad value can never silently enter the evidence chain as a plausible
 *    number (MODEL RULES R7: missing/invalid is reported, never substituted).
 *
 * The calculator is NOT modified by this task. It already resolves
 * observedAov / observedConversionRate / observedMonthlyBuyers /
 * observedRepeatPurchaseRate with OBS precedence over benchmarks; this module
 * only feeds it clean, canonical values.
 */

/** Canonical first-party economics in calculator representation. */
export interface FirstPartyEconomics {
  /** Average revenue per completed order, USD. Evidence: OBS. */
  observedAov: number;
  /** Completed purchases ÷ store sessions/visits, fraction (0–1]. Evidence: OBS. */
  observedConversionRate: number;
  /** Customers generating purchases in the stated monthly period. Evidence: OBS. */
  observedMonthlyBuyers: number;
  /** Share of the measured customer population who repurchased, fraction [0–1]. Evidence: OBS. */
  observedRepeatPurchaseRate: number;
}

/**
 * Owner-mode first-party fields exactly as validated, in the exact shape the
 * research engine hands to the calculator (CalculatorResearchData). A field
 * is absent when the owner did not supply it — absent fields fall through to
 * the calculator's existing verified-benchmark → fallback chain. A field that
 * was supplied but invalid is dropped (absent) and reported as an intake
 * error, so it can never enter the chain as a plausible wrong number.
 */
export type ValidatedFirstPartyInput = Partial<FirstPartyEconomics>;

export interface FirstPartyFieldError {
  field: 'aov' | 'conversionRate' | 'monthlyBuyers' | 'repeatPurchaseRate';
  /** Stable machine-readable code (testable, UI-displayable). */
  code:
    | 'required-number'
    | 'malformed'
    | 'not-finite'
    | 'out-of-range';
  message: string;
}

export interface FirstPartyValidationResult {
  /** Canonical values that passed validation, in calculator representation. */
  values: ValidatedFirstPartyInput;
  errors: FirstPartyFieldError[];
}

/** Bounded numeric parse: rejects '', NaN, ±Infinity, and string junk. */
function parseNumber(raw: unknown): { ok: true; value: number } | { ok: false; code: FirstPartyFieldError['code'] } {
  if (typeof raw === 'number') {
    if (Number.isNaN(raw)) return { ok: false, code: 'malformed' };
    if (!Number.isFinite(raw)) return { ok: false, code: 'not-finite' };
    return { ok: true, value: raw };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return { ok: false, code: 'required-number' };
    const n = Number(trimmed);
    if (Number.isNaN(n)) return { ok: false, code: 'malformed' };
    if (!Number.isFinite(n)) return { ok: false, code: 'not-finite' };
    return { ok: true, value: n };
  }
  if (typeof raw === 'undefined' || raw === null) return { ok: false, code: 'required-number' };
  return { ok: false, code: 'malformed' };
}

/**
 * Percent (human input) → fraction (calculator representation), rounded to
 * 6 decimal places to strip binary-division float noise (2.6/100 =
 * 0.026000000000000002 → 0.026). Rate precision beyond 0.0001% is not
 * meaningful in the ACR model.
 */
function percentToFraction(percent: number): number {
  return Math.round((percent / 100) * 1_000_000) / 1_000_000;
}

function fieldError(
  field: FirstPartyFieldError['field'],
  code: FirstPartyFieldError['code'],
  message: string
): FirstPartyFieldError {
  return { field, code, message };
}

/**
 * Validate and normalize owner-supplied first-party economics.
 *
 * Measurement-period semantics (V2B.1 §4): all four values should describe
 * the SAME recent operating period — typically the trailing 30 days — and the
 * helper text in the Owner intake states this. No period arithmetic is
 * performed here (V1/V2B scope): the values are taken as the owner declares
 * them, never re-scaled.
 *
 * Field rules (V2B.1 §3):
 *   AOV      > 0, sane upper bound 100_000   → observedAov
 *   CVR      0 < x ≤ 100 (percent)           → observedConversionRate (fraction)
 *   Buyers   ≥ 0, sane upper bound 10_000_000 → observedMonthlyBuyers
 *   RPR      0 ≤ x ≤ 100 (percent)           → observedRepeatPurchaseRate (fraction)
 *
 * Buyers accepts 0 (a business may genuinely have zero buyers in a period);
 * RPR accepts 0 (no customer repurchased). AOV/CVR reject 0 because "0
 * average order value" / "0% conversion" indicate the metric was not actually
 * measured, and a fabricated zero would corrupt the ACR model (zero ≠
 * insufficient is a protected distinction in this codebase).
 */
export function validateFirstPartyInput(
  raw: Record<string, unknown> | null | undefined
): FirstPartyValidationResult {
  const values: ValidatedFirstPartyInput = {};
  const errors: FirstPartyFieldError[] = [];

  if (!raw) return { values, errors };

  // --- AOV: average revenue per completed order (USD) ---
  if (raw.aov !== undefined && raw.aov !== null && String(raw.aov).trim() !== '') {
    const parsed = parseNumber(raw.aov);
    if (!parsed.ok) {
      errors.push(
        fieldError('aov', parsed.code === 'required-number' ? 'required-number' : parsed.code,
          'Average Order Value must be a number greater than 0 (e.g. 54.20).')
      );
    } else if (parsed.value <= 0 || parsed.value > 100_000) {
      errors.push(
        fieldError('aov', 'out-of-range', 'Average Order Value must be greater than $0 and below $100,000.')
      );
    } else {
      values.observedAov = Math.round(parsed.value * 100) / 100;
    }
  }

  // --- Conversion rate: purchases ÷ sessions, percent input → fraction ---
  if (raw.conversionRate !== undefined && raw.conversionRate !== null && String(raw.conversionRate).trim() !== '') {
    const parsed = parseNumber(raw.conversionRate);
    if (!parsed.ok) {
      errors.push(
        fieldError('conversionRate', parsed.code === 'required-number' ? 'required-number' : parsed.code,
          'Store Conversion Rate must be a number between 0 and 100 (e.g. 2.6 for 2.6%).')
      );
    } else if (parsed.value <= 0 || parsed.value > 100) {
      errors.push(
        fieldError('conversionRate', 'out-of-range', 'Store Conversion Rate must be greater than 0% and at most 100%.')
      );
    } else {
      values.observedConversionRate = percentToFraction(parsed.value);
    }
  }

  // --- Monthly buyers: distinct customers generating purchases ---
  if (raw.monthlyBuyers !== undefined && raw.monthlyBuyers !== null && String(raw.monthlyBuyers).trim() !== '') {
    const parsed = parseNumber(raw.monthlyBuyers);
    if (!parsed.ok) {
      errors.push(
        fieldError('monthlyBuyers', parsed.code === 'required-number' ? 'required-number' : parsed.code,
          'Monthly Buyers must be a whole number of customers (0 or more).')
      );
    } else if (parsed.value < 0 || parsed.value > 10_000_000) {
      errors.push(
        fieldError('monthlyBuyers', 'out-of-range', 'Monthly Buyers must be between 0 and 10,000,000.')
      );
    } else {
      // Distinct customers are whole people — never a fraction.
      values.observedMonthlyBuyers = Math.round(parsed.value);
    }
  }

  // --- Repeat purchase rate: percent input → fraction ---
  if (raw.repeatPurchaseRate !== undefined && raw.repeatPurchaseRate !== null && String(raw.repeatPurchaseRate).trim() !== '') {
    const parsed = parseNumber(raw.repeatPurchaseRate);
    if (!parsed.ok) {
      errors.push(
        fieldError('repeatPurchaseRate', parsed.code === 'required-number' ? 'required-number' : parsed.code,
          'Repeat Purchase Rate must be a number between 0 and 100 (e.g. 18 for 18%).')
      );
    } else if (parsed.value < 0 || parsed.value > 100) {
      errors.push(
        fieldError('repeatPurchaseRate', 'out-of-range', 'Repeat Purchase Rate must be between 0% and 100%.')
      );
    } else {
      values.observedRepeatPurchaseRate = percentToFraction(parsed.value);
    }
  }

  return { values, errors };
}
