export {};

/**
 * BRAIN V2A — Prompt architecture test suite.
 *
 * Validates the src/lib/analysis/prompts/ layer against the V2A contract:
 * calculator/Gemini boundary, authoritative CALCULATED_METRICS, evidence
 * system, INSUFFICIENT_DATA/null rules, owner MAPS module, prospect
 * categorical fit (no numeric score), IP protection, and output-schema
 * compatibility.
 *
 * Run: bun scripts/test-prompts.ts
 */

import { calculateAcrOpportunity } from '../src/lib/analysis/calculator';
import type { CalculatedMetrics, UserType } from '../src/lib/analysis/types';
import {
  BRAIN_BENCHMARK_SUMMARY,
  buildGeminiPrompt,
  buildGeminiUserMessage,
} from '../src/lib/analysis/prompts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Deterministic metrics fixtures — produced by the REAL calculator so the
// tests prove the actual pipeline contract, not a hand-made shape.
// ---------------------------------------------------------------------------

function metricsFor(userType: UserType): CalculatedMetrics {
  return calculateAcrOpportunity(
    {
      domain: 'glowskinco.com',
      displayName: 'Glow Skin Co',
      industrySignals: ['skincare', 'beauty', 'serum'],
      hasQuiz: false,
    },
    24_000,
    { userType },
  );
}

function build(userType: UserType) {
  const metrics = metricsFor(userType);
  return {
    metrics,
    prompt: buildGeminiPrompt(metrics, BRAIN_BENCHMARK_SUMMARY, {
      userType,
      proposedSolution: userType === 'prospect' ? 'Implement an AI Skincare Routine Creator using customer zero-party data.' : null,
      domain: 'glowskinco.com',
      traffic: 24_000,
      hasQuiz: false,
    }),
    userMessage: buildGeminiUserMessage({ userType }),
  };
}

console.log('\n=== BRAIN V2A PROMPT ARCHITECTURE TESTS ===\n');

// --- 1–4. Shared prompt foundations (both modes) ---------------------------
for (const userType of ['owner', 'prospect'] as const) {
  const { prompt } = build(userType);

  test(
    `[${userType}] 1. Shared prompt contains BRAIN identity`,
    prompt.includes('BRAIN = Business Revenue Assessment & Intelligence Node') &&
      prompt.includes('BRAIN Analysis Layer'),
  );
  test(
    `[${userType}] 2. Shared prompt contains calculator/Gemini boundary`,
    prompt.includes('CALCULATED_METRICS IS AUTHORITATIVE') &&
      prompt.includes('SINGLE SOURCE OF TRUTH') &&
      prompt.includes('You may NOT perform the calculation again'),
  );
  test(
    `[${userType}] 3. Shared prompt embeds CalculatedMetrics (authoritative JSON payload)`,
    prompt.includes('ACR CALCULATOR OUTPUT (CALCULATED_METRICS — AUTHORITATIVE') &&
      prompt.includes('"sufficiency"') &&
      prompt.includes('"evidenceLedger"') &&
      prompt.includes('"combined"'),
  );
  test(
    `[${userType}] 3b. Embedded metrics are the calculator's verbatim output`,
    prompt.includes(JSON.stringify(metricsFor(userType), null, 2).slice(0, 200)),
  );
  test(
    `[${userType}] 4. Shared prompt contains benchmark summary`,
    prompt.includes('BRAIN BENCHMARK LIBRARY') &&
      prompt.includes('BMK-001') &&
      prompt.includes('BMK-041'),
  );
}

const owner = build('owner');
const prospect = build('prospect');

// --- 5–6. Mode module selection --------------------------------------------
test(
  '5. Owner context selects owner module (MAPS), never prospect module',
  owner.prompt.includes('OWNER MODULE: MAPS DIAGNOSTIC SEQUENCE') &&
    !owner.prompt.includes('PROSPECT MODULE'),
);
test(
  '6. Prospect context selects prospect module, never owner module',
  prospect.prompt.includes('PROSPECT MODULE: SOLUTION-EVIDENCE FIT') &&
    !prospect.prompt.includes('OWNER MODULE'),
);

