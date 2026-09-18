import { UserType } from './types';
import { AnalysisResult, Scenario } from '../research/types';
import { toNumber } from '../research/signals';
import type { CalculatedMetrics } from './types';
import { runOpenRouterAnalysis } from './openrouter';
import {
  BRAIN_BENCHMARK_SUMMARY,
  buildGeminiPrompt,
  buildGeminiUserMessage,
  PromptContext,
} from './prompts';

/**
 * Model chain (verified live against the configured key):
 *  - gemini-3.5-flash: verified working (HTTP 200) — PRIMARY.
 *  - gemini-3.6-flash: valid, intermittently 503 under load — FALLBACK.
 * gemini-2.5-flash was removed: it returns 404 "no longer available to new
 * users" for the configured key, so it can never serve this deployment.
 * The deterministic fallback still guards against fabricated output on any
 * total failure.
 */
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash'] as const;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface AggregateInput {
  domain: string;
  brandName?: string | null;
  /** User-supplied solution to assess against the evidence (optional). */
  proposedSolution?: string | null;
  /** Which research experience is requesting the analysis. */
  userType: UserType;
  traffic: number | null;
  products: number | null;
  reviews: number | null;
  followerEstimate: number | null;
  employeeCount: number | null;
  hasQuiz: boolean | null;
  remark: string;
  /** Deterministic ACR calculator output — Gemini interprets, never recomputes. */
  calculated?: CalculatedMetrics | null;
}

// ---------------------------------------------------------------------------
// Gemini analysis layer
// ---------------------------------------------------------------------------

/**
 * The analysis layer. Attempts a structured Gemini assessment using the
 * BRAIN Benchmark Directory as reference; falls back to a deterministic
 * INSUFFICIENT_DATA-aware evaluation so no number is ever fabricated.
 */
export async function analyzeBusiness(input: AggregateInput): Promise<AnalysisResult> {
  const result = await runGeminiAnalysis(input);
  if (result) return result;
  return deterministicAnalysis(input);
}

async function runGeminiAnalysis(input: AggregateInput): Promise<AnalysisResult | null> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    console.warn('BRAIN Gemini analysis: GOOGLE_API_KEY not set, using deterministic fallback');
    return null;
  }

  // Modular prompt architecture: system prompt (shared + mode module +
  // authoritative CALCULATED_METRICS + curated benchmark library) and a
  // per-business user message. CalculatedMetrics must already be fully
  // assembled by calculator.ts BEFORE this call — it is embedded verbatim.
  const { systemPrompt, userMessage } = buildAnalysisPrompt(input);

  // Failover across the allowed model chain: a 404/503/timeout on one model
  // falls through to the next rather than dropping to deterministic output.
  for (const model of GEMINI_MODELS) {
    try {
      const text = await callGeminiModel(model, systemPrompt, userMessage, key);
      if (!text) continue;
      const parsed = parseGeminiJson(text, input.userType);
      if (parsed) {
        markAnalysisSource(parsed, model);
        return parsed;
      }
      console.warn(`BRAIN Gemini analysis: ${model} returned unparseable JSON, trying next model`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`BRAIN Gemini analysis: ${model} failed (${message}), trying next model`);
    }
  }

  console.warn('BRAIN Gemini analysis: all Gemini models failed, trying OpenRouter secondary provider');

  // --- OpenRouter secondary fallback ---
  // Only reached when ALL Gemini models fail. OpenRouter's interface takes a
  // single prompt: pass the composed system + user message.
  const openrouterResult = await runOpenRouterAnalysis(
    `${systemPrompt}\n\n---\n\n${userMessage}`,
    input.userType,
  );
  if (openrouterResult) {
    return openrouterResult.result;
  }

  console.warn('BRAIN: all AI providers failed, using deterministic fallback');
  return null;
}

