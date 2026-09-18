# BRAIN V2D.1 — Abandoned Checkout Recovery Evidence Audit

**Status:** COMPLETE · **Type:** Research-only evidence audit · **Production code changed:** NONE

*Record of the V2D.1 audit (delivered 2026-09-18). This document is the persisted audit artifact; no production code, benchmarks, or schema were modified.*

---

## 1. Research Conclusion

**CONTEXT_ONLY.**

Credible, intervention-specific evidence exists for the *engagement funnel* of cart-recovery interventions — but no source publishes a benchmark that can directly drive a deterministic incremental-revenue calculation for DTC e-commerce. Two structural gaps block direct USE:

1. **Denominator mismatch.** Platform datasets report recovery-flow engagement (placed-order rate per flow *recipient*), not recovered orders per abandoned cart/checkout. No source discloses flow *coverage* (what share of abandoners actually received the flow), so the recovery rate a calculator needs cannot be derived from them.
2. **Attribution discipline.** Platform-attributed "recovered" orders include would-have-purchased-anyway orders. No dataset discloses a holdout or incrementality methodology. BRAIN's own catalog guardrails (BMK-010: ~42% of abandoners are "just browsing / not ready to buy"; BMK-008 caution against traffic × abandonment × AOV) already forbid treating platform-attributed orders as net lift.

Additionally, **no public source separates checkout-stage recovery (Definition C) from cart-stage recovery (Definitions A/D)** — the evidence base is cart-recovery-generic only.

## 2. Current Architecture Baseline (read, not modified)

- **Catalog:** abandonment *incidence* benchmarks only — BMK-006 (Baymard 70.19%), BMK-007 (Triple Whale 70.22%), BMK-008 (beauty 81.71%), BMK-009 (device split), BMK-010 ("just browsing" guardrail), BMK-011 (checkout length). Explicit caution on BMK-008 against computing lost revenue from incidence alone.
- **Calculator:** zero recovery-related code (no `abandoned*` / `cart*` references).
- **V2C classifier/routing:** "abandoned checkout recovery" → CONVERSION dimension, `collectionActivation: 'none'` → **NOT_SUPPORTED**. Correct today: an incidence benchmark is not a recovery model.

## 3. Intervention Definitions (per source discipline)

| ID | Definition | How sources actually measure |
|---|---|---|
| **A. Cart abandonment** | Shopper adds product(s) to cart, does not proceed to checkout | Baymard/Triple Whale incidence benchmarks (70.19%/70.22%) |
| **B. Checkout initiation** | Shopper reaches/initiates checkout | Shopify "abandoned checkouts" (native tool is checkout-stage only) |
| **C. Checkout abandonment** | Shopper initiates checkout, does not complete | Shopify abandoned-checkout population |
| **D. Cart recovery (broad)** | Recovery targeting cart abandoners and/or checkout abandoners | All recovery-flow datasets (Klaviyo, Omnisend, Recapture) measure this mixed population |

**Note on stage separation:** Klaviyo cart flows can trigger on checkout events, blurring A/B/C/D. No public benchmark isolates Definition D (checkout-stage recovery) as a distinct population.

## 4. Candidate Evidence Table

