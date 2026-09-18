# BRAIN V2D.2 — First-Party Recovery Pathway Design Audit

**Status:** COMPLETE · **Type:** Read-only research/design audit · **Production files changed:** NONE

*This audit determines whether abandoned-checkout recovery can eventually become a defensible first-party-fed ACR revenue pathway. It implements nothing. Controlling principle: do not optimize for making the calculator produce a number — optimize for making the number defensible.*

---

## 1. Executive Conclusion

**PARTIALLY_FEASIBLE.**

First-party data can realistically establish the **opportunity population** (observed monthly abandoned checkouts — Shopify exposes this directly) and **observed attributed recovery performance** (baseline recovery). What first-party data can establish *only under deliberate experimental conditions* is the **incremental recovery effect** — the counterfactual. No merchant platform reports incrementality natively; last-touch attribution is the default everywhere (Klaviyo Help Center, updated 2026-03-10: last-touch model, 5-day email click/open windows by default; Shopify: a checkout is "considered recovered after the customer completes the order" — even without clicking the recovery link).

Therefore:

- A pathway fed by **documented control/holdout experiment data** (Ladder Level 3) can produce a defensible `Potential Revenue Lift` → **CALCULATED**.
- A pathway fed only by **attributed recovery data** (Level 1) can never produce lift — it can only size the opportunity and show current recovery performance as context → **INSUFFICIENT_DATA**.
- **Nothing is implementable today from public data alone** (V2D.1: CONTEXT_ONLY), and no invented attribution discount may substitute for a measured counterfactual.

## 2. Intervention Definition

| ID | Definition | Denominator | Stage |
|---|---|---|---|
| A. Cart abandonment | Adds product(s) to cart; checkout not necessarily initiated | Carts created | Pre-checkout |
| B. Checkout initiation | Reaches/initiates checkout | Checkout sessions started | Checkout |
| C. Checkout abandonment | Initiates checkout; does not complete | Checkout sessions started | Checkout |
| D. Abandoned checkout recovery | Recovery intervention targeting C | Abandoned checkouts | Post-checkout |

**Primary pathway under audit:** C → D → recovered order. Cart abandonment (A) is a *different population with a different denominator* and must never be merged. Known stage-mixing hazards: Klaviyo abandoned-cart flows can trigger on checkout events; Shopify's native tool is checkout-stage only ("abandoned checkouts"); most public datasets (V2D.1) measure a mixed A/C population.

## 3. Existing BRAIN Architecture (read, not modified)

- **Calculator:** no recovery code. Two existing paths — Glow Curator (conversion, data-collection counterfactual) and LTV System (retention, RPR-gap). `combined.base !== null` → CALCULATED.
- **Catalog:** incidence benchmarks only — BMK-006 (Baymard 70.19%), BMK-007 (Triple Whale 70.22%), BMK-008 (beauty 81.71% + explicit caution against traffic × abandonment × AOV), BMK-010 (~42% "just browsing / not ready to buy" — critical non-recoverable-demand guardrail), BMK-011 (checkout length).
- **Classifier (V2C):** "abandoned checkout recovery" / "cart recovery" / "checkout recovery" → CONVERSION dimension, `activatesDataCollection: false`.
- **Revenue state (V2B.3/V2C):** CONVERSION + `collectionActivation: 'none'` → **NOT_SUPPORTED**. Today's behavior is correct: an incidence benchmark is not a recovery model.
- **First-party intake (V2B.1):** `first-party.ts` establishes the pattern this audit extends — canonical fields, reject-never-clamp validation, OBS-only labeling, engine pass-through into existing calculator resolution chains.
- **Harness:** `scripts/audit-interventions.ts` runs the real classifier + calculator per intervention.

## 4. Candidate First-Party Evidence Contract (DESIGN ONLY — not implemented)