async function callGeminiModel(
  model: string,
  systemPrompt: string,
  userMessage: string,
  key: string,
): Promise<string | null> {
  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }),
    // Large structured prompt (curated benchmark summary + metrics) can take
    // 30s+ on Flash models with thinking enabled — 90s prevents flaky
    // timeouts; the deterministic fallback still catches true failures.
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reason =
      (body as { error?: { message?: string } }).error?.message?.slice(0, 140) ?? 'unknown';
    console.warn(`BRAIN Gemini analysis: ${model} HTTP ${response.status} (${reason})`);
    return null;
  }

  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ?? null;
}

/**
 * INSUFFICIENT_DATA metrics skeleton used when the calculator output is
 * absent (e.g. a research run returned no calculator result). Every field
 * is null/INSUFFICIENT_DATA so the prompt layer can never imply numbers
 * exist — this state is preserved, never estimated around.
 */
function emptyMetrics(domain: string): CalculatedMetrics {
  void domain;
  const insufficient = {
    value: null,
    basis: 'INSUFFICIENT_DATA' as const,
    provenance: 'Not established — INSUFFICIENT_DATA.',
  };
  return {
    sufficiency: {
      status: 'INSUFFICIENT_DATA',
      missingInputs: ['calculator output unavailable for this research run'],
      limitations: ['No ACR calculator result was produced; all revenue paths are unavailable.'],
    },
    inputs: {
      traffic: { ...insufficient, provenance: 'Traffic not established for this run.' },
      aov: { ...insufficient, provenance: 'AOV not established for this run.' },
      conversionRate: insufficient,
      quizParticipation: insufficient,
      quizCompletion: insufficient,
      quizToPurchase: insufficient,
      repeatPurchaseRate: insufficient,
      benchmarkHighRpr: insufficient,
      productLifespanDays: insufficient,
      automationMaturity: 'none',
      industry: 'generic',
      industryBasis: 'Unclassified — no calculator industry resolution available.',
      replenishmentWindow: 'Unknown',
      collectionActivation: 'none',
      recoveryActivation: 'none' as const,
      recoveryAov: insufficient,
      recoveryWindowDays: insufficient,
    },
    conversion: emptyPathScenarios(),
    retention: emptyPathScenarios(),
    recovery: emptyPathScenarios(),
    combined: { conservative: null, base: null, upside: null },
    opportunity: { conversion: null, retention: null, recovery: null, primary: null },
    revenueProtection: {
      supportContactRate: insufficient,
      note: 'Not calculated — no calculator output available.',
    },
    assumptions: [],
    benchmarksApplied: [],
    evidenceLedger: [],
    formulasApplied: [],
    dataLimitations: ['No calculator output for this research run.'],
  };
}

function emptyPathScenarios(): CalculatedMetrics['conversion'] {
  const s = {
    incrementalUnits: null,
    rawRevenueLift: null,
    effectiveRealization: 0,
    realizedRevenueLift: null,
    basis: 'INSUFFICIENT_DATA' as const,
  };
  return { conservative: { ...s }, base: { ...s }, upside: { ...s } };
}

/**
 * Build the analysis prompt via the modular prompt architecture:
 * system prompt (shared + owner/prospect module + authoritative
 * CALCULATED_METRICS + curated benchmark library) and the per-business
 * user message. CalculatedMetrics must already be assembled by
 * calculator.ts before this runs — it is embedded verbatim; nothing here
 * computes.
 */
function buildAnalysisPrompt(input: AggregateInput): { systemPrompt: string; userMessage: string } {
  const metrics = input.calculated ?? emptyMetrics(input.domain);
  const context: PromptContext = {
    userType: input.userType,
    proposedSolution: input.proposedSolution,
    remark: input.remark,
    domain: input.domain,
    brandName: input.brandName,
    traffic: input.traffic,
    products: input.products,
    reviews: input.reviews,
    followerEstimate: input.followerEstimate,
    employeeCount: input.employeeCount,
    hasQuiz: input.hasQuiz,
  };
  return {
    systemPrompt: buildGeminiPrompt(metrics, BRAIN_BENCHMARK_SUMMARY, context),
    userMessage: buildGeminiUserMessage(context),
  };
}