| Source | Metric (source's definition) | Value | Population / denominator | Date | Tier | Directly usable for a recovery pathway? | Classification |
|---|---|---|---|---|---|---|---|
| **Klaviyo 2024 Benchmark Report** (143K+ abandoned cart flows, 2023 data; read directly) | Placed-order rate per flow recipient; RPR | Avg 3.33% conversion, $3.65 RPR; top-10% 7.69%, $28.89 RPR | Klaviyo customers, all ecommerce verticals; denominator = **flow recipients**, not abandoned carts; no coverage/attribution disclosure | 2024 (2023 data) | **1** | No — wrong denominator + platform attribution | **CONTEXT_ONLY** (funnel-stage context) |
| **Omnisend 2025 abandoned-cart benchmarks** (read directly) | Open 35.75%, click-to-sent 3.84%, conversion 1.51%, click-to-conversion 39.46%, RPE $2.54, recovered AOV $168 | Same | Omnisend users 2025; denominator = sends/recipients; no attribution methodology | 2026 (2025 data) | **1** | No — same two gaps | **CONTEXT_ONLY** |
| **Shopify "abandoned cart recovery rate"** (read directly) | *Definition only*: recovered carts ÷ abandoned carts within attribution window; native tool reports sessions/orders/CVR/AOV per flow | — | Definitional/methodological alignment with BRAIN's A/B/C/D taxonomy | Sep 2026 | 2 | No — definition, not population data | **CONTEXT_ONLY** (definition alignment) |
| **Recapture recovery guide** | "Multi-step series wins back 10–15% of lost revenue; 3 emails = 153–231% more than 1" | 10–15% | "10–11,000+ stores since 2016" claimed; **no dataset, denominators, or attribution disclosed**; vendor selling the product | current | 4 (vendor-proprietary) | No | **REJECT** |
| Sender.net / Mailmodo / Piggy compilations ("recovery 10–30%", "10.2% email / 8.7% SMS", SaleCycle-derived "29.9% clicked", "31.6% recovery") | Mixed recovery-rate claims | varies | Secondary/uncited reproductions; underlying SaleCycle dataset not retrievable; methodology absent | 2025–26 | 4 | No | **REJECT** |
| Baymard incidence + reason data ($260B "recoverable via better checkout", 39% extra costs, 42% just-browsing) | Abandonment incidence & causes | 70.19% | 50-study meta-analysis | current | 2 | No — incidence ≠ recovery; already in catalog as BMK-006/010 | **CONTEXT_ONLY** (already held) |

## 5. Strongest Candidate

**Klaviyo 2024 Benchmark Report** — the only large-N, dated, publicly documented recovery-flow dataset. Context value: recovery flows are the highest-revenue automation (RPR $3.65 avg vs $2.87 all-automation), with ~40–50% click→order follow-through — strong *qualitative* support that the intervention works. Why not USE: per-recipient denominator, no coverage disclosure, no incrementality methodology, and flow-trigger ambiguity preventing stage-specific application.

## 6. Rejected Evidence

- **Recapture's 10–15% / 153–231% figures** — vendor-published, no dataset/denominator/attribution window; irreconcilable with the sender.net 10.2% range.
- **All "10.2% / 8.7% / 31.6% recovery" listicle figures** — Tier-4 reproductions of an unretrievable SaleCycle dataset; no methodology.
- **Single-brand case studies** (Grind 12.3% flow conversion, Pura Vida 26% CTR) — anecdotes, not population benchmarks.
- **"Up to 20% recoverable" (Sendtric)** — uncited marketing claim.

## 7. General vs Category-Specific Applicability

No category-specific or stage-specific recovery benchmark is supportable. All existing candidates are (a) cart-recovery-generic (Definition D), (b) per-recipient-denominated, (c) platform-attributed. Even context records cannot be split into beauty/consumables rows honestly.

## 8. Recommended Benchmark Action

**Add nothing to the production catalog now.** If a V2D pathway proceeds, the defensible record would be a *context-labeled* Klaviyo/Omnisend funnel record (clearly not a recovery-rate benchmark), and the pathway's actual lift driver should be **owner-supplied OBS data** (existing abandoner counts, attributed recovered orders, AOV — the V2B.1 pattern), with platform figures used only as sanity ranges and any attribution discount carried as an explicit [ASM] — no verified source for such a discount exists today.

## 9. Engineering Recommendation

1. Keep "abandoned checkout recovery" → CONVERSION → NOT_SUPPORTED (V2C behavior unchanged).
2. A future pathway needs three evidence layers: (a) abandoned-population sizing — BMK-006/007/008 already cover this *with* the BMK-010 non-recoverable guardrail; (b) a recovery rate with denominator = abandoned carts — **does not publicly exist at Tier 1–2**; (c) an incrementality/attribution discount — also does not exist.
3. The realistic route is first-party: extend owner intake (later, not now) with observed abandoner/recovered figures, then validate against the Klaviyo/Omnisend context ranges.
4. Sequence: **V2D.2 = design audit of a first-party-fed recovery pathway (paper only), before any calculator code.**

## 10. Files Changed

**NONE.**

*Audit trail: BMK-006/007/008/010/011 verified in `benchmark.txt`; calculator and revenue-state checked for existing recovery logic; Klaviyo 2024 Benchmark Report, Omnisend 2025 abandoned-cart page, Shopify recovery-rate article, Recapture recovery guide, and sender.net statistics read directly; SaleCycle primary dataset unretrievable (404/403) and its figures rejected as unverifiable.*
