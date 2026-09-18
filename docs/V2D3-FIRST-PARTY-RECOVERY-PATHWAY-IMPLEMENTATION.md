# BRAIN V2D.3 — First-Party Abandoned-Checkout Recovery Pathway Implementation

**Status:** COMPLETE · **Type:** Narrow production implementation · **Authority:** `docs/V2D2-FIRST-PARTY-RECOVERY-DESIGN-AUDIT.md`

*Record of the V2D.3 implementation (delivered 2026-09-18). Implements the V2D.2 audit's PARTIALLY_FEASIBLE decision: a first-party recovery pathway that calculates ONLY from documented controlled-comparison evidence (L3). The evidence boundary is preserved — attributed recovery is never converted into incremental revenue, no external recovery benchmark is used, and no attribution discount is invented.*

---

## 1. What Was Built

A narrowly scoped first-party abandoned-checkout recovery pathway with an L0→L3 evidence ladder:

| Level | Evidence | Outcome |
|---|---|---|
| **L0** | Abandoned-checkout population only | `INSUFFICIENT_DATA` (context: population sizing) |
| **L1** | Attributed recovery performance | `INSUFFICIENT_DATA` — the intake has **no representation** for attributed recovery, so it cannot exist as evidence; presence never implies lift |
| **L2** | Pre/post comparison | `INSUFFICIENT_DATA` — unrepresentable at intake; §6.3 stability conditions are unprovable |
| **L3** | Documented treatment/control experiment over the same population and window | **`CALCULATED`** — Δ-based arithmetic only |
| **L3 zero** | Experiment measured treatment rate ≤ control rate | **`CALCULATED` TRUE ZERO** — a measured zero is a calculation, never `Unavailable` |

The boundary was implemented structurally, not by convention: there is deliberately **no intake field** for attributed recovered orders, attributed recovery rate, or pre/post deltas. The invalid path does not exist in the type system.

## 2. Evidence Contract (intake → calculator)

Canonical validated type: `RecoveryExperimentEvidence` (`src/lib/analysis/types.ts`). Raw owner intake uses the `recovery*` field names and is validated by `validateRecoveryEvidence` (`src/lib/research/recovery-evidence.ts`):

| Canonical field | Raw intake key | Rule |
|---|---|---|
| `monthlyAbandonedCheckouts` | `recoveryAbandonedCheckouts` | integer ≥ 1, ≤ 100M — opportunity population [OBS] |
| `treatmentEligible` | `recoveryTreatmentEligible` | integer ≥ 1 [OBS] |
| `controlEligible` | `recoveryControlEligible` | integer ≥ 1 [OBS] |
| `treatmentRecovered` | `recoveryTreatmentRecovered` | integer ≥ 0, ≤ own arm population [OBS] |
| `controlRecovered` | `recoveryControlRecovered` | integer ≥ 0, ≤ own arm population [OBS] |
| `windowDays` | `recoveryWindowDays` | integer 1–366 — **mandatory, no default** (V2D.2 §8) |
| `interventionDifference` | `recoveryInterventionDifference` | non-empty string ≤ 300 chars — documented intervention |
| `recoveryAov` (optional) | `recoveryAov` | 0.01–100,000 — recovery-specific AOV [OBS] |

Hard rules preserved:
- **Reject, never clamp** (first-party.ts convention, MODEL RULES R7): malformed/out-of-range values never enter the chain as plausible numbers.
- **All-or-nothing**: any supplied-but-invalid experiment field nulls the whole evidence object with per-field errors — a partial experiment can never partially qualify.
- **Population consistency** (V2D.2 §8): recovered ≤ own arm; arm sizes within 100× of each other (same conceptual population).
- **Owner mode only** (V2D.2 §18): prospect mode never supplies or receives recovery evidence.

## 3. Calculator Pathway (unchanged authority)

`calculateRecoveryPath` in `src/lib/analysis/calculator.ts` remains the sole arithmetic authority:

```
treatmentRate = treatmentRecovered ÷ treatmentEligible   [OBS]
controlRate   = controlRecovered  ÷ controlEligible       [OBS]
Δ rate        = max(0, treatmentRate − controlRate)        [DRV — control is baseline, never lift]
incrementalOrders = round(monthlyAbandonedCheckouts × Δ)   [population × effect, floored ≥ 0]
gross         = incrementalOrders × recoveryAov
lift          = existing risk adjustment per scenario      [no new factors invented]
```

- **AOV hierarchy (V2D.2 §9)**, resolved in the calculator: recovery-specific OBS → general first-party OBS (existing resolved AOV chain) → verified category BMK (flagged "treat as indicative") → none ⇒ `INSUFFICIENT_DATA` (P4: no revenue math without AOV).
- **No external recovery benchmark**, no attribution-to-incrementality factor, no realization/buffer changes. Scenario treatment reuses the existing MODEL RULES machinery.
- **Population exclusivity (V2D.2 §10)**: recovery orders are checkout-abandoner orders — disjoint from Glow Curator baseline buyers and the LTV entering population; summed paths stay additive-safe, and the recovery path contributes only between-arm incremental orders.
- `CalculatedMetrics` gained `recovery: Record<ScenarioKey, PathScenario>`, `opportunity.recovery`, `inputs.recoveryActivation` (`'experiment' | 'none'`), `inputs.recoveryAov`, `inputs.recoveryWindowDays`, plus a `formulasApplied` entry describing the recovery shape in user-safe language.

## 4. State Routing (V2B.3 semantics preserved)

`deriveRevenueState` (`src/lib/research/revenue-state.ts`) gained two inputs, in precedence order:

1. `calculated.inputs.recoveryActivation === 'experiment'` but no figure (e.g. AOV unresolvable) → **INSUFFICIENT_DATA** (evidential).
2. Classifier flag `activatesRecoveryPathway === true` (checkout-stage recovery proposal, no experiment supplied) → **INSUFFICIENT_DATA** with recovery-specific wording — replacing the pre-V2D.3 `NOT_SUPPORTED`.

`buildRevenueExplanation` recovery wording (analytical only, no internals):
- **statusLine:** `Unavailable`
- **reason:** "Insufficient evidence to establish a defensible revenue lift for this calculation pathway."
- **additionalEvidence:** names the missing documented experiment (or the missing economics when an experiment was supplied but incomplete, e.g. Recovery Average Order Value).
- **why:** "Platform-attributed recovery orders include customers who would have purchased anyway; only a measured between-arm difference establishes a defensible incremental effect."

The single-source classifier (`solution-classifier.ts`) routes **abandoned-CHECKOUT-stage** recovery concepts only (`RECOVERY_PATTERNS`); cart-stage "cart recovery" is deliberately excluded (different population, V2D.2 §2). The flag never implies evidence exists — it only routes the state.

## 5. Data Flow (production)

```
Owner intake (ResearchWorkspace, optional "Recovery Experiment Evidence" block)
      ↓ POST /api/research  { inputs[].recovery: {...} }   — owner mode only
validateRecoveryEvidence()  — reject-never-clamp, all-or-nothing
      ↓ canonical RecoveryExperimentEvidence (raw intake never crosses this boundary)
researchBusiness({ recoveryExperiment })                 — engine
      ↓
calculateAcrOpportunity()  — sole arithmetic authority
      ↓
deriveRevenueState() + buildRevenueExplanation()         — single-source classifier flag
      ↓
Workspace / CSV / JSON export — typed state, never inferred from display strings
```

The engine's calculation trail now includes recovery resolved inputs (`Recovery AOV`, `Experiment Window`, `Monthly Abandoned Checkouts`) when the experiment was supplied, the recovery model shape when it produced units, and recovery lift in the gross/risk-adjusted totals.

## 6. UI / Export / Docs

