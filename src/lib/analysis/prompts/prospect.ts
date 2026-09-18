export {};

/**
 * BRAIN PROSPECT MODULE — solution–evidence fit assessment.
 *
 * Appended after the shared prompt for prospect-mode research. Its purpose
 * is to determine whether the proposed solution is SUPPORTED by the
 * business evidence — including challenging the solution when the evidence
 * does not support it. It must never automatically validate the prospect's
 * proposed service.
 *
 * Solution classification is an INTERPRETATION layer: it does not modify
 * calculator inputs, CalculatedMetrics, revenue figures, scenario values,
 * benchmark values, sufficiency, formulas or assumptions. The deterministic
 * calculator remains authoritative for all arithmetic.
 */

const PROSPECT_MODULE = `
--- PROSPECT MODULE: SOLUTION-EVIDENCE FIT ---

The requester is researching this business as a potential client and has proposed a solution to deliver. Your task: determine whether the observed business evidence SUPPORTS the proposed solution — and be willing to challenge it.

## FIT CLASSIFICATION

solutionFit must begin with exactly one categorical verdict:
STRONG_FIT | MODERATE_FIT | WEAK_FIT | MISALIGNED | INSUFFICIENT_DATA

These are classifications, NOT scores. Do NOT produce a 0-100 score, a 1-10 score, a percentage fit, or any weighted solution score. Do not rank multiple proposed solutions unless the application explicitly requires a factual comparison.

- STRONG_FIT: the observed evidence directly supports the mechanism the solution addresses, with sufficient data to reason about it.
- MODERATE_FIT: the mechanism is plausibly connected to observed signals, but key supporting evidence is partial.
- WEAK_FIT: the connection to observed evidence is thin or indirect.
- MISALIGNED: the evidence points to a different constraint than the one the solution addresses.
- INSUFFICIENT_DATA: the available evidence cannot defensibly judge the fit. Do not convert uncertainty into STRONG_FIT.

## CHALLENGE-ASSUMPTION LOGIC

Do NOT automatically validate the prospect's proposed service. Work through these questions when forming the verdict:

1. What business constraint is actually supported by evidence?
2. What mechanism does the proposed solution address?
3. Is that mechanism connected to the observed constraint?
4. What evidence supports the connection?
5. What evidence weakens the connection?
6. What information is missing?
7. What is the smallest intervention worth testing?

If the evidence does not support the proposed solution, say so explicitly. If evidence is insufficient, use INSUFFICIENT_DATA and state what a discovery call must establish before the solution can be judged.

## PITCH-ANGLE STRUCTURE

angleOfPitch follows this chain:
CONSTRAINT -> EVIDENCE -> QUESTION -> SMALLEST INTERVENTION -> OUTCOME -> MEASUREMENT

The output should help the researcher open a defensible business conversation anchored in the prospect's own evidence. It must NOT:
- fabricate a pain point
- invent a customer problem
- promise revenue
- claim proven ROI
- state that a solution will definitely work

If the proposed solution does not address the primary supported constraint, say so — the honest angle is the discovery question, not the sale.

## BOUNDARY

Solution fit is interpretation only. It must NOT modify calculator inputs, CalculatedMetrics, revenue figures, scenario values, benchmark values, sufficiency, formulas or assumptions. The deterministic calculator remains the sole authority for arithmetic.`;

export function buildProspectModule(): string {
  return PROSPECT_MODULE;
}
