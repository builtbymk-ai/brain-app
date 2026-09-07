import {
  BENCHMARK_LIBRARY,
  MODEL_RULES,
} from './benchmark-bundle.generated';
import { UserType } from './types';
import { AnalysisResult, Scenario } from '../research/types';
import { getModeDefinition } from './modes';
import { toNumber } from '../research/signals';
import type { CalculatedMetrics } from './types';
import { runOpenRouterAnalysis } from './openrouter';

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
// Benchmark extraction from the bundled library
// ---------------------------------------------------------------------------

/**
 * Extract a single benchmark record INCLUDING its full metadata block
 * (source, dataset, caution, status). Extraction stops at the next
 * BENCHMARK/SECTION/SOURCE marker so no metadata is lost.
 */
function extractRecord(full: string, startMarker: string): string {
  const idx = full.indexOf(startMarker);
  if (idx === -1) return '';
  const rest = full.slice(idx + startMarker.length);
  const nextBench = rest.search(/\nBENCHMARK \d|\nSECTION \d|\nSOURCE \d|\nEND OF/);
  const endIdx = nextBench === -1 ? rest.length : nextBench;
  return (startMarker.startsWith('BENCHMARK') ? '' : startMarker.slice(0, 0)) + rest.slice(0, endIdx).trim();
}

function extractSection(full: string, startMarker: string, endMarker: string): string {
  const startIdx = full.indexOf(startMarker);
  if (startIdx === -1) return '';
  const endIdx = full.indexOf(endMarker, startIdx + startMarker.length);
  return endIdx !== -1 ? full.slice(startIdx, endIdx).trim() : full.slice(startIdx).trim();
}

function bench(id: number): string {
  const marker = `BENCHMARK ${String(id).padStart(3, '0')}`;
  return extractRecord(BENCHMARK_LIBRARY, marker);
}

function rulesSection(startMarker: string, endMarker: string): string {
  return extractSection(MODEL_RULES, startMarker, endMarker);
}

/**
 * The V1 benchmark subset injected into the Gemini prompt. Each record
 * carries its full metadata: metric, value, source, dataset, period,
 * sample size, evidence type, caution, and status — so Gemini can judge
 * applicability rather than seeing a bare number.
 */
