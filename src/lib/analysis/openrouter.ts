/**
 * OpenRouter secondary AI provider for BRAIN analysis.
 *
 * Used only when all Gemini models fail. Same prompt, same validation —
 * no separate calculator, no separate ACR formulas.
 *
 * Two models are supported via environment variables:
 *  - OPENROUTER_PRIMARY_MODEL: Ling 3.0 Flash Fin (supports JSON-schema structured output)
 *  - OPENROUTER_FALLBACK_MODEL: Inkling (no JSON-schema enforcement; prompt-instructed)
 */

import { env } from '../env';
import { UserType } from './types';
import type { AnalysisResult, Scenario } from '../research/types';
import { toNumber } from '../research/signals';
import type { AggregateInput } from './gemini';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------

/**
 * BRAIN output JSON schema — used for Ling's `response_format` parameter.
 * Matches the shape produced by buildPrompt() in gemini.ts.
 */
function brainJsonSchema(userType: UserType): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: 'object',
    properties: {
      solutionFit: { type: ['string', 'null'] },
      scenarios: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            description: { type: 'string' },
            revenueLow: { type: 'number' },
            revenueHigh: { type: 'number' },
          },
          required: ['label', 'description', 'revenueLow', 'revenueHigh'],
        },
      },
      growthScore: { type: 'number' },
      bottlenecks: { type: 'array', items: { type: 'string' } },
      opportunities: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      summary: { type: 'string' },
      solutionImpact: { type: ['string', 'null'] },
    },
    required: [
      'solutionFit',
      'scenarios',
      'growthScore',
      'bottlenecks',
      'opportunities',
      'confidence',
      'summary',
      'solutionImpact',
    ],
  };

  if (userType === 'owner') {
    (base.properties as Record<string, unknown>).priorityChanges = {
      type: ['array', 'null'],
      items: { type: 'string' },
    };
    (base.required as string[]).push('priorityChanges');
  } else {
    (base.properties as Record<string, unknown>).angleOfPitch = {
      type: ['string', 'null'],
    };
    (base.required as string[]).push('angleOfPitch');
  }

  return base;
}

// ---------------------------------------------------------------------------

interface OpenRouterProvider {
  /** Environment variable for the API key. */
  envKey: string | null;
  /** Environment variable for the model ID. */
  envModel: string | null;
  /** Model display name for analysisSource. */
  label: string;
  /** Whether this model supports native JSON-schema structured output. */
  supportsStructuredOutput: boolean;
}

/**
 * Provider chain — ordered by preference. Each provider is only attempted
 * if all preceding providers have failed.
 */
function getOpenRouterProviders(): OpenRouterProvider[] {
  return [
    {
      envKey: env.openrouterKey,
      envModel: env.openrouterPrimaryModel,
      label: 'openrouter/primary',
      // Ling 3.0 Flash Fin supports response_format: json_object (JSON mode)
      // but NOT structured_outputs with json_schema enforcement.
      // Use JSON mode so the model wraps output in valid JSON;
      // schema validation happens in parseOpenRouterJson/validateAndNormalize.
      supportsStructuredOutput: false,
    },
    {
      envKey: env.openrouterKey,
      envModel: env.openrouterFallbackModel,
      label: 'openrouter/fallback',
      supportsStructuredOutput: false,
    },
  ];
}

// ---------------------------------------------------------------------------

/**
 * Attempt OpenRouter analysis. Returns null on total failure so the caller
 * can fall through to deterministic fallback.
 */
export async function runOpenRouterAnalysis(
  prompt: string,
  userType: UserType,
): Promise<{ result: AnalysisResult; source: string } | null> {
  const providers = getOpenRouterProviders();

  for (const provider of providers) {
    if (!provider.envKey || !provider.envModel) {
      // Provider not configured — skip silently.
      continue;
    }

    const sourceLabel = `openrouter/${provider.envModel}`;

    try {
      const rawText = await callOpenRouterModel(
        provider.envKey,
        provider.envModel,
        prompt,
        provider.supportsStructuredOutput,
        userType,
      );

      if (!rawText) continue;

      // Parse JSON (Inkling may wrap in markdown fences)
      const parsed = parseOpenRouterJson(rawText);
      if (!parsed) {
        console.warn(
          `BRAIN OpenRouter analysis: ${sourceLabel} returned unparseable JSON, trying next provider`,
        );
        continue;
      }

      // Validate against the same schema as Gemini
      const validated = validateAndNormalize(parsed, userType);
      if (!validated) {
        console.warn(
          `BRAIN OpenRouter analysis: ${sourceLabel} returned schema-invalid output, trying next provider`,
        );
        continue;
      }

      // Set source tracking — must NOT say "gemini" for OpenRouter output.
      validated.analysisSource = sourceLabel;

      return { result: validated, source: sourceLabel };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      console.warn(
        `BRAIN OpenRouter analysis: ${sourceLabel} failed (${message}), trying next provider`,
      );
    }
  }

  console.warn('BRAIN OpenRouter analysis: all OpenRouter providers failed');
  return null;
}

// ---------------------------------------------------------------------------

/**
 * Call a single OpenRouter model and return raw text output.
 *
 * Ling 3.0 Flash Fin: uses `response_format` for structured JSON output.
 * Inkling: prompt-instructed only; no `response_format` support.
 */