| Field (candidate) | Measures | Denominator | Period | Merchant obtainable? | Platforms | Evidence tag | Defensible in revenue calc? | Definition ambiguity |
|---|---|---|---|---|---|---|---|---|
| `observedMonthlyCheckoutInitiations` | Checkout sessions started | Checkout sessions | Stated month | Yes — Shopify Analytics "reached checkout"; Klaviyo Active-on-checkout events | Shopify, Klaviyo | **OBS** | Yes — population sizing | Sessions vs unique shoppers; cross-device duplicates |
| `observedMonthlyCompletedCheckouts` | Orders completed | Checkout sessions | Same month | Yes — Shopify orders | Shopify | **OBS** | Yes — with initiations, defines abandonment | Order vs checkout-session identity |
| `observedMonthlyAbandonedCheckouts` | Checkouts started, not completed | Checkout sessions | Same month | Yes — Shopify Orders → Abandoned checkouts (3-month retention) | Shopify | **OBS** (preferred) / **DRV** (= initiations − completed, only if same period+definition) | Yes — opportunity population | Shopify list is email-captured sessions only → may undercount; server-retention limits history |
| `observedMonthlyRecoveredOrders` | Orders attributed to recovery activity | Abandoned checkouts (usually unstated) | Same month | Partially — Shopify recovery status; Klaviyo flow placed-order metrics | Shopify, Klaviyo, Omnisend | **OBS (attributed)** — never incremental by itself | **No** — context/baseline only (Ladder L1) | "Recovered" ≠ clicked-link recovery (Shopify); Klaviyo attribution is last-touch within window |
| `observedRecoveryAov` | Avg order value of recovered orders | Recovered orders | Same month | Yes — Shopify abandoned-checkouts report AOV; Klaviyo RPR ÷ orders derivable | Shopify | **OBS** | Yes — as the AOV input | Attribution method defines which orders are "recovered" |
| `observedRecoveryAttributionWindow` | Platform attribution lookback | — | Setting | Yes — account settings; **must be captured, not assumed** | Klaviyo (5-day default, configurable), Shopify (recovery-status logic) | **OBS** (setting) | Mandatory metadata — without it recovery evidence is uninterpretable | Klaviyo recalculates history when settings change |
| `recoveryInterventionActive` | Whether recovery activity exists today | — | Current | Yes — merchant declaration + platform evidence | Any | **OBS** | Yes — determines baseline vs improvement framing | Self-reported; needs platform corroboration where possible |
| `recoveryChannel` | Email / SMS / WhatsApp / retargeting / manual / mixed | — | Current | Yes | Any | **OBS** | Context; channel affects comparability | Multi-channel overlap |
| `controlGroupAvailable` | Whether a holdout/A-B measurement exists | — | Experiment period | Only if merchant ran (or will run) an experiment | **Not natively available from Shopify or Klaviyo flows** | **OBS** | Yes — gate for incrementality | Randomization quality varies |
| `observedIncrementalRecoveredOrders` | Orders recovered *above control* | Experiment population | Experiment window | Only via documented experiment | Custom measurement | **OBS** | **Yes — the only direct lift quantity** | Experiment documentation quality |
| `observedIncrementalRecoveryRate` | Treatment rate − control rate | Abandoned checkouts (both arms) | Experiment window | Only via documented experiment | Custom measurement | **OBS** / **DRV** (derived from two OBS arms) | **Yes — preferred lift quantity** | Arm-equivalence assumptions |

## 5. Evidence Classification

| Level | Evidence example | Establishes | Cannot establish | Revenue-calculation verdict |
|---|---|---|---|---|
| **L0** — abandoned population only | 1,000 abandoned checkouts/mo | Opportunity population | Recovery effectiveness; any lift | **INSUFFICIENT_DATA** (context: population sizing) |
| **L1** — attributed recovery | 1,000 abandoned; 80 attributed to existing flow | Observed attributed recovery = *current recovery performance* | Incrementality — some/many of the 80 would have purchased anyway | **INSUFFICIENT_DATA for lift; usable as baseline-recovery context.** Explicit reason: platform attribution is last-touch within a window and over-credits on high-intent audiences (Klaviyo attribution model, 2026; Shopify recovery-status definition). No measured counterfactual exists, and no defensible discount percentage exists to convert attributed → incremental. |
| **L2** — pre/post observation | 20 recovered/mo → 50 recovered/mo after change | Directionally suggestive change | Causality (seasonality, traffic mix, offer changes, concurrent marketing, flow changes, window changes) | **INSUFFICIENT_DATA for lift**, usable as supporting context **only under documented stability conditions** (§6.3). Never alone. |
| **L3** — control / holdout / A-B | Treatment vs withheld recovery, same population + window | **Observed incremental recovery rate / orders** — a true counterfactual | — (residual risk = experiment quality) | **CALCULATED-qualifying** when documented (§13) |