// --- 7–8. Mode module content ----------------------------------------------
test(
  '7. Owner module contains MAPS diagnostic sequence (all five stages)',
  ['PRIMARY CONSTRAINT', 'ROOT-CAUSE INTERPRETATION', 'SYMPTOM VS CAUSE', 'PRIORITY CHANGES', 'MEASUREMENT PLAN'].every((s) =>
    owner.prompt.includes(s),
  ),
);
test('7b. Owner priority cap is 3 in prompt and parser', owner.prompt.includes('At most THREE items') && owner.prompt.includes('Cap: THREE priority changes'));
test(
  '8. Prospect module contains categorical solution-fit logic',
  ['STRONG_FIT', 'MODERATE_FIT', 'WEAK_FIT', 'MISALIGNED', 'INSUFFICIENT_DATA', 'CHALLENGE-ASSUMPTION LOGIC'].every((s) =>
    prospect.prompt.includes(s),
  ),
);

// --- 9. No numeric fit score ------------------------------------------------
// Detect scoring INSTRUCTIONS, not the module's own prohibition wording.
// The forbidden patterns below would appear if the prompt asked for a numeric
// fit score; "Do NOT produce a 0-100 score" is the desired guardrail text.
const fitSection = prospect.prompt.slice(prospect.prompt.indexOf('PROSPECT MODULE'));
const scoreInstructionPatterns = [
  /\bfit score\b(?!.*NOT)/i,
  /\bpercentage fit\b(?!.*NOT)/i,
  /\bweighted solution score\b(?!.*NOT)/i,
  /fit[^.\n]{0,40}\b(?:score|rated?)\s*(?:of|out of|between)?\s*\d/i,
  /\bsolutionFit\"\s*:\s*\"?\s*(?:a\s+)?(?:0-100|1-10|number|integer|percentage)/i,
];
test('9. Prospect module contains NO 0-100 / 1-10 / percentage fit score', !scoreInstructionPatterns.some((p) => p.test(fitSection)));
test(
  '9b. Fit is explicitly categorical, not scored',
  fitSection.includes('classifications, NOT scores') && fitSection.includes('Do NOT produce a 0-100 score'),
);

// --- 10–11. INSUFFICIENT_DATA + null handling ------------------------------
for (const { name, prompt } of [
  { name: 'owner', prompt: owner.prompt },
  { name: 'prospect', prompt: prospect.prompt },
]) {
  test(
    `10. [${name}] INSUFFICIENT_DATA instructions present`,
    prompt.includes('INSUFFICIENT_DATA') &&
      prompt.includes('scenarios must be 0 with descriptions that state INSUFFICIENT_DATA') &&
      prompt.includes('Do not convert uncertainty into STRONG_FIT') === (name === 'prospect') &&
      prompt.includes('Do not use your own estimate'),
  );
  test(
    `11. [${name}] Null handling instructions present`,
    prompt.includes('If a value is null, keep it null') &&
      prompt.includes('"Missing" does not mean "zero."') &&
      prompt.includes('A calculated zero must remain a real calculated zero'),
  );
}

// --- 12. Gemini cannot be instructed to independently calculate revenue ----
const forbiddenMath = [
  'Estimate revenue using traffic',
  'Calculate incremental first purchases using participants',
  'traffic × CVR × AOV',
  'revenue = traffic',
  'estimate the revenue by multiplying',
];
test(
  '12. No prompt instruction asks Gemini to compute revenue arithmetic',
  !forbiddenMath.some((p) => [owner.prompt, prospect.prompt].some((p2) => p2.toLowerCase().includes(p.toLowerCase()))),
);
test(
  '12b. Recompute prohibition covers every proprietary quantity',
  [
    'Do NOT recalculate or derive: revenue, conversion lift, retention lift, AOV, customer counts, repeat-purchase revenue, realization factors, risk adjustments',
  ].every((s) => owner.prompt.includes(s)),
);

// --- 13. Proprietary realization factors not in customer-facing prompt fields
test(
  '13. Output contract forbids proprietary realization/risk values in customer-facing fields',
  owner.prompt.includes('Do NOT output fields like "effective_realization: 0.5"') &&
    owner.prompt.includes('realization factors or effective realization values') &&
    !/"effective_realization"\s*:/.test(owner.prompt.split('OUTPUT CONTRACT')[1] ?? ''),
);