function parseGeminiJson(text: string, userType: UserType): AnalysisResult | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  const scenarios: Scenario[] = (['Conservative', 'Base', 'Aggressive'] as const).map((label) => {
    const found = Array.isArray(obj.scenarios)
      ? obj.scenarios.find((s: Record<string, unknown>) => s.label === label)
      : null;
    return {
      label,
      description: typeof found?.description === 'string' ? found.description : '',
      revenueLow: Math.max(0, toNumber(found?.revenueLow) ?? 0),
      revenueHigh: Math.max(0, toNumber(found?.revenueHigh) ?? 0),
    };
  });

  // Guardrail: if the model returned zero across the board, normalize
  // descriptions so the user sees INSUFFICIENT_DATA rather than $0–$0.
  const allZero = scenarios.every((s) => s.revenueLow === 0 && s.revenueHigh === 0);
  if (allZero) {
    for (const s of scenarios) {
      if (!/INSUFFICIENT_DATA/i.test(s.description)) {
        s.description = `[ASM] Revenue scenarios: INSUFFICIENT_DATA — required inputs (traffic and/or AOV basis) were unavailable. ${s.description}`.trim();
      }
    }
  }

  const solutionFit =
    userType === 'prospect' && typeof obj.solutionFit === 'string'
      ? obj.solutionFit.slice(0, 240)
      : null;

  // Premium fields: mode-scoped, length-bounded. A field from the wrong mode
  // is discarded rather than surfaced.
  const solutionImpact =
    typeof obj.solutionImpact === 'string' && obj.solutionImpact.trim().length > 0
      ? obj.solutionImpact.trim().slice(0, 600)
      : null;
  const priorityChanges =
    userType === 'owner' && Array.isArray(obj.priorityChanges)
      ? obj.priorityChanges.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 3).map((s) => s.slice(0, 300))
      : null;
  const angleOfPitch =
    userType === 'prospect' && typeof obj.angleOfPitch === 'string' && obj.angleOfPitch.trim().length > 0
      ? obj.angleOfPitch.trim().slice(0, 600)
      : null;

  return {
    solutionFit,
    scenarios,
    growthScore: clamp(toNumber(obj.growthScore) ?? 0, 0, 100),
    bottlenecks: Array.isArray(obj.bottlenecks) ? obj.bottlenecks.map(String).slice(0, 8) : [],
    opportunities: Array.isArray(obj.opportunities) ? obj.opportunities.map(String).slice(0, 8) : [],
    confidence: (['low', 'medium', 'high'] as const).includes(obj.confidence as 'low' | 'medium' | 'high')
      ? (obj.confidence as AnalysisResult['confidence'])
      : 'low',
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    solutionImpact,
    priorityChanges,
    angleOfPitch,
  };
}

function markAnalysisSource(result: AnalysisResult, source: string): void {
  result.analysisSource = source;
}

// ---------------------------------------------------------------------------
// Deterministic fallback — INSUFFICIENT_DATA-aware, no fabricated revenue
// ---------------------------------------------------------------------------

/**
 * Fallback analysis when Gemini is unavailable. This layer NEVER invents
 * revenue. It can only:
 *  1. observe what was found ([OBS]),
 *  2. state which benchmarks would apply ([BMK]),
 *  3. compute a gap ONLY when both sides of the comparison exist,
 *  4. declare INSUFFICIENT_DATA otherwise.
 */