async function callOpenRouterModel(
  apiKey: string,
  model: string,
  prompt: string,
  supportsStructuredOutput: boolean,
  userType: UserType,
): Promise<string | null> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 2048,
  };

  // Models with structured output support use response_format json_schema.
  // Models without structured output (like Ling) rely on prompt instruction
  // to produce valid JSON — we validate and parse it ourselves.
  if (supportsStructuredOutput) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'brain_analysis',
        strict: true,
        schema: brainJsonSchema(userType),
      },
    };
  }
  // else: no response_format — prompt instructs JSON output, we validate.

  const response = await fetch(OPENROUTER_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-HTTP-Method-Override': 'POST',
      'HTTP-Referer': 'https://brain-ai.app',
      'X-Title': 'BRAIN Analysis',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const errorMsg =
      (errorBody as { error?: { message?: string } }).error?.message?.slice(
        0,
        140,
      ) ?? 'unknown';
    console.warn(
      `BRAIN OpenRouter analysis: ${model} HTTP ${response.status} (${errorMsg})`,
    );
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  const content = data?.choices?.[0]?.message?.content;
  return content ?? null;
}

// ---------------------------------------------------------------------------

/**
 * Parse JSON from an OpenRouter model response.
 * Handles markdown-fence-wrapped responses (common with Inkling).
 */
function parseOpenRouterJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------

/**
 * Validate and normalize parsed OpenRouter output against BRAIN's schema.
 *
 * Rules:
 *  - Required fields must exist
 *  - Scenarios array must have Conservative/Base/Aggressive
 *  - revenueLow/revenueHigh must be non-negative numbers
 *  - Owner mode must have priorityChanges; prospect must have angleOfPitch
 *  - Owner mode must NOT have angleOfPitch; prospect must NOT have priorityChanges
 *  - solutionFit must only be populated in prospect mode
 *
 * Returns null if validation fails — the caller should continue the fallback chain.
 */
function validateAndNormalize(
  obj: Record<string, unknown>,
  userType: UserType,
): AnalysisResult | null {
  // --- Core fields ---
  if (!Array.isArray(obj.scenarios) || obj.scenarios.length !== 3) return null;

  const scenarioLabels = ['Conservative', 'Base', 'Aggressive'] as const;

  const scenarios: Scenario[] = scenarioLabels.map((label) => {
    const found = (
      obj.scenarios as Array<Record<string, unknown>>
    ).find((s) => s.label === label);
    return {
      label,
      description:
        typeof found?.description === 'string' ? found.description : '',
      revenueLow: Math.max(0, toNumber(found?.revenueLow) ?? 0),
      revenueHigh: Math.max(0, toNumber(found?.revenueHigh) ?? 0),
    };
  });

  // Guardrail: zero scenarios normalized with INSUFFICIENT_DATA tag
  const allZero = scenarios.every(
    (s) => s.revenueLow === 0 && s.revenueHigh === 0,
  );
  if (allZero) {
    for (const s of scenarios) {
      if (!/INSUFFICIENT_DATA/i.test(s.description)) {
        s.description = `[ASM] Revenue scenarios: INSUFFICIENT_DATA — required inputs were unavailable. ${s.description}`.trim();
      }
    }
  }

  const growthScore = clamp(toNumber(obj.growthScore) ?? 0, 0, 100);
  const bottlenecks = Array.isArray(obj.bottlenecks)
    ? obj.bottlenecks.map(String).slice(0, 8)
    : [];
  const opportunities = Array.isArray(obj.opportunities)
    ? obj.opportunities.map(String).slice(0, 8)
    : [];
  const confidence = (
    ['low', 'medium', 'high'] as const
  ).includes(obj.confidence as 'low' | 'medium' | 'high')
    ? (obj.confidence as AnalysisResult['confidence'])
    : 'low';
  const summary = typeof obj.summary === 'string' ? obj.summary : '';

  // --- Premium fields (mode-scoped) ---

  let solutionImpact: string | null = null;
  if (
    typeof obj.solutionImpact === 'string' &&
    obj.solutionImpact.trim().length > 0
  ) {
    solutionImpact = obj.solutionImpact.trim().slice(0, 600);
  }

  let priorityChanges: string[] | null = null;
  if (userType === 'owner') {
    if (Array.isArray(obj.priorityChanges)) {
      priorityChanges = obj.priorityChanges
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((s) => s.slice(0, 300));
    }
    // Prospect-only fields are discarded in owner mode
    const _angleOfPitch = obj.angleOfPitch;
    void _angleOfPitch;
  }

  let angleOfPitch: string | null = null;
  if (userType === 'prospect') {
    if (
      typeof obj.angleOfPitch === 'string' &&
      obj.angleOfPitch.trim().length > 0
    ) {
      angleOfPitch = obj.angleOfPitch.trim().slice(0, 600);
    }
    // Owner-only fields are discarded in prospect mode
    const _priorityChanges = obj.priorityChanges;
    void _priorityChanges;
  }

  // solutionFit: only in prospect mode
  const solutionFit =
    userType === 'prospect' && typeof obj.solutionFit === 'string'
      ? obj.solutionFit.slice(0, 240)
      : null;

  // --- Schema validation gate ---
  // Required fields for all modes
  if (
    !summary ||
    growthScore < 0 ||
    growthScore > 100 ||
    confidence === undefined
  ) {
    return null;
  }

  // Owner mode: solutionImpact + priorityChanges are required
  if (userType === 'owner') {
    if (!solutionImpact || !priorityChanges || priorityChanges.length === 0) {
      console.warn(
        'BRAIN OpenRouter: owner mode validation failed — missing solutionImpact or priorityChanges',
      );
      return null;
    }
  }

  // Prospect mode: solutionFit + angleOfPitch are required
  if (userType === 'prospect') {
    if (!solutionFit || !angleOfPitch) {
      console.warn(
        'BRAIN OpenRouter: prospect mode validation failed — missing solutionFit or angleOfPitch',
      );
      return null;
    }
  }

  return {
    solutionFit,
    scenarios,
    growthScore,
    bottlenecks,
    opportunities,
    confidence,
    summary,
    solutionImpact,
    priorityChanges,
    angleOfPitch,
  };
}

// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