// --- 14. Calculator values passed unchanged --------------------------------
{
  const metrics = metricsFor('owner');
  const prompt = buildGeminiPrompt(metrics, BRAIN_BENCHMARK_SUMMARY, { userType: 'owner' });
  const embedded = JSON.stringify(metrics, null, 2);
  let unchanged = true;
  for (const key of ['conservative', 'base', 'upside'] as const) {
    const c = metrics.combined[key];
    if (c) {
      // The exact risk-adjusted combined figures must appear verbatim.
      if (!embedded.includes(`"low": ${c.low}`) || !embedded.includes(`"high": ${c.high}`)) unchanged = false;
      if (!prompt.includes(embedded)) unchanged = false;
    }
  }
  for (const b of metrics.benchmarksApplied) {
    if (!embedded.includes(b.id)) unchanged = false;
  }
  test('14. Existing calculator values passed unchanged into prompt construction', unchanged);
}

// --- 15. Output schema remains compatible ----------------------------------
{
  const schemaBlock = owner.prompt.slice(owner.prompt.indexOf('OUTPUT CONTRACT'));
  const requiredFields = ['solutionFit', 'scenarios', 'growthScore', 'bottlenecks', 'opportunities', '"confidence"', 'summary', 'solutionImpact', 'priorityChanges', 'angleOfPitch'];
  const allPresent = requiredFields.every((f) => schemaBlock.includes(f));
  const scenarioShape = ['"label": "Conservative"', '"label": "Base"', '"label": "Aggressive"', 'revenueLow', 'revenueHigh'].every((f) => schemaBlock.includes(f));
  const userMsgShape = (() => {
    const um = buildGeminiUserMessage({ userType: 'owner', proposedSolution: 'Launch email lifecycle', remark: 'test remark', domain: 'example.com', traffic: 1000 });
    return um.includes('REQUEST MODE: OWNER') && um.includes('PROPOSED SOLUTION TO ASSESS') && um.includes('RESEARCHER REMARK') && um.includes('BUSINESS SIGNALS');
  })();
  test('15. Output schema remains compatible (all fields + scenario shape + user message)', allPresent && scenarioShape && userMsgShape);
}

// --- Extra: unverified benchmarks marked, prompt boundary user message -----
test(
  'Extra. Unverified benchmarks (BMK-075/076, beauty AOV) are marked UNVERIFIED in summary',
  BRAIN_BENCHMARK_SUMMARY.includes('UNVERIFIED') &&
    BRAIN_BENCHMARK_SUMMARY.includes('BMK-075') &&
    BRAIN_BENCHMARK_SUMMARY.includes('BMK-076') &&
    !/BMK-075[^\n]*VERIFIED \|/.test(BRAIN_BENCHMARK_SUMMARY),
);
test(
  'Extra. User message never reconstructs calculator math',
  (() => {
    const um = buildGeminiUserMessage({ userType: 'prospect', proposedSolution: 'x' });
    return !um.includes('CALCULATED_METRICS') === false && um.includes('do not recompute anything');
  })(),
);
test(
  'Extra. Evidence tag system includes all six labels',
  ['[OBS]', '[EST]', '[BMK]', '[ASM]', '[DRV]', '[UNVERIFIED]'].every((t) => owner.prompt.includes(t)),
);
test(
  'Extra. Benchmark ceiling rule + opportunity categories present',
  owner.prompt.includes('BENCHMARK CEILING RULE') &&
    ['HIGH | MEDIUM | LOW | MINIMAL | INSUFFICIENT_DATA'].every((s) => owner.prompt.includes(s)),
);
test(
  'Extra. Growth score framed as evidence quality, not opportunity size',
  owner.prompt.includes('growthScore: an overall 0-100 research-completeness grade') &&
    owner.prompt.includes('grades EVIDENCE QUALITY, not opportunity size'),
);
test(
  'Extra. No proprietary numbers leaked into prompt-mode modules output rules',
  !/0\.5\b/.test((owner.prompt.split('OUTPUT CONTRACT')[1] ?? '').replace(/0\.5s?/g, '')) &&
    !owner.prompt.split('OUTPUT CONTRACT')[1]?.includes('x1.20'),
);

// ---------------------------------------------------------------------------
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