function deterministicAnalysis(input: AggregateInput): AnalysisResult {
  const result: AnalysisResult = {
    scenarios: buildScenarios(input),
    growthScore: 0,
    bottlenecks: buildBottlenecks(input),
    opportunities: buildOpportunities(input),
    confidence: input.traffic !== null ? 'low' : 'low',
    summary: buildSummary(input),
    solutionImpact: buildDeterministicSolutionImpact(input),
    priorityChanges: input.userType === 'owner' ? buildDeterministicPriorityChanges(input) : null,
    angleOfPitch: input.userType === 'prospect' ? buildDeterministicAngleOfPitch(input) : null,
  };
  markAnalysisSource(result, 'deterministic');
  return result;
}

/**
 * Deterministic premium fields. Without AI interpretation these must stay
 * strictly evidence-tied: they name the specific decision the missing data
 * blocks and the concrete first-party measurements that unblock it — never
 * generic advice, never invented revenue.
 */
function buildDeterministicSolutionImpact(input: AggregateInput): string {
  const parts: string[] = [];
  if (input.calculated && input.calculated.sufficiency.status !== 'INSUFFICIENT_DATA') {
    const opp = input.calculated.opportunity;
    if (opp.primary && opp[opp.primary] !== null) {
      const dimension = opp.primary === 'conversion' ? 'conversion' : 'retention';
      parts.push(
        `[DRV] The calculated ${dimension} opportunity ($${Math.round(opp[opp.primary] as number).toLocaleString()}/month base case) is the benchmark-based headroom from the ACR model — addressing it would move revenue that currently depends on the underperforming dimension rather than on new traffic.`
      );
    }
  }
  if (input.traffic === null) {
    parts.push('[ASM] Traffic is unverified, so revenue sizing is blocked: every conversion and retention calculation scales from monthly visitors. Establishing verified traffic (analytics or ad-platform data) is what converts this assessment from qualitative to quantified.');
  } else {
    parts.push('[ASM] Conversion rate, AOV and repeat-purchase behavior were not observable from public signals — first-party baselines would convert this assessment from qualitative to quantified.');
  }
  return parts.join(' ') || '[ASM] Insufficient observed evidence to state a business consequence — deeper research required.';
}

function buildDeterministicPriorityChanges(input: AggregateInput): string[] {
  const out: string[] = [];
  if (input.traffic === null) {
    out.push('1. Establish verified monthly traffic (analytics, ad-platform or server data) — every ACR calculation scales from this input and it is currently unverified [OBS missing].');
  }
  if (input.hasQuiz === null || !input.hasQuiz) {
    out.push('2. Audit capture/qualification: no quiz element was' + (input.hasQuiz === null ? ' confirmed' : ' found') + ' on crawled pages — quiz-based segmentation is the conversion path the ACR model prices (BENCHMARK 070-072) [OBS].');
  }
  if (input.reviews === null || input.reviews === 0) {
    out.push('3. Verify review/social-proof volume — none was found publicly, and social proof is a prerequisite for conversion benchmarking (BENCHMARK 084) [OBS].');
  } else {
    out.push(`3. Pull first-party conversion and repeat-purchase rates to compare against the retention benchmarks (BENCHMARK 015) — public review volume (${input.reviews.toLocaleString()}) suggests enough order history to measure [OBS].`);
  }
  out.push('4. Classify industry and price points so the ACR calculator can select a category-matched AOV benchmark instead of returning INSUFFICIENT_DATA [ASM].');
  return out.slice(0, 4);
}

function buildDeterministicAngleOfPitch(input: AggregateInput): string | null {
  if (!input.proposedSolution) return null;
  const evidence: string[] = [];
  if (input.hasQuiz) evidence.push('an existing quiz/qualification capture [OBS]');
  if (input.reviews !== null && input.reviews > 0) evidence.push(`${input.reviews.toLocaleString()} public review references [OBS]`);
  if (input.products !== null && input.products > 0) evidence.push(`${input.products} catalog markers [OBS]`);
  if (input.followerEstimate !== null) evidence.push(`a combined social following of ~${input.followerEstimate.toLocaleString()} [OBS]`);

  const anchor = evidence.length
    ? `Lead with what is already observable: ${evidence.join(', ')}.`
    : 'Public evidence is thin — the honest opening is the discovery itself.';
  return `[ASM] Deterministic assessment (AI fit verdict unavailable). ${anchor} The pitch must establish first-party conversion, AOV and repeat-purchase data before claiming impact; position the proposed solution ("${input.proposedSolution.slice(0, 140)}") as the mechanism for capturing and using that data, not as a proven outcome.`;
}