## 6. Counterfactual / Incrementality Ladder

### 6.1 Required conceptual chain (validated)

```
Eligible abandoned checkouts          [OBS, monthly, defined stage C]
      ↓
Observed baseline recovery            [control-arm rate (new intervention) or
                                       existing-flow attributed rate (improvement framing)]
      ↓
Incremental recovery effect (Δ)       [OBS from documented L3 experiment ONLY]
      ↓
Incremental recovered orders          = Eligible × Δ      [calculator]
      ↓
Recovery AOV                          [OBS recovery-specific > OBS general > BMK fallback]
      ↓
Potential revenue lift                = Incremental orders × AOV, risk-treated
      ↓
CalculatedMetrics → Gemini interpretation
```

### 6.2 Step-by-step establishability

| Step | How established | Failure mode |
|---|---|---|
| Eligible population | Shopify abandoned-checkouts count for the stated month | Email-captured-only undercount; period mismatch |
| Baseline recovery | L3 control arm (new-intervention framing) or existing attributed recovery rate (improvement framing, labelled ATTRIBUTED) | Using attributed rate as if incremental |
| Δ effect | Documented experiment: treatment − control recovery rate, same population/window | Undocumented or unrepresentative experiment |
| Incremental orders | Calculator arithmetic | — |
| Recovery AOV | §9 hierarchy | Using general AOV when recovery AOV known |
| Risk treatment | MODEL RULES buffers (conceptual extension; unchanged) | Double-haircutting or none |

### 6.3 L2 pre/post acceptance conditions (if ever used as supporting context)

All must hold and be documented: comparable abandoned population (±defined tolerance); no seasonal overlay (period-aligned); stable traffic mix and source composition; unchanged offer/pricing/product; unchanged attribution window; no concurrent marketing launches; unchanged recovery-channel mix; consistent measurement window. Pre/post **alone** never qualifies for CALCULATED.

### 6.4 Forbidden moves

- No invented attribution discount ("assume 50% are incremental") — **no verified source exists for any such percentage**; inventing one would be an ASM conversion factor fabricated to make the pathway calculate.
- Attributed orders never silently relabelled incremental.
- Platform benchmark ranges (Klaviyo 3.33% flow conversion etc.) never used as a recovery rate with an abandoned-checkout denominator (denominator mismatch, V2D.1).

---

## 7. Existing Recovery Activity Analysis

| Scenario | What recovery data means | Lift evidence required | Baseline treatment |
|---|---|---|---|
| **No recovery activity exists** (`recoveryInterventionActive = false`); proposal = "implement" | Nothing — no baseline | L3 experiment measuring the new intervention's effect (treatment vs withheld) | Existing natural completion rate of abandoned checkouts is the baseline; platform-context ranges (V2D.1) may appear as context only |
| **Recovery already exists**; proposal = "improve" | Existing recovered orders are **current recovery performance** — part of the current baseline | Evidence of *incremental improvement*: A-B flow test (new flow vs existing), documented experiment on the improvement, or measured before/after under §6.3 stability conditions | Existing attributed recovery is NOT new revenue; it must never be re-counted as lift |
| **Recovery exists but merchant doesn't say so** | Detected via intake question + platform signals (quiz/recovery field on site is out of scope; platform evidence is merchant-supplied) | Same as "improve" | Risk of double-count if misdeclared — intake must ask directly |

**Mandatory distinction:** CURRENT RECOVERY PERFORMANCE (attributed, OBS) ≠ POTENTIAL INCREMENTAL IMPACT OF THE PROPOSED SOLUTION (requires counterfactual).

## 8. Attribution Analysis

**Why the window matters:** the same recovery evidence yields different recovery counts under different windows; comparability across platforms and across time breaks without a stated window.

| Window | Effect on measured recovery | Comparability consequence |
|---|---|---|
| 1 day | Minimal — captures near-immediate returns | Most conservative; most defensible against overlap with natural purchase behavior |
| 3 days | Moderate | |
| 5 days | Klaviyo default (email click/open) | Cross-platform comparisons fail if window differs |
| 7 days | Common ad-platform default | Overlaps more natural-purchase traffic |
| 14 days | Generous — high over-credit risk | Recovery count inflated by would-buy-anyway orders |

