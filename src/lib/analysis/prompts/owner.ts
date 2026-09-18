export {};

/**
 * BRAIN OWNER MODULE — MAPS diagnostic sequence.
 *
 * Appended after the shared prompt for owner-mode research. Guides the
 * Analysis Layer through: PRIMARY CONSTRAINT -> ROOT-CAUSE INTERPRETATION
 * -> SYMPTOM VS CAUSE -> PRIORITY CHANGES (max 3) -> MEASUREMENT PLAN.
 *
 * Purpose: help an owner understand what appears constrained, why the
 * evidence points there, what to investigate, what intervention to
 * consider, and how success should be measured.
 */

const OWNER_MODULE = `
--- OWNER MODULE: MAPS DIAGNOSTIC SEQUENCE ---

This is an internal decision document for the person who runs the business. Follow the diagnostic sequence below when composing bottlenecks, opportunities, summary, solutionImpact and priorityChanges.

## SEQUENCE

1. PRIMARY CONSTRAINT
   Identify the single most evidence-supported constraint across ACR (Acquisition / Conversion / Retention), using only CalculatedMetrics and observed signals. Name it plainly in business language before any technical language.

2. ROOT-CAUSE INTERPRETATION
   Explain why the evidence points there: which resolved inputs, benchmark comparisons and calculator paths support it. Use evidenceLedger to ground the explanation in what the calculator actually computed.

3. SYMPTOM VS CAUSE
   Distinguish what was observed from what it implies. A low conversion rate is an observation; weak product discovery is one possible interpretation; a hypothesis must stay a hypothesis.

4. PRIORITY CHANGES
   At most THREE items, ordered most-important-first. Each follows the MAPS chain:
   Observation -> Diagnosis -> Evidence -> Recommendation -> Expected Outcome -> Measurement.
   The expected outcome must be expressed in business terms (e.g. "a measurable first-purchase lift from the modeled data-collection pathway, sized in the calculator's Base scenario") — never as a new revenue number that does not already exist in CalculatedMetrics.

5. MEASUREMENT PLAN
   Say how the owner would know the change worked: which first-party metric to track (conversion rate, AOV, repeat purchase rate, capture rate), and what comparison would validate it. Do not turn every missing technology into a recommendation.

## ROOT-CAUSE RULE

Distinguish OBSERVED FACT from DERIVED INTERPRETATION from HYPOTHESIS. Do not present a hypothesis as established fact.

BAD: "The store's poor conversion is caused by weak product discovery."
BETTER: "The observed conversion signals are consistent with a product-discovery constraint, although session-level behavior is not directly observed."

If evidence is insufficient to diagnose a cause, say so and name the first-party data that would settle it.

## PRIORITY RULE

Priority changes must be based on evidence. Do NOT recommend:
- unrelated tools
- unnecessary redesigns
- arbitrary automation
- large implementation projects
- technology because it is fashionable

Use business/process language before technical language; explain the principle before the tool. Generic advice ("improve marketing", "optimize your website") is forbidden. Cap: THREE priority changes — this is a decision document, not an implementation checklist.`;

export function buildOwnerModule(): string {
  return OWNER_MODULE;
}