function buildScenarios(input: AggregateInput): Scenario[] {
  const aovBasis = inferAovBasis(input);

  const canEstimate = input.traffic !== null && input.traffic > 0 && aovBasis !== null;

  if (!canEstimate) {
    const missing: string[] = [];
    if (input.traffic === null || input.traffic <= 0) missing.push('traffic estimate');
    if (aovBasis === null) missing.push('AOV or category-matched AOV benchmark');
    const reason = `Revenue scenarios: INSUFFICIENT_DATA — missing ${missing.join(' and ')}.`;

    return (['Conservative', 'Base', 'Aggressive'] as const).map((label) => ({
      label,
      description: `[ASM] ${reason} BRAIN does not fabricate estimates. Provide the missing data or run deeper research to unlock scenario modelling (see MODEL RULES P4).`,
      revenueLow: 0,
      revenueHigh: 0,
    }));
  }

  // Both inputs exist: produce a benchmark-based THEORETICAL headroom,
  // clearly labelled as such. This uses the DTC paid-channel median AOV
  // (Triple Whale, BENCHMARK 041) as the fallback AOV basis and the
  // realization/buffer model rules (MODEL RULES P1/P2).
  const traffic = input.traffic as number;
  const aov = aovBasis as number;

  // Headroom basis: gap between a conservative observed-conversion assumption
  // and the relevant benchmark range. Without an OBSERVED conversion rate we
  // cannot know the gap — so we use the most conservative defensible form:
  // 1 additional percentage point of conversion headroom (labelled [ASM]),
  // then apply realization x buffer.
  const headroomConversions = traffic * 0.01; // [ASM] 1pp conservative headroom
  const incrementalRevenue = headroomConversions * aov;

  const rows: Array<{ label: Scenario['label']; r: number; buffer: number }> = [
    { label: 'Conservative', r: 0.25, buffer: 0.15 },
    { label: 'Base', r: 0.5, buffer: 0.1 },
    { label: 'Aggressive', r: 0.75, buffer: 0.05 },
  ];

  return rows.map(({ label, r, buffer }) => {
    const low = Math.round(incrementalRevenue * r * (1 - buffer));
    const high = Math.round(incrementalRevenue * r * 2); // upper edge of the 1–2pp headroom band
    return {
      label,
      description: `[ASM] Theoretical benchmark-based headroom: assumes ~1–2pp conversion headroom [ASM] on observed traffic [OBS] x DTC paid-channel median AOV $${aov.toFixed(2)} [BMK 041 Triple Whale]. Realization ${(r * 100).toFixed(0)}%, risk buffer ${(buffer * 100).toFixed(0)}% (MODEL RULES P1/P2). NOT a guarantee — actual conversion rate and category AOV were not observed.`,
      revenueLow: low,
      revenueHigh: high,
    };
  });
}

/**
 * AOV basis resolution. Only category-matched benchmarks qualify.
 * Returns null when no defensible basis exists — this triggers
 * INSUFFICIENT_DATA rather than a fabricated number.
 */
function inferAovBasis(input: AggregateInput): number | null {
  // Without observed pricing data or a confirmed industry, BRAIN cannot
  // defensibly pick an AOV benchmark. Return null so scenarios become
  // INSUFFICIENT_DATA. (Industry classification is a V2 capability —
  // see benchmark directory Section 20.)
  void input;
  return null;
}