**Platform reality (documented):** Klaviyo — cooperative multi-channel last-touch model; default 5-day email click/open lookback; **account-configurable and recalculated retroactively** when settings change (Klaviyo Help Center, updated 2026-03-10). Shopify — recovery status: "after an email is sent, the checkout is considered recovered after the customer completes the order", with or without clicking the recovery link (Shopify Help, abandoned-checkout automation docs, 2026) — i.e., platform "recovered" is a **send-then-complete** definition, not even click-based.

**Rule for the future pathway:** the attribution window is **mandatory metadata**. If the window is unknown or unstated, recovery evidence is uninterpretable → treat as **INSUFFICIENT_DATA**, never silently accepted. If windows differ between the two arms of an experiment, the experiment is invalid as counterfactual evidence.

## 9. AOV Analysis

**Recovery-specific AOV vs general store AOV:** recovered baskets skew larger than store average (Omnisend 2025: recovered-order AOV $168; read directly) — so using general AOV would misstate recovery revenue whenever recovery AOV is actually observed.

Proposed resolution hierarchy (documentation only):

1. **Observed recovery-specific AOV** [OBS] — preferred, always wins when directly observed.
2. **Observed general first-party AOV** [OBS] — acceptable fallback; flag the substitution as a limitation.
3. **Verified category benchmark AOV** [BMK] — existing BMK-041-style fallback chain; flag prominently.
4. **No AOV** → **INSUFFICIENT_DATA** (existing P4 rule — no revenue math without AOV).

## 10. Double-Counting Analysis

| Interaction | Risk | Required treatment in a future pathway |
|---|---|---|
| Baseline store CVR / buyers | Recovery orders are a subset of store orders; adding full recovery revenue on top of baseline revenue double-counts | Lift = **incremental** recovered orders only (Δ-based), never attributed totals |
| Glow Curator path | A recovered customer may be counted again as an incremental collection-funnel buyer | Keep paths population-disjoint or subtract overlap; document exclusivity rule |
| LTV System (retention) | A recovered order can also enter the retention/RPR population as a buyer | Same population-disjointness rule; define entry order of precedence |
| Repeat purchases | A recovered first order may later produce repeat purchases counted by the retention path | Same as above; never count the same order in both paths |
| Email marketing / SMS flows | Klaviyo last-touch attribution may credit a *newsletter* message for an order the recovery flow influenced (or vice versa) — channel-level attribution overlap | Recovery lift must come from experiment Δ, not from channel-attributed totals; document window/model per source |
| Retargeting | Ad-platform view/click attribution overlaps recovery windows entirely | Retargeting-attributed revenue is out of scope for this pathway; exclusivity noted |
| Upsells / cross-sells / bundles / other conversion interventions | A recovered order may include upsell attachments counted by those interventions' future pathways | Per-order exclusivity: one order belongs to exactly one intervention's incremental count |

**Core principle:** the pathway represents **incremental recovered orders attributable to the proposed intervention**, and the calculator must enforce population exclusivity across pathways.

## 11. Platform Data Feasibility

| Platform | Abandoned-checkout population | Recovered orders | Attribution window visible? | Control/holdout possible? | Incremental recovery measurable? | Attributed vs incremental |
|---|---|---|---|---|---|---|
| **Shopify** (native) | Yes — Orders → Abandoned checkouts (list, sessions/orders/CVR/AOV per flow; 3-month record retention) | Yes — Recovery status per checkout; "considered recovered after the customer completes the order" (post-email completion, not necessarily link click) | Implicit in recovery-status logic; not a configurable reporting window | Not natively — no built-in holdout for recovery emails | Only via merchant-built manual holdout | **Attributed** (send-then-complete definition over-credits) |
| **Klaviyo** | Checkout-started events can trigger flows; abandoned-checkout segment derivable | Flow-level placed orders / RPR | Yes — account attribution settings (5-day default, configurable, retroactive recalculation) | Only via flow filter splits (e.g., randomized split by customer property) — possible but merchant-built, uncommon | Only via deliberate A-B with held-back arm | **Attributed** (last-touch) |
| **Omnisend** | Abandoned-cart automation population (cart-stage language) | Conversion/recovered-order metrics reported | Platform attribution described as last-click-style; window not prominently documented in public help | No native holdout | Only via custom measurement | **Attributed** |
| **Custom/analytics layer** (merchant-built) | Yes (if instrumented) | Yes (if instrumented) | Merchant-defined | Yes — randomize at audience level | **Yes** — the only clean route | Can be made incremental |