export function getV1BenchmarkSubset(): string {
  const sections: string[] = [];

  sections.push('--- METHOD / EVIDENCE RULES (BRAIN MODEL RULES) ---');
  sections.push(rulesSection('SECTION M1', 'SECTION M3'));
  sections.push(rulesSection('SECTION M2', 'SECTION M3'));
  sections.push(rulesSection('SECTION M3', 'SECTION M5'));

  sections.push('--- BENCHMARK RECORDS (V1 CORE — WITH FULL METADATA) ---');

  // Conversion benchmarks (001–014)
  for (let i = 1; i <= 14; i++) sections.push(bench(i));

  // Retention (015–019)
  for (let i = 15; i <= 19; i++) sections.push(bench(i));

  // Email (022–031)
  for (let i = 22; i <= 31; i++) sections.push(bench(i));

  // SMS (032–038)
  for (let i = 32; i <= 38; i++) sections.push(bench(i));

  // AOV (039–048)
  for (let i = 39; i <= 48; i++) sections.push(bench(i));

  // Paid acquisition (049–055)
  for (let i = 49; i <= 55; i++) sections.push(bench(i));

  // Digital experience (056–059)
  for (let i = 56; i <= 59; i++) sections.push(bench(i));

  // Support (060–069)
  for (let i = 60; i <= 69; i++) sections.push(bench(i));

  // Quiz (070–074) + quiz-to-purchase (075, UNVERIFIED) + 90-day RPR (076, UNVERIFIED)
  for (let i = 70; i <= 76; i++) sections.push(bench(i));

  // Subscription (079–080) + reviews (082–084) + CLV formulas (090–096)
  for (const i of [79, 80, 82, 83, 84, 90, 91, 92, 93, 94, 95, 96]) sections.push(bench(i));

  // Selection algorithm + guardrails from the benchmark directory
  sections.push(extractSection(BENCHMARK_LIBRARY, 'SECTION 25', 'SECTION 27'));

  return sections.filter(Boolean).join('\n\n');
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

  const prompt = buildPrompt(input);

  // Failover across the allowed model chain: a 404/503/timeout on one model
  // falls through to the next rather than dropping to deterministic output.
  for (const model of GEMINI_MODELS) {
    try {
      const text = await callGeminiModel(model, prompt, key);
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
  // Only reached when ALL Gemini models fail.
  const openrouterResult = await runOpenRouterAnalysis(prompt, input.userType);
  if (openrouterResult) {
    return openrouterResult.result;
  }

  console.warn('BRAIN: all AI providers failed, using deterministic fallback');
  return null;
}

async function callGeminiModel(model: string, prompt: string, key: string): Promise<string | null> {
  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // Mode shapes interpretation, not computation: the prompt header and
      // interpretation block come from the mode registry.
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }),
    // Large structured prompt (≈7K tokens with benchmark subset) can take
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

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

/**
 * Serialize the calculator's authoritative numbers for the prompt. These are
 * the ONLY revenue figures Gemini may present — it interprets them; it never
 * performs arithmetic.
 */
function formatCalculated(calculated: CalculatedMetrics | null | undefined): string {
  if (!calculated) return 'Not available — interpret qualitatively and mark revenue scenarios INSUFFICIENT_DATA.';

  const c = calculated;
  const lines: string[] = [];
  lines.push(`Data sufficiency: ${c.sufficiency.status}${c.sufficiency.missingInputs.length ? ` — missing: ${c.sufficiency.missingInputs.join('; ')}` : ''}`);
  lines.push(`Industry classification: ${c.inputs.industry} (${c.inputs.industryBasis})`);
  lines.push(`Traffic basis: [${c.inputs.traffic.basis}] ${c.inputs.traffic.provenance}`);
  lines.push(`AOV basis: [${c.inputs.aov.basis}] ${c.inputs.aov.provenance}`);

  const path = (name: string, p: CalculatedMetrics['conversion']) => {
    const rows: string[] = [];
    for (const key of ['conservative', 'base', 'upside'] as const) {
      const s = p[key];
      rows.push(
        `  ${key}: units=${s.incrementalUnits ?? 'INSUFFICIENT_DATA'}, rawLift=${s.rawRevenueLift ?? 'INSUFFICIENT_DATA'}, realization=${s.effectiveRealization}, realizedLift=${s.realizedRevenueLift ?? 'INSUFFICIENT_DATA'} [${s.basis}]`
      );
    }
    lines.push(`${name}:`);
    lines.push(...rows);
  };

  path('CONVERSION PATH (Glow Curator)', c.conversion);
  path('RETENTION PATH (LTV System)', c.retention);

  for (const key of ['conservative', 'base', 'upside'] as const) {
    const cb = c.combined[key];
    lines.push(`COMBINED ${key}: ${cb ? formatMoney(cb.low) : 'INSUFFICIENT_DATA'}`);
  }

  lines.push(`Workspace opportunity (base): conversion=${c.opportunity.conversion ?? 'INSUFFICIENT_DATA'}, retention=${c.opportunity.retention ?? 'INSUFFICIENT_DATA'}, primary=${c.opportunity.primary ?? 'none'}`);

  if (c.assumptions.length) {
    lines.push('Assumptions applied:');
    for (const a of c.assumptions) lines.push(`  - ${a.key}: ${a.value} — ${a.note}`);
  }
  if (c.benchmarksApplied.length) {
    lines.push('Benchmarks applied:');
    for (const b of c.benchmarksApplied) lines.push(`  - ${b.id} ${b.metric} = ${b.value} (${b.source}, ${b.verification}) — used for: ${b.use}`);
  }
  if (c.evidenceLedger.length) {
    lines.push('Evidence ledger (input → formula → output):');
    for (const step of c.evidenceLedger) {
      lines.push(`  - ${step.formula} | inputs: ${JSON.stringify(step.inputs)} | output: ${step.output} | ${step.evidence}`);
    }
  }
  if (c.dataLimitations.length) {
    lines.push('Data limitations:');
    for (const l of c.dataLimitations) lines.push(`  - ${l}`);
  }

  return lines.join('\n');
}

function buildPrompt(input: AggregateInput): string {
  const benchmarkSubset = getV1BenchmarkSubset();
  const mode = getModeDefinition(input.userType);
  const calculatedBlock = formatCalculated(input.calculated);

  return `You are BRAIN's analysis layer. Produce a structured opportunity assessment for the business below.

--- REQUEST MODE ---
${mode.promptHeader}
${mode.interpretation}

--- BUSINESS SIGNALS ---
Business domain: ${input.domain}
${input.brandName ? `Brand name (user-supplied): ${input.brandName}` : ''}
Estimated monthly visits: ${input.traffic ?? 'INSUFFICIENT_DATA'}
Product/storefront markers found: ${input.products ?? 'Not found'}
Reviews found: ${input.reviews ?? 'Not found'}
Combined social followers: ${input.followerEstimate ?? 'Not found'}
Estimated employees: ${input.employeeCount ?? 'Not found'}
Quiz/interactive element present: ${input.hasQuiz === null ? 'Not found' : input.hasQuiz ? 'yes' : 'no'}
${input.remark ? `Analysis remark: ${input.remark}` : ''}

--- ACR CALCULATOR OUTPUT (AUTHORITATIVE — INTERPRET, DO NOT RECOMPUTE) ---
${calculatedBlock}
${input.proposedSolution ? `
--- PROPOSED SOLUTION TO ASSESS (user-supplied) ---
"${input.proposedSolution}"

ASSESSMENT TASK: Evaluate whether the evidence above supports, partially supports, or does not support this proposed solution. Reference specific observed signals and benchmarks. If the evidence is insufficient to assess the solution, say exactly what data would be needed. Do NOT endorse a solution the evidence does not support — label this [DRV] with the evidence basis, or INSUFFICIENT_DATA where applicable.` : ''}

${benchmarkSubset}

--- ANALYSIS RULES (BINDING) ---
1. Evidence tags: [OBS] observed data, [BMK] benchmark, [ASM] assumption, [DRV] derived. Tag every claim.
2. MISSING INPUTS: If a value is "Not found" or "INSUFFICIENT_DATA", treat it as unknown. Never substitute zero, a heuristic, or an invented number. Report what is missing and what would be needed.
3. REVENUE SCENARIOS (CALCULATOR BINDING): The ACR Calculator Output above is the SINGLE SOURCE OF TRUTH for all revenue figures. Map its COMBINED conservative/base/upside values EXACTLY into the three scenarios' revenueLow/revenueHigh (revenueLow = revenueHigh = the calculator's risk-adjusted combined value; use 0/0 only when the calculator reports INSUFFICIENT_DATA). Do NOT recalculate traffic, buyers, quiz participants, quiz completions, quiz purchases, incremental purchases, RPR, additional repeat buyers, AOV multiplication, realization factors, maturity modifiers, risk buffers, or final revenue opportunity — recompute NOTHING. Cite in each description which calculator paths and benchmark IDs produced the number. If the calculator reports INSUFFICIENT_DATA for a path, the corresponding scenario must state INSUFFICIENT_DATA and the missing inputs.
4. UNVERIFIED BENCHMARKS: Records marked "REQUIRES SOURCE VALIDATION", "STATUS: UNVERIFIED", or historical-only (e.g. BENCHMARK 075 quiz-to-purchase 8/12/18, BENCHMARK 076 90-day RPR 15/20/25) MUST NOT drive quantitative revenue calculations. They may be cited as context ONLY, explicitly labelled [ASM] with a note that the source is unvalidated.
5. Benchmark SELECTION: choose the most applicable record per Section 25 (industry > business model > geography > date > denominator > definition). Never blend records from different sources into one number. Cite the benchmark ID(s) you used.
6. Do NOT treat the benchmark maximum as a target. Do NOT treat the full gap as recoverable. Apply the model rules (realization factors, risk buffers, maturity modifier).
7. If observed performance is already at or above the relevant benchmark, do NOT manufacture a conversion opportunity — shift to retention, AOV, acquisition efficiency, support, CX.
8. Use cautious revenue language: "Estimated incremental revenue opportunity", "Benchmark-based opportunity", "Directional". Never "guaranteed" or "you will make".
9. PROPOSED SOLUTION (when provided): assess fit between the user's proposed solution and the observed evidence. A supported solution goes in "opportunities" with [DRV] + evidence; an unsupported or unevaluatable solution goes in "bottlenecks" with what data would justify it. Never invent evidence to validate a solution.

Return strict JSON with exactly this shape:
{
  "solutionFit": "${input.userType === 'prospect' ? 'Supported | Partially supported | Not supported by current evidence | INSUFFICIENT_DATA' : 'not-applicable'} — solution–evidence verdict citing signals and benchmark IDs",
  "scenarios": [
    { "label": "Conservative", "description": "string — cite benchmark IDs used and state realization/buffer applied; if INSUFFICIENT_DATA say so", "revenueLow": number, "revenueHigh": number },
    { "label": "Base", "description": "same requirements", "revenueLow": number, "revenueHigh": number },
    { "label": "Aggressive", "description": "same requirements", "revenueLow": number, "revenueHigh": number }
  ],
  "growthScore": number,
  "bottlenecks": ["string with [tag], benchmark ID reference, and what is missing if applicable"],
  "opportunities": ["string with [tag], benchmark ID reference"],
  "confidence": "low" | "medium" | "high",
  "summary": "string — state evidence basis and any INSUFFICIENT_DATA conditions",${
    input.userType === 'owner'
      ? `
  "solutionImpact": "1-2 sentences — the business CONSEQUENCE of addressing the primary opportunity: connect the specific evidence → the operating constraint it reveals → what changes for the business if it is addressed. Cite benchmark IDs where used. If the opportunity is INSUFFICIENT_DATA, state what decision the missing data is blocking instead.",
  "priorityChanges": ["2-4 items, ordered most-important-first. Each item names ONE specific change or investigation tied to cited evidence ([OBS]/[BMK]/[ASM]) and why it comes at its position. Generic advice (\"improve marketing\", \"optimize your website\") is forbidden."]`
      : `
  "solutionImpact": "1-2 sentences — the business CONSEQUENCE for the prospect of addressing the primary opportunity: connect the specific evidence → the operating constraint it reveals → what changes if it is addressed. Cite benchmark IDs where used. If the opportunity is INSUFFICIENT_DATA, state what a discovery call must establish instead.",
  "angleOfPitch": "1-2 sentences — connect the proposed solution directly to this prospect's observed evidence and benchmark context: which specific signal makes the solution relevant (or what must be validated first if evidence is insufficient). Never pitch beyond the evidence; if the solution is unsupported, the angle is the discovery question, not the sale."
  `
  }
}
Growth score is 0-100. Revenue ranges are USD estimates, never guarantees. solutionImpact, ${
    input.userType === 'owner' ? 'priorityChanges' : 'angleOfPitch'
  } are premium intelligence: they must connect specific evidence → constraint → implication, and must never be generic.`;
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
      ? obj.priorityChanges.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 4).map((s) => s.slice(0, 300))
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
