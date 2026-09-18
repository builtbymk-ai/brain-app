/**
 * BRAIN QA — live pipeline harness (QA items 1, 2, 5, 9, 10, 19).
 *
 * Runs the real research pipeline (Firecrawl → Apify → Apollo → SerpAPI →
 * ACR calculator → Gemini) directly — NO database writes, no server needed.
 * Writes each completed result to .qa/<slug>-<mode>.json so partial progress
 * survives a command timeout.
 *
 * Usage:
 *   bun scripts/qa-live.ts owner              # 5-domain owner-mode batch
 *   bun scripts/qa-live.ts prospect-good      # replenishment solution (fit)
 *   bun scripts/qa-live.ts prospect-bad       # unsupported quiz-funnel pitch
 */

import { researchBusiness } from '../src/lib/research/engine';
import { calculateAcrOpportunity } from '../src/lib/analysis/calculator';
import { parseTrafficEstimateTestable } from '../src/lib/research/test-utils';
import { writeFileSync, mkdirSync } from 'node:fs';
import { toNumber } from '../src/lib/research/signals';

const OUT_DIR = '.qa';
mkdirSync(OUT_DIR, { recursive: true });

const OWNER_DOMAINS: Array<{ name: string; url: string }> = [
  { name: 'theordinary', url: 'theordinary.com' }, // beauty — substantial public info
  { name: 'gymshark', url: 'gymshark.com' }, // apparel
  { name: 'allbirds', url: 'allbirds.com' }, // general DTC
  { name: 'chomps', url: 'chomps.com' }, // smaller/less-known
  { name: 'deathwishcoffee', url: 'deathwishcoffee.com' }, // general DTC/food
];

const REPLENISHMENT_SOLUTION =
  'Implement a post-purchase email lifecycle system that uses customer purchase history and product lifespan to trigger personalized replenishment, support-aware follow-ups, and repeat-purchase messaging.';

const QUIZ_SOLUTION =
  'Implement a skincare-style product-recommendation quiz funnel that qualifies visitors and converts them into first-time buyers.';

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    const result = await Promise.race([p, timeout]);
    if (result === null) {
      console.log(`  TIMEOUT ${label} after ${ms / 1000}s`);
      return null;
    }
    return result as T;
  } catch (error) {
    console.log(`  ERROR ${label}: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Recompute the calculator exactly as engine.ts does, for the defect check. */
function recomputeCalculated(r: NonNullable<Awaited<ReturnType<typeof researchBusiness>>>) {
  const industrySignals: string[] = [
    ...(r.rawSignals?.website ?? []).map((s) => s.value),
  ];
  const hasQuiz = r.quiz === 'Present' ? true : r.quiz === 'Not found' ? false : null;
  return calculateAcrOpportunity(
    { domain: r.domain, displayName: r.displayName, industrySignals, hasQuiz },
    parseTrafficEstimateTestable(r.monthlyTraffic),
    { userType: 'owner' }
  );
}

function tagAudit(text: string): { obs: number; bmk: number; asm: number; drv: number } {
  return {
    obs: (text.match(/\[OBS\]/gi) ?? []).length,
    bmk: (text.match(/\[BMK/gi) ?? []).length,
    asm: (text.match(/\[ASM\]/gi) ?? []).length,
    drv: (text.match(/\[DRV\]/gi) ?? []).length,
  };
}

async function runOne(mode: string, entry: { name: string; url: string }, solution?: string) {
  const label = `${entry.name}-${mode}`;
  console.log(`\n=== ${label}: ${entry.url}${solution ? ' (solution supplied)' : ''} ===`);
  const result = await withTimeout(
    researchBusiness({ url: entry.url, brandName: entry.name, proposedSolution: solution, userType: mode === 'owner' ? 'owner' : 'prospect' }),
    300_000,
    label
  );

  if (!result) {
    console.log(`  NO RESULT for ${label}`);
    return;
  }

  // Defect check: Gemini's numbers must equal the calculator's.
  const calc = recomputeCalculated(result);
  const base = result.analysis?.scenarios.find((s) => s.label === 'Base');
  const calcBase = calc.combined.base?.low ?? null;
  const geminiBase = base && (base.revenueLow !== 0 || base.revenueHigh !== 0) ? base.revenueLow : null;
  const numbersMatch =
    calcBase === null && geminiBase === null
      ? true
      : calcBase !== null && geminiBase !== null
        ? Math.abs(calcBase - geminiBase) <= 1
        : false;

  const allTags = JSON.stringify(result.analysis);
  const tags = tagAudit(allTags);

  const audit = {
    label,
    domain: result.domain,
    status: result.status,
    monthlyTraffic: result.monthlyTraffic,
    products: result.products,
    reviews: result.reviews,
    quiz: result.quiz,
    revenueOpportunity: result.revenueOpportunity,
    growthAssessment: result.growthAssessment,
    analysisSource: result.analysis?.analysisSource ?? 'none',
    confidence: result.analysis?.confidence ?? null,
    solutionFit: result.analysis?.solutionFit ?? null,
    scenarios: result.analysis?.scenarios ?? [],
    bottlenecks: result.analysis?.bottlenecks ?? [],
    opportunities: result.analysis?.opportunities ?? [],
    summary: result.analysis?.summary ?? '',
    calculatorCheck: {
      calcBaseCombined: calcBase,
      calcSufficiency: calc.sufficiency.status,
      calcMissing: calc.sufficiency.missingInputs,
      calcPrimary: calc.opportunity.primary,
      calcIndustry: calc.inputs.industry,
      calcAovBasis: calc.inputs.aov.basis,
      geminiBaseRevenue: geminiBase,
      numbersMatch,
      DEFECT_IF_FALSE: !numbersMatch,
    },
    evidenceTagCounts: tags,
  };

  writeFileSync(`${OUT_DIR}/${slug(label)}.json`, JSON.stringify(audit, null, 2));

  console.log(`  status=${result.status} traffic="${result.monthlyTraffic}" products="${result.products}" reviews="${result.reviews}" quiz="${result.quiz}"`);
  console.log(`  revenue="${result.revenueOpportunity}" growth="${result.growthAssessment}" source=${audit.analysisSource} confidence=${audit.confidence}`);
  if (audit.solutionFit) console.log(`  solutionFit="${audit.solutionFit}"`);
  console.log(`  calculator: industry=${calc.inputs.industry} aov=${calc.inputs.aov.basis} sufficiency=${calc.sufficiency.status} baseCombined=${calcBase}`);
  console.log(`  DEFECT CHECK (Gemini==Calculator): ${numbersMatch ? 'MATCH' : 'MISMATCH ← defect'}`);
  console.log(`  evidence tags: ${JSON.stringify(tags)}`);
}

async function main() {
  const batch = process.argv[2] ?? 'owner';
  const only = process.argv[3]; // optional: run a single named domain

  if (batch === 'owner') {
    const list = only ? OWNER_DOMAINS.filter((d) => d.name === only) : OWNER_DOMAINS;
    for (const entry of list) {
      await runOne('owner', entry);
    }
  } else if (batch === 'prospect-good') {
    await runOne('prospect', { name: 'theordinary', url: 'theordinary.com' }, REPLENISHMENT_SOLUTION);
  } else if (batch === 'prospect-bad') {
    await runOne('prospect', { name: 'gymshark', url: 'gymshark.com' }, QUIZ_SOLUTION);
  } else {
    console.error('Unknown batch. Use: owner | prospect-good | prospect-bad');
    process.exit(1);
  }

  console.log(`\n=== BATCH ${batch} COMPLETE ===`);
}

main();