**PLATFORM REPORTING ≠ CAUSAL/INCREMENTAL EVIDENCE.** Every mainstream platform reports attributed recovery; none reports incrementality natively. The realistic first-party incrementality route is a deliberately designed experiment (platform flow split or manual holdout) — feasible for a motivated merchant, not a passive data export.

## 12. Partial-Data Behavior

| Case | Evidence present | Revenue calculable? | Result | Missing | Context that CAN be shown |
|---|---|---|---|---|---|
| A | Abandoned-checkout count only | No | **INSUFFICIENT_DATA** | Baseline recovery + counterfactual | Population sizing ("eligible abandoned checkouts/mo") |
| B | + attributed recovered orders | No | **INSUFFICIENT_DATA** | Incrementality | Current recovery performance (labelled ATTRIBUTED) |
| C | + recovery AOV (no orders) | No | **INSUFFICIENT_DATA** | Baseline + counterfactual | Population + typical recovered-order value (context) |
| D | + known attribution window | No | **INSUFFICIENT_DATA** | Still no counterfactual | Same as B with interpretable window |
| E | Pre/post recovery data | No | **INSUFFICIENT_DATA** | Stability conditions per §6.3 rarely provable | Directional context only |
| F | Controlled treatment/control data | **Yes, if documented** | **CALCULATED** (subject to §13 threshold) | — | Full pathway |
| G | Observed incremental recovery rate backed by documented experiment | **Yes** | **CALCULATED** | — | Full pathway |

No case below F/G produces a dollar figure. Cases A–E legitimately end in INSUFFICIENT_DATA — that is BRAIN working as designed.

## 13. Proposed Revenue-State Threshold (future — not implemented)

**CALCULATED requires ALL of:**

1. `observedMonthlyAbandonedCheckouts` [OBS] with stated period and stage (checkout initiation, Definition C).
2. A **documented counterfactual experiment** (L3): treatment/control (or holdout) with (a) defined shared population, (b) identical attribution window, (c) stated measurement window, (d) both-arm recovery outcomes. `observedIncrementalRecoveryRate = treatmentRate − controlRate` with `Δ > 0`.
3. Resolvable recovery AOV (recovery-specific OBS > general OBS > BMK).
4. Known attribution window for all recovery evidence used.
5. Population-exclusivity check against other pathways (§10) passes.

**INSUFFICIENT_DATA:** any L0–L2 evidence (population, attributed recovery, pre/post) — pathway exists conceptually, evidence does not support incrementality.

**NOT_SUPPORTED remains** for proposals where no recovery evidence at all is supplied.

Explicitly rejected as thresholds: "recovered orders > 0"; any fixed attributed-recovery percentage; any assumed attribution discount. The threshold is **defensible incrementality**, nothing else.

## 14. Proposed Future Calculator Architecture (validated)

```
First-party recovery evidence (intake-validated, reject-never-clamp — first-party.ts pattern)
        ↓
Evidence normalization (periods aligned, stage verified = Definition C, window captured)
        ↓
Recovery population validation (eligibility: stage C population > 0; period consistency)
        ↓
Baseline recovery determination (control-arm rate, or existing attributed rate labelled ATTRIBUTED for improvement framing)
        ↓
Incrementality determination (documented L3 experiment → Δ rate; else INSUFFICIENT_DATA)
        ↓
Incremental recovered orders = eligible × Δ    [calculator arithmetic — sole authority]
        ↓
Recovery AOV resolution (§9 hierarchy)
        ↓
Revenue calculation (risk treatment per MODEL RULES conventions — no new factors invented)
        ↓
CalculatedMetrics (recovery as a third path alongside Glow Curator + LTV)
        ↓
Gemini interpretation (interpretation only — never manufactures Δ, never overrides INSUFFICIENT_DATA)
```

Validation notes: the chain is sound **with amendments** — stage verification (Definition C) must be explicit at normalization, and the incrementality gate must sit *before* any arithmetic. Revenue-state routing: `deriveRevenueState` gains a recovery-branch keyed on documented-incrementality presence, preserving V2B.3/V2C semantics.

## 15. Benchmark Decision

