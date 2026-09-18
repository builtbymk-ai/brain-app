/**
 * BRAIN prompt builder — single entry point for the Gemini analysis layer.
 *
 * Composes:
 *   buildSharedPrompt(metrics, benchmarkSummary)  — identity, boundary,
 *     evidence system, null rules, ACR framework, output contract,
 *     CALCULATED_METRICS payload, curated benchmark library
 *   + owner or prospect module (per user type)
 *
 * CalculatedMetrics MUST be fully assembled by calculator.ts BEFORE this
 * builder runs — the prompt embeds it verbatim via JSON.stringify.
 */

import type { CalculatedMetrics, UserType } from '../types';
import { buildSharedPrompt } from './shared';
import { buildOwnerModule } from './owner';
import { buildProspectModule } from './prospect';

export { BRAIN_BENCHMARK_SUMMARY } from './benchmark-summary';
export { buildSharedPrompt } from './shared';
export { buildOwnerModule } from './owner';
export { buildProspectModule } from './prospect';

/** Context required to build mode-specific prompts and the user message. */
export interface PromptContext {
  /** Canonical application user type: 'owner' | 'prospect' (never changed). */
  userType: UserType;
  /** User-supplied proposed solution (prospect mode; optional in owner mode). */
  proposedSolution?: string | null;
  /** Optional free-text remark from the researcher. */
  remark?: string | null;
  /** Observed research signals for user-message context. These are
   *  interpretation context — the authoritative arithmetic lives only in
   *  CalculatedMetrics (embedded in the system prompt). */
  domain?: string | null;
  brandName?: string | null;
  traffic?: number | null;
  products?: number | null;
  reviews?: number | null;
  followerEstimate?: number | null;
  employeeCount?: number | null;
  hasQuiz?: boolean | null;
}

/**
 * Build the complete Gemini system prompt.
 *
 * 1. Shared BRAIN analysis architecture (with authoritative metrics).
 * 2. Correct mode module appended per user type.
 */
export function buildGeminiPrompt(
  metrics: CalculatedMetrics,
  benchmarkSummary: string,
  context: PromptContext,
): string {
  const shared = buildSharedPrompt(metrics, benchmarkSummary);
  const modeModule =
    context.userType === 'owner' ? buildOwnerModule() : buildProspectModule();
  return `${shared}\n${modeModule}`;
}

/**
 * Build the Gemini user message: the per-business request context.
 * Contains user-type-specific framing WITHOUT reconstructing the
 * calculator's mathematics (CALCULATED_METRICS lives in the system prompt).
 */
export function buildGeminiUserMessage(context: PromptContext): string {
  const lines: string[] = [];

  if (context.userType === 'owner') {
    lines.push(
      'REQUEST MODE: OWNER — the requester runs or operates this business. Produce an internal decision document: what the evidence says about where the business stands across Acquisition / Conversion / Retention (ACR), which constraint deserves attention first, and what decision this research should inform next. Business outcome before any tool, tactic or vendor. Do not pitch services. Keep revenue language cautious.',
    );
  } else {
    lines.push(
      'REQUEST MODE: PROSPECT — the requester is researching this business as a potential client and has proposed a solution to deliver. Produce a solution-evidence fit assessment: a categorical verdict, the evidence behind it, and an angle of pitch that opens a defensible business conversation. Never endorse a solution the evidence does not support.',
    );
  }

  const signal = (v: number | boolean | string | null | undefined, missing: string): string =>
    v === null || v === undefined || v === '' ? missing : String(v);

  lines.push(
    [
      'BUSINESS SIGNALS (observed research context — interpret these; the authoritative numbers live in CALCULATED_METRICS):',
      `Business domain: ${signal(context.domain, 'Not found')}`,
      context.brandName ? `Brand name (user-supplied): ${context.brandName}` : null,
      `Estimated monthly visits: ${signal(context.traffic ?? null, 'INSUFFICIENT_DATA')}`,
      `Product/storefront markers found: ${signal(context.products ?? null, 'Not found')}`,
      `Reviews found: ${signal(context.reviews ?? null, 'Not found')}`,
      `Combined social followers: ${signal(context.followerEstimate ?? null, 'Not found')}`,
      `Estimated employees: ${signal(context.employeeCount ?? null, 'Not found')}`,
      `Quiz/interactive element present: ${
        context.hasQuiz === null || context.hasQuiz === undefined
          ? 'Not found'
          : context.hasQuiz
            ? 'yes'
            : 'no'
      }`,
    ]
      .filter((l): l is string => l !== null)
      .join('\n'),
  );

  if (context.proposedSolution && context.proposedSolution.trim()) {
    lines.push(
      `PROPOSED SOLUTION TO ASSESS (user-supplied):\n"${context.proposedSolution.trim()}"`,
    );
  }

  if (context.remark && context.remark.trim()) {
    lines.push(`RESEARCHER REMARK: ${context.remark.trim()}`);
  }

  lines.push(
    'Respond with the strict JSON object defined in the OUTPUT CONTRACT. All arithmetic already appears in CALCULATED_METRICS — interpret it; do not recompute anything.',
  );

  return lines.join('\n\n');
}
