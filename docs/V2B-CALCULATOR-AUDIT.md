# BRAIN V2B — Calculator Sufficiency & Intervention Audit

**Status:** Read-only forensic audit. No production code modified.
**Evidence basis:** Full trace of `src/lib/analysis/*` (calculator, model-rules, benchmarks, types, solution-classifier, prompts/*), `src/lib/research/*` (engine, firecrawl, similarweb, serpapi, apollo, apify, types), `src/lib/analysis/gemini.ts`, `src/lib/analysis/openrouter.ts`, and `scripts/test-calculator.ts` (129/129 passing) + `scripts/test-prompts.ts` (32/32 passing).
**Live verification:** A read-only harness (`scripts/audit-interventions.ts`) was written that runs the **real production classifier and real production calculator** against realistic proposed-solution strings for all 23 interventions. All results below come from executing that harness against the actual code — nothing is inferred from file names.

---

## 1. Current calculation contract (as implemented)

```
User input (url, brandName, proposedSolution, userType)
    ↓
src/lib/research/engine.ts  researchBusiness()
    ├─ firecrawl scrapeWebsite()      → title, description, markdown, productCount, hasQuiz (regex), socialLinks
    ├─ apify gatherSocial()           → followerEstimate (Instagram actor)
    ├─ apollo enrichCompany()         → name, industry, employeeCount, revenueRange
    ├─ serpapi estimateSearchVisibility() → visibilityScore (share-of-first-page), relatedQueries
    ├─ similarweb estimateTrafficFromSimilarWeb() → monthlyVisits + engagement (confidence high/medium/low)
    ↓
Evidence normalization (engine.ts)
    ├─ estimateMonthlyTraffic(): 1) OBS site-declared "48K+ visitors"  → 2) SimilarWeb if confidence==='high'  → 3) 'Not found'
    ├─ parseTrafficEstimate() → number | null   (null ⇒ INSUFFICIENT_DATA downstream, never 0)
    ├─ getTrafficSource()     → 'observed' | 'estimated'
    └─ hasQuiz: website?.hasQuiz (regex over markdown: /\bquiz\b|\bq&a\b|\bsurvey\b|\bquestionnaire\b/i)
    ↓
Solution classification (engine.ts, BEFORE calculator)
    classifyProposedSolution(proposedSolution) → { activatesDataCollection: boolean, matchedPhrases }
    — pure deterministic regex; the calculator receives ONLY the boolean, never the raw text
    ↓
ACR calculator (src/lib/analysis/calculator.ts)  calculateAcrOpportunity()
    ├─ industry classification (keyword match over signals → 8 IndustryKeys, 'generic' fallback)
    ├─ input resolution with evidence hierarchy OBS → EST → verified BMK → documented ASM → DRV
    ├─ Conversion path  (Glow Curator): traffic × participation × completion × purchase − baseline segment, guards
    └─ Retention path   (LTV System):   customersEntering × (projectedRPR − baselineRPR) × AOV, degenerate-gap guard
    ↓
CalculatedMetrics  (fully assembled — the sole authority for all numbers)
    ↓
Gemini interpretation (prompts/shared.ts → gemini.ts → openrouter fallback)
    → structured JSON; hard rules forbid recalculation, new numbers, or overriding nulls
```

### 1a. What the calculator accepts and how each input is resolved

| Input | Type | Required? | Resolution (as coded) | Missing ⇒ |
|---|---|---|---|---|
| `traffic` | EST/OBS | **Required for revenue math** | Research layer: site-declared figure [OBS] → SimilarWeb high-confidence [EST] → null | Both paths INSUFFICIENT_DATA |
| `aov` | OBS/BMK | **Required for revenue math** | `observedAov` [OBS] → verified category AOV (BMK-043/044/045/046/047/048) [BMK] → BMK-041 DTC median [BMK, ASM-flagged fallback] | Both paths INSUFFICIENT_DATA |
| `conversionRate` | OBS/BMK | Conversion path only | `observedConversionRate` [OBS] → BMK-002 (beauty) or BMK-001 global [BMK] | Conversion path degraded |
| `quizParticipation` | ASM | Conversion path, **pathway-gated** | Documented ASM band 3%/5%/8% (benchmark.txt §27) — **only when collection mechanism active** | Conversion INSUFFICIENT_DATA |
| `quizCompletion` | BMK | Conversion path, pathway-gated | BMK-074 65% (verified) | Conversion INSUFFICIENT_DATA |
| `quizToPurchase` | ASM | Conversion path, pathway-gated | Documented ASM band 8%/12%/18% — pathway-gated | Conversion INSUFFICIENT_DATA |
| `repeatPurchaseRate` | OBS/BMK | Retention path | `observedRepeatPurchaseRate` [OBS] → BMK-017 (beauty/food 0.29) or BMK-015 (0.282) [BMK] | Retention INSUFFICIENT_DATA |
| `benchmarkHighRpr` | BMK | Retention path | Same record as baseline (`selectBenchmarkHighRpr` = `selectRetentionBenchmark`) | Retention INSUFFICIENT_DATA |
| `productLifespanDays` | ASM | Timing only | 45-day [ASM] for beauty/food; timing guidance only — **never drives RPR** | Never blocks math |
| `automationMaturity` | config | No | Modifier on realization (×1.2/×1.0/×0.75), default `basic` | Never blocks math |
| `industry` | DRV | No | Keyword classifier over signals; 'generic' is honest fallback | Category benchmarks unavailable |
| `observedMonthlyBuyers` | OBS | Optional | Retention population priority 1; else quiz incremental [DRV]; else traffic × CVR proxy [DRV] | Proxy used, clearly labelled |

### 1b. Pathway gating (the central architectural fact)

The conversion path only runs when a **data-collection mechanism** exists:

- `hasQuiz === true` → activation = **observed** [OBS]
- `solutionActivatesDataCollection === true` → activation = **counterfactual** (proposed solution creates the mechanism)
- otherwise → activation = **none** → conversion path is INSUFFICIENT_DATA *by design* (honest observed absence, not missing evidence)

The retention path only runs when a **verified RPR ceiling strictly above the resolved baseline** exists. Because `selectBenchmarkHighRpr()` returns the *same* record as the baseline benchmark, a benchmark-resolved baseline always produces a **degenerate gap (0.29 − 0.29 = 0)** → the guard (forensic-audit fix) reports INSUFFICIENT_DATA rather than a fabricated gap. Retention therefore **can only calculate when the baseline RPR is [OBS]erved and strictly below the single verified ceiling**.

### 1c. Pathway-dependency summary

- **Conversion-only inputs:** quizParticipation, quizCompletion, quizToPurchase (all pathway-gated), conversionRate.
- **Retention-only inputs:** repeatPurchaseRate, benchmarkHighRpr, customer population (observed buyers → quiz incremental → proxy).
- **Shared prerequisites:** traffic + AOV (P4: without either, no revenue math at all).
- **No calculation pathway exists at all for:** AOV-driven levers (bundles/upsells/cross-sells), cart-abandonment recovery, CRO, reviews/social-proof, SEO/paid/lead-gen/referral acquisition (no traffic-side model), loyalty/subscription mechanics (no program-lift benchmark), education/personalized retention (feed into existing paths at most).

---

## 2. Intervention audit matrix

Legend: **Can Calculate** = Potential Revenue Lift produced for the *named* intervention. **Current Result** (harness-verified): CALCULATED / INSUFFICIENT_DATA / TRUE_ZERO / NOT_SUPPORTED. Classifier column = real `classifyProposedSolution` output on the realistic proposed-solution string.

### Conversion (1–11)

| # | Intervention | ACR Dim | Classifier Result (real) | Calculator Path | Can Calc? | Current Result | Required Inputs | Inputs Available? | Evidence Labels | Current Sources | Missing Evidence | Existing Research Supply? | New BMK? | New Path? | Owner Input? | New Svc? | Recommended V2B Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AI product recommendation | Conversion | **ACTIVATES** ("product recommendation system" — recommendation-engine pattern) | Glow Curator (counterfactual) | **PARTIAL** — yes, but only via the data-collection model, not recommendation-specific lift | CALCULATED (base $3,514) | traffic, AOV, CVR, ASM funnel | Yes (benchmarks) | EST/OBS, BMK-002/001, BMK-041×, BMK-074, ASM §27 | SimilarWeb, Triple Whale, §27 ASM | Recommendation-specific conversion-lift benchmark | No | No | No | No | No | **None required.** Works today; the lift is a data-collection-counterfactual, correctly labelled MODELLED |
| 2 | AI skincare routine creator | Conversion | **ACTIVATES** ("routine creator", "zero-party data") | Glow Curator (counterfactual) | **YES** | CALCULATED (base $3,514) | same | Yes | same | same | None (ASM bands documented) | — | No | No | No | No | **None.** This is the V2B acceptance case; validated in test-calculator.ts Case 9 |
| 3 | Product finder / quiz | Conversion | **ACTIVATES** ("product finder", "quiz") | Glow Curator (counterfactual + observed) | **YES** | CALCULATED (base $3,514) | same | Yes | same | same | None | — | No | No | No | No | **None.** Canonical path |
| 4 | Personalized product recommendations | Conversion | **ACTIVATES** ("personalized product recommendations") | Glow Curator (counterfactual) | **YES** (same caveat as #1) | CALCULATED (base $3,514) | same | Yes | same | same | None | — | No | No | No | No | **None required.** |
| 5 | Website personalization | Conversion | no match | — | **NO** | NOT_SUPPORTED | Personalization lift benchmark; mechanism definition | No | — | — | No pathway: personalization without data capture does not activate; no lift benchmark | No | **Yes** (personalization lift BMK) | **Yes** | No | No | Defer. Only worth a new benchmark + classifier pathway if product demand justifies it; document as unsupported meanwhile |
| 6 | Upsells | Conversion | no match | — | **NO** | NOT_SUPPORTED | AOV-lift benchmark per intervention | No | — | — | No AOV-lever formula exists (calculator has no AOV-delta path) | No | **Yes** (AOV-lift BMK) | **Yes** (new AOV path) | No | No | Defer. Highest-value future path for AOV levers (#6–8) if a verified AOV-lift benchmark is sourced |
| 7 | Cross-sells | Conversion | no match | — | **NO** | NOT_SUPPORTED | same | No | — | — | same | No | **Yes** | **Yes** | No | No | Same as #6 |
| 8 | Bundles | Conversion | no match | — | **NO** | NOT_SUPPORTED | same | No | — | — | same | No | **Yes** | **Yes** | No | No | Same as #6 |
| 9 | Abandoned checkout recovery | Conversion | no match | — | **NO** | NOT_SUPPORTED | Cart-abandonment rate + recovery-rate benchmark; email/SMS reach data | No | — | — | No cart-funnel evidence captured by research stack | No | **Yes** (recovery-rate BMK) | **Yes** (cart path) | No | Partially (cart data) | Defer. Research stack cannot observe cart behavior; would also need session/reach data |
| 10 | CRO / checkout optimization | Conversion | no match | — | **NO** | NOT_SUPPORTED | Observed site CVR vs benchmark gap; friction metrics | No | — | — | CVR gap exists in principle but no CRO-lift realization model; observed CVR never supplied by research | No | **Yes** (CRO realization BMK) | **Yes** | **Yes** (observed CVR) | No | Defer. Note: the CVR-gap *concept* exists but the calculator has no CRO pathway; observed CVR is never populated in production |
| 11 | Reviews / social proof optimization | Conversion | no match | — | **NO** | NOT_SUPPORTED | Review-volume/rating benchmarks + CVR-impact BMK | No | — | — | Reviews are counted [OBS] but no impact model exists | No | **Yes** | **Yes** | No | No | Defer. Research already counts reviews — a benchmark is the only incremental need, but no pathway yet |

### Retention (12–18)

| # | Intervention | ACR Dim | Classifier Result (real) | Calculator Path | Can Calc? | Current Result | Required Inputs | Inputs Available? | Evidence Labels | Current Sources | Missing Evidence | Existing Research Supply? | New BMK? | New Path? | Owner Input? | New Svc? | Recommended V2B Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 12 | Replenishment automation | Retention | no match | LTV System | **PARTIAL** | INSUFFICIENT_DATA (production) — calculable **only** with observed RPR < 0.29 (harness: RPR 0.18 → 132 units / $3,208) | baseline RPR **strictly below** verified ceiling; buyer population | **No in production** (RPR/buyers never observed; benchmark-resolved baseline = ceiling → degenerate gap) | BMK-017 (0.29) both sides | Shopify | Observed RPR + observed monthly buyers | **No** (not public data) | No | No | **Yes** — owner-supplied RPR | No | **Highest-leverage V2B fix #1:** add an owner-supplied RPR/buyers input path. This single change activates #12–#18 simultaneously |
| 13 | Post-purchase lifecycle | Retention | no match | LTV System | **PARTIAL** | same as #12 | same | same | same | same | same | No | No | No | **Yes** | No | Same as #12 |
| 14 | Win-back automation | Retention | no match | LTV System | **PARTIAL** | same | same | same | same | same | same | No | No | No | **Yes** | No | Same as #12 |
| 15 | Loyalty program | Retention | no match | LTV System | **PARTIAL** | same | same | same | same | same | same + loyalty-specific lift BMK (current model is generic RPR-gap) | No | Optional | No | **Yes** | No | Same as #12; a loyalty-specific benchmark would refine, not unblock |
| 16 | Subscription / replenishment program | Retention | no match | LTV System | **PARTIAL** | same | same | same | same | same | same | No | No | No | **Yes** | No | Same as #12 |
| 17 | Customer education lifecycle | Retention | no match | LTV System | **PARTIAL** | same | same | same | same | same | same | No | No | No | **Yes** | No | Same as #12 |
| 18 | Personalized retention | Retention | no match | LTV System | **PARTIAL** | same | same | same | same | same | same (preference data would come from Glow Curator — already modelled) | No | No | No | **Yes** | No | Same as #12; note the Glow→LTV feed already exists in the model |

### Acquisition (19–23)

| # | Intervention | ACR Dim | Classifier Result (real) | Calculator Path | Can Calc? | Current Result | Required Inputs | Inputs Available? | Evidence Labels | Current Sources | Missing Evidence | Existing Research Supply? | New BMK? | New Path? | Owner Input? | New Svc? | Recommended V2B Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 19 | SEO | Acquisition | no match | — | **NO** | NOT_SUPPORTED | Traffic-side lift model (visibility → visits → CVR × AOV) | Partial (visibility score exists) | SerpAPI share-of-page [OBS]; no SEO-lift BMK | SerpAPI, SimilarWeb | No traffic-lift pathway in calculator; visibility ≠ visit estimate (deliberately, per R7) | No | **Yes** (SEO visibility→traffic BMK) | **Yes** (acquisition path) | No | No | Defer. Correct that BRAIN refuses to fabricate visit-counts from SERP share; a verified visibility→visits benchmark could unlock an honest acquisition path later |
| 20 | Paid acquisition | Conversion/Acq | no match | — | **NO** | NOT_SUPPORTED | Spend, CPC, paid CVR (BMK-050 exists but is never consumed) | No | BMK-050 present in library but **unused** by any pathway | Triple Whale | Spend data (never public); pathway absent | No | Partially (BMK-050 already in library) | **Yes** | **Yes** (spend) | No | Defer. Note BMK-050 is currently dead inventory — either wire it into a future paid path or document it as context-only |
| 21 | Lead generation | Acquisition | no match | — | **NO** | NOT_SUPPORTED | B2B lead-volume/conversion benchmarks; Apollo firmographics exist but no model | Partial (Apollo employee/revenue) | Apollo [OBS]; no lead-gen BMK | Apollo | No lead pathway; Apollo enriches context only | No | **Yes** | **Yes** | No | Partially | Defer |
| 22 | Lead magnet / signup acquisition | Acquisition | **ACTIVATES** ("email capture", "signup form") | Glow Curator (counterfactual) | **PARTIAL** — yes via data-collection model, **not** via an acquisition model | CALCULATED (base $3,514) | traffic, AOV, CVR, ASM funnel | Yes | same as #2 | same | None (but the figure is conversion-path revenue, not acquisition volume) | — | No | No | No | No | **Document semantics:** the current figure prices the *capture mechanism's* conversion lift, not subscriber acquisition. Acceptable for V2B with explicit labelling (already disclosed as counterfactual [ASM]) |
| 23 | Referral acquisition | Acquisition | no match | — | **NO** | NOT_SUPPORTED | Referral-rate benchmark + viral-factor model | No | — | — | No pathway | No | **Yes** | **Yes** | No | No | Defer |

---

## 3. Harness results summary (executed against the real code)

Beauty scenario (120K visits [EST], `hasQuiz=false`, observed data only where specified), all figures risk-adjusted combined base:

- **#1–#4, #22 (classifier-activating interventions):** CALCULATED, base ≈ $3,514/mo — identical funnel output because the classifier routes them all into the same Glow Curator counterfactual. Conservative band floors to $0 (MAX(0) guard: 3% band purchases < baseline segment); upside ≈ $23,306.
- **#5–#11, #19–#21, #23 (no match):** NOT_SUPPORTED — `collectionActivation='none'`, both paths null, `combined=null`, sufficiency SUFFICIENT (absence is an observed property, not missing evidence).
- **#12–#18 (retention group) in production conditions** (no observed RPR/buyers available): NOT_SUPPORTED — benchmark-resolved baseline (0.29) equals the verified ceiling (0.29) → degenerate-gap guard → INSUFFICIENT_DATA. The harness's observed-data probe proves the path itself is healthy: observed RPR 0.18 → 132 units / $3,208 base; RPR 0.25 → 48 units / $1,296; RPR 0.29 → correctly null.

**Correction vs. the raw harness output:** the harness printed #12–#18 as CALCULATED because it injected `observedRepeatPurchaseRate`/`observedMonthlyBuyers` that the production research engine never supplies (verified: `engine.ts` passes only `hasQuiz` + classifier boolean to `calculateAcrOpportunity`; the four `observed*` fields are typed and tested but never populated in production). Production result for #12–#18 is NOT_SUPPORTED/INSUFFICIENT_DATA. The matrix above reflects production reality.

---

## 4. Root-cause findings

**F1 — The calculator has exactly one live revenue pathway family (data collection → conversion), plus a conditional retention path.** Everything else is honestly unsupported. This is a deliberate evidence-integrity posture (MODEL RULES R7: never fabricate), not a bug.

**F2 — The retention path is structurally starved by the benchmark library.** `selectBenchmarkHighRpr()` returns the same record as `selectRetentionBenchmark()`, so when the baseline resolves from a benchmark (the only production case), gap = 0 → guard fires. Retention can *only* ever calculate with an owner-supplied observed RPR strictly below 0.29 (beauty/food) or 0.282 (all else). This affects all 7 retention interventions identically.

**F3 — `observedAov` / `observedConversionRate` / `observedRepeatPurchaseRate` / `observedMonthlyBuyers` are dead production inputs.** They exist in `CalculatorResearchData`, are exercised by the test suite, but the research engine never populates them. AOV therefore always resolves via benchmarks (category-matched or BMK-041 fallback), and CVR/RPR always via benchmarks. This is the single largest V2B lever: a small owner-data capture (AOV, monthly buyers, RPR) would simultaneously (a) strengthen AOV provenance from BMK-fallback to OBS, (b) unlock the retention path whenever observed RPR < ceiling, (c) convert PARTIAL sufficiency into SUFFICIENT with stronger confidence.

**F4 — BMK-050 (paid CVR) is dead inventory.** Present in the library, never consumed. Either wire into a future paid-acquisition path or explicitly mark context-only.

**F5 — The classifier's activation→Glow-Curator equivalence is by design but worth surfacing.** Interventions #1–#4 and #22 all produce the identical funnel because they all reduce to "creates an on-site data-collection mechanism." That is architecturally correct (the calculator prices the mechanism, not the vendor) but means solution-differentiation currently lives only in Gemini's interpretation layer, not in the numbers.

**F6 — Unverified records are correctly excluded (R6 verified live).** BMK-075 (quiz-to-purchase), BMK-076 (90-day RPR), and BMK-BEAUTY-AOV (skincare $45/$65/$85) never drive math; the §27 ASM bands carry that load with explicit [ASM] labelling.

**F7 — Sufficiency status is honest but can mislead in the NOT_SUPPORTED case.** When collection is inactive and all baselines resolve from benchmarks, `sufficiency.status` can be SUFFICIENT while both revenue paths are null (honest observed absence ≠ missing evidence). Correct per the P4 note in the code, but the UI/export should make clear the intervention itself has no priced pathway.

---

## 5. Gap classification (per audit question 5)

| Gap | Nature | Intervention(s) | Fix class |
|---|---|---|---|
| Observed AOV / buyers / RPR / CVR never captured | Owner data absent | 12–18 (retention), plus provenance quality everywhere | **Owner input** — no new service needed; data already flows through `CalculatorResearchData` |
| Single verified RPR ceiling = baseline benchmark | Benchmark-library depth | 12–18 | **New benchmark** — a second, higher verified RPR reference (e.g. subscription-heavy consumables) would create a benchmark-vs-benchmark gap and unlock retention without owner data. Must be genuinely verified (R6) |
| AOV-lift levers (upsell/cross-sell/bundle) | No pathway | 6–8 | **New calculation path + new benchmark** |
| Cart-abandonment recovery | No pathway + unobservable funnel | 9 | New path + benchmark + partially new data source |
| CRO / reviews impact | No pathway | 10, 11 | New path + benchmark |
| Acquisition (SEO/paid/lead-gen/referral) | No pathway | 19–21, 23 | New traffic-side path + benchmark; BMK-050 partially covers paid |
| Personalization without data capture | Classifier scope | 5 | Classifier extension + benchmark — lowest priority |

## 6. Recommended V2B actions, ordered

1. **Add owner-supplied inputs to the research flow** (optional "first-party data" fields: AOV, monthly buyers, repeat-purchase rate, conversion rate). Zero architectural risk — the calculator already accepts them; only the research engine and UI need to pass them through. Unlocks #12–#18 whenever the owner's observed RPR is below the ceiling, upgrades AOV provenance to OBS across the board, and improves confidence grading. Highest product value per line of code.
2. **Source one additional verified retention benchmark strictly above 0.29/0.282** so retention can produce a benchmark-vs-benchmark gap without owner data. Keep R6 discipline: only if a real, citable source is found; otherwise leave as-is and rely on action 1.
3. **Document (UI/export) the intervention-coverage boundary**: "BRAIN prices Potential Revenue Lift for interventions that create on-site data-collection mechanisms (quizzes, finders, routine creators, preference capture) and for repeat-purchase improvement when a verified headroom exists. Other intervention classes are assessed qualitatively." This converts NOT_SUPPORTED rows from a perceived failure into a stated scope.
4. **Defer new pathways** (AOV levers, cart recovery, CRO impact, acquisition models) until actions 1–3 land; each requires both a new verified benchmark and a new calculator path under the R6/P4 rules — do not attempt piecemeal.
5. **Housekeeping:** mark BMK-050 as context-only in the library metadata or wire it into a future paid path; keep the audit harness (`scripts/audit-interventions.ts`) as a regression tool for the classifier/calculator contract.

---

## 7. What was verified live (reproducibility)

- `bun scripts/test-calculator.ts` → **129 passed, 0 failed**
- `bun scripts/test-prompts.ts` → **32 passed, 0 failed**
- `bun scripts/audit-interventions.ts` → 23-intervention matrix + retention probe (output captured in §3)
- `bun tsc --noEmit` → clean

No production file was modified. The only new file is the read-only audit harness `scripts/audit-interventions.ts`.