**No new benchmark.** V2D.1's conclusion stands: public recovery benchmarks are engagement-funnel context (per-recipient denominators, platform attribution), not recovery rates over abandoned-checkout populations, and no incrementality methodology exists in any of them. No new source found in V2D.2 research changes that. The Klaviyo attribution documentation (2026) and Shopify recovery-status definition are incorporated as **methodological facts** in this audit, not as benchmark records.

## 16. Final Decision

**PARTIALLY_FEASIBLE.**

- First-party data establishes: opportunity population (L0), current attributed recovery performance (L1), and — under deliberate experimental conditions — the counterfactual itself (L3).
- First-party data does **not** natively establish incrementality: no platform reports it, attributed recovery over-credits by an unknown, unmeasured margin, and no verified discount percentage exists to bridge the gap.
- Therefore a production pathway is possible **only for merchants who can supply documented control/holdout experiment data** (Cases F/G). For all other merchants the honest output is INSUFFICIENT_DATA with context — which is precisely BRAIN's evidence standard working correctly.

## 17. Exact Requirements for V2D.3 (if pursued)

1. **Intake extension** (first-party.ts pattern): the §4 candidate fields, canonical names, reject-never-clamp validation, owner-mode only; mandatory attribution-window capture; explicit `recoveryInterventionActive` question to prevent baseline double-counting.
2. **Calculator pathway** (new, separate from V2D.2 scope): third path in `calculateAcrOpportunity`, gated on documented-incrementality evidence; Δ-based arithmetic only; recovery-AOV hierarchy per §9; risk treatment consistent with existing MODEL RULES conventions; population-exclusivity enforcement with Glow Curator + LTV.
3. **Revenue-state integration:** recovery branch in `deriveRevenueState` + explanation wording for INSUFFICIENT_DATA recovery cases ("incremental effect not established — a documented experiment is required"), preserving CALCULATED / TRUE_ZERO / NOT_SUPPORTED semantics.
4. **Tests:** full ladder (L0→L3), Cases A–G, provenance ([OBS] experiment values), double-count guards, existing-suite regression (calculator 129/129, classifier 22/22, revenue-state 60/60, first-party 45/45 baselines intact).
5. **Docs/UI:** evidence-guide entry for recovery evidence + experiment documentation expectations; no proprietary mechanics exposed.
6. **Precondition:** V2D.3 should be built only if the product wants to serve experiment-capable merchants; otherwise the pathway should remain NOT_SUPPORTED and this audit stands as the boundary documentation.

## 18. Limitations

- Shopify abandoned-checkout data covers email-captured sessions and is retained ~3 months — long-run baselines may be incomplete.
- Klaviyo's attribution settings recalculate history retroactively; a merchant's reported recovery numbers may shift after settings changes — experiment windows must pin the settings.
- The audit did not independently verify Omnisend's internal window documentation (public help does not prominently state it) — flagged as an open comparability gap.
- Experiment quality (randomization, sample size, duration) is merchant-dependent; BRAIN can require documentation but cannot verify execution.
- Δ from a single experiment carries sampling error; a future pathway may need a minimum-sample heuristic (design decision deferred to V2D.3 — **no number invented here**).
- All percentages cited from platforms (Klaviyo flow conversion 3.33%, Omnisend recovered AOV $168) are context ranges with per-recipient or platform-attributed denominators — never calculator inputs.

---

**Production files changed: NONE.** (Documentation artifacts only: this file + the persisted V2D.1 record `docs/V2D1-ABANDONED-CHECKOUT-RECOVERY-EVIDENCE-AUDIT.md`.)

*Inspected: calculator.ts, model-rules.ts (via benchmark.txt sections referenced), benchmarks.ts, solution-classifier.ts, revenue-state.ts, engine.ts, first-party.ts, scripts/audit-interventions.ts, docs/V2B-CALCULATOR-AUDIT.md; Klaviyo Help Center attribution article (read directly, updated 2026-03-10), Shopify abandoned-checkout automation help + recovery-rate blog (2026), Omnisend 2025 abandoned-cart benchmarks (read directly), Klaviyo 2024 Benchmark Report (read directly, per V2D.1).*

*Unresolved evidence gaps: no verified attributed→incremental conversion factor exists anywhere (by design, none invented); native platform holdouts unavailable; Omnisend window documentation gap; single-experiment sampling error.*