- **Owner workspace** (`ResearchWorkspace.tsx`): nested collapsible "Recovery Experiment Evidence" section inside Business Performance Data. Copy explains the treatment/control requirement and explicitly says dashboard "recovered orders" numbers are not sufficient. Fields are labelled "Required together" (all-or-nothing contract made visible); the block is sent only when any field is filled so an empty section never trips validation.
- **Docs page** (`/docs`): new "Abandoned-checkout recovery evidence" section — attributed vs incremental, the treatment/control + window requirement, and the INSUFFICIENT_DATA behavior as the evidence standard working as designed.
- **Export** (`serialize.ts`): unchanged — recovery states flow through the existing V2B.3 `RevenueStatus` column semantics (`CALCULATED` incl. true zero / `INSUFFICIENT_DATA` / `NOT_SUPPORTED`), never encoded via `$0`/blank.

## 7. Explicitly NOT Done (scope discipline)

- No calculator formula, benchmark, realization-factor, risk-buffer, RPR-ceiling, or evidence-resolution changes beyond the new path.
- No cart-stage recovery pathway; no email/SMS/retargeting/upsell/CRO/acquisition pathways.
- No new external APIs (no Klaviyo/Shopify/Omnisend integrations), no new benchmarks, no database schema changes, no prompt changes.
- No attributed→incremental conversion factor (by design — none exists).

## 8. Files Changed

| File | Change |
|---|---|
| `src/lib/analysis/types.ts` | `RecoveryExperimentEvidence` type; `CalculatedMetrics` recovery path, inputs, opportunity |
| `src/lib/analysis/calculator.ts` | `calculateRecoveryPath` (L3-only, Δ-based); recovery AOV hierarchy; exclusivity-safe combining |
| `src/lib/analysis/solution-classifier.ts` | `activatesRecoveryPathway` flag + `RECOVERY_PATTERNS` (checkout-stage only) |
| `src/lib/research/recovery-evidence.ts` | **New** — `validateRecoveryEvidence` / `hasRecoveryEvidence` (reject-never-clamp, all-or-nothing) |
| `src/lib/research/revenue-state.ts` | Recovery branches in `deriveRevenueState` + recovery wording in `buildRevenueExplanation` |
| `src/lib/research/engine.ts` | Pass-through of validated experiment; classifier flag → state/explanation; recovery lines in the calculation trail |
| `src/app/api/research/route.ts` | Owner-mode recovery intake validation + canonical pass-through |
| `src/components/ResearchWorkspace.tsx` | Owner intake UI for the experiment evidence |
| `src/app/globals.css` | Nested performance-block styling |
| `src/app/docs/page.tsx` | Recovery evidence boundary documentation |
| `scripts/test-recovery.ts` | **New** — 55-test V2D.3 suite |
| `scripts/test-revenue-state.ts` | Case C moved to upsells + V2D.3 cross-checks (61 tests) |
| `scripts/audit-interventions.ts` | Harness consumes the recovery flag + recovery path |
| `package.json` | `test:recovery` script |

## 9. Verification (executed)

| Suite | Result |
|---|---|
| `bun run typecheck` | clean |
| `bun scripts/test-recovery.ts` | **55/55** (ladder L0–L3, true zero, AOV hierarchy, exclusivity/invariance, validation, state, export) |
| `bun scripts/test-revenue-state.ts` | **61/61** |
| `bun scripts/test-calculator.ts` | **129/129** |
| `bun scripts/test-classifier.ts` | **22/22** |
| `bun scripts/test-first-party.ts` | **45/45** |
| `bun scripts/test-export.ts` | **28/28** |
| `bun scripts/test-prompts.ts` | **32/32** |
| `bun run validate` | **24/24** |
| `bun scripts/audit-interventions.ts` | #09 abandoned checkout recovery → `INSUFFICIENT_DATA` (pathway exists, evidence absent) |

## 10. Residual Limitations (carried from V2D.2 §18)

- Δ from a single experiment carries sampling error; BRAIN requires documentation but cannot verify experiment execution quality. This is disclosed as a data limitation on every recovery calculation.
- The pathway serves experiment-capable merchants only; all other recovery proposals honestly report `INSUFFICIENT_DATA` — that is the evidence standard working as designed.
- Shopify/ Klaviyo attribution settings can retroactively recalculate history; experiment windows must pin platform settings (documented in the audit, not enforced technically).