function buildBottlenecks(input: AggregateInput): string[] {
  const out: string[] = [];
  // Proposed solution: deterministic layer cannot verify solution-evidence fit.
  // Single line — the earlier duplicate (prospect + generic branches) double-
  // reported the same unevaluated-solution note.
  if (input.proposedSolution) {
    out.push(`[ASM] Proposed solution recorded: "${input.proposedSolution.slice(0, 120)}". Evidence-fit assessment requires AI analysis — treat as unevaluated until deeper research.`);
  }

  if (input.traffic === null) {
    out.push('[OBS] Traffic estimate unavailable — acquisition analysis limited. (Needed: search-visibility or analytics signal)');
  } else {
    out.push(`[OBS] Estimated monthly traffic: ${input.traffic.toLocaleString()}. Compare against relevant acquisition benchmarks once industry is classified.`);
  }

  if (input.reviews === null || input.reviews === 0) {
    out.push('[OBS] No review data found — social proof could not be assessed. (Ref: BENCHMARK 084 — measure review count/rating/recency before comparing)');
  } else {
    out.push(`[OBS] ${input.reviews.toLocaleString()} review references found. (Ref: BENCHMARK 084 — compare against category data when available)`);
  }

  if (input.hasQuiz === null) {
    out.push('[OBS] Quiz presence undetermined — crawling did not reach quiz-bearing pages. (Ref: BENCHMARK 070 — quiz completion 70–80% considered good)');
  } else if (!input.hasQuiz) {
    out.push('[OBS] No quiz element found on crawled pages. (Ref: BENCHMARK 070/071 — quiz personalization benchmarks)');
  } else {
    out.push('[OBS] Quiz/interactive element present. (Ref: BENCHMARK 071 — lead conversion 25–30% considered good; BENCHMARK 072 — CTA click 15–20%)');
  }

  if (input.followerEstimate === null) {
    out.push('[OBS] Social following unavailable — organic social reach not assessed.');
  }

  if (input.products === null || input.products === 0) {
    out.push('[OBS] No storefront/catalog markers found — catalog breadth not assessed.');
  }

  out.push('[ASM] Conversion, AOV, retention and email performance could not be observed from public signals — these require first-party data or deeper research.');

  return out.slice(0, 8);
}

function buildOpportunities(input: AggregateInput): string[] {
  const out: string[] = [];

  if (input.hasQuiz) {
    out.push('[OBS] Quiz present — qualification/segmentation capture exists. (Ref: BENCHMARK 072 — result-CTA click 15–20% considered good)');
  }
  if (input.products !== null && input.products > 20) {
    out.push(`[OBS] ${input.products} catalog markers — cross-sell surface exists. (Ref: BENCHMARK 041 — DTC AOV context; bundling/AOV levers per BENCHMARK 095)`);
  }
  if (input.reviews !== null && input.reviews >= 500) {
    out.push('[OBS] Established review base — lifecycle email automation is a candidate lever. (Ref: BENCHMARK 030 — automation ~37% of sales from ~2% of volume, Omnisend)');
  }

  out.push('[ASM] No quantitative opportunity sizing possible without conversion/AOV observation — see INSUFFICIENT_DATA conditions in scenarios.');

  return out.slice(0, 8);
}

function buildSummary(input: AggregateInput): string {
  const found: string[] = [];
  if (input.traffic !== null) found.push('traffic estimate');
  if (input.products) found.push(`${input.products} catalog markers`);
  if (input.reviews) found.push(`${input.reviews} review references`);
  if (input.followerEstimate) found.push('social following');
  if (input.hasQuiz !== null) found.push(input.hasQuiz ? 'quiz present' : 'no quiz detected');

  const basis = found.length
    ? `Observed: ${found.join(', ')}.`
    : 'No reliable public signals were captured for this domain.';

  return `[DRV] Deterministic assessment (Gemini unavailable — no AI interpretation applied). ${basis} Revenue scenario modelling requires traffic plus an AOV basis; where either is missing the scenarios are marked INSUFFICIENT_DATA rather than estimated. This is a research summary, not a revenue guarantee.`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
