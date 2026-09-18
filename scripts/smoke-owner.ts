#!/usr/bin/env node
/** Owner-mode pipeline smoke test — verifies full pipeline shape end-to-end.

Requires a running dev server. Uses a real domain; does NOT write to prod DB
(it posts to the dev server which may persist — run with cleared DB or a
clearly labelled QA token if persistence matters).
*/
export {};

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

interface AnalysisResult {
  solutionImpact?: string | null;
  priorityChanges?: string[] | null;
  angleOfPitch?: string | null;
  scenarios?: Array<{ label: string; revenueLow: number; revenueHigh: number }>;
  growthScore?: number;
  confidence?: string;
  summary?: string;
  bottlenecks?: string[];
  opportunities?: string[];
}

interface ResearchRow {
  domain: string;
  displayName: string;
  brandName: string | null;
  status: string;
  monthlyTraffic: string;
  products: string;
  reviews: string;
  quiz: string;
  revenueOpportunity: string;
  growthAssessment: string;
  analysis: AnalysisResult | null;
}

async function main() {
  let pass = 0;
  let fail = 0;
  function check(name: string, cond: boolean) {
    if (cond) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name}`); }
  }

  console.log(`\n--- Owner-mode smoke test ---\n`);

  const res = await fetch(`${BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userType: 'owner',
      inputs: [
        { url: 'https://gymshark.com', brandName: 'Gymshark', proposedSolution: 'Launch post-purchase email lifecycle' },
      ],
    }),
  });

  const data = await res.json();
  check('POST succeeds', res.ok);
  const research = Array.isArray(data.research) ? data.research : [];
  check('returns 1 row', research.length === 1);

  const row = research[0] as ResearchRow | undefined;
  check('row has domain', typeof row?.domain === 'string' && row.domain.includes('.'));
  check('row has status', ['complete', 'partial', 'error'].includes(row?.status ?? ''));
  check('row has monthlyTraffic string', typeof row?.monthlyTraffic === 'string');
  check('row has products string', typeof row?.products === 'string');
  check('row has reviews string', typeof row?.reviews === 'string');
  check('row has quiz string', typeof row?.quiz === 'string');
  check('row has revenueOpportunity string', typeof row?.revenueOpportunity === 'string');
  check('row has growthAssessment string', typeof row?.growthAssessment === 'string');

  const analysis = row?.analysis;
  if (analysis) {
    check('analysis present', true);
    check('analysis has scenarios', Array.isArray(analysis.scenarios));
    check('analysis has 3 scenarios', Array.isArray(analysis.scenarios) && analysis.scenarios.length === 3);
    check('analysis has growthScore 0-100', typeof analysis.growthScore === 'number' && analysis.growthScore >= 0 && analysis.growthScore <= 100);
    check('analysis has confidence', ['low', 'medium', 'high'].includes(analysis.confidence ?? ''));
    check('analysis has summary', typeof analysis.summary === 'string');
    check('analysis has solutionImpact (owner premium)', typeof analysis.solutionImpact === 'string' && analysis.solutionImpact.length > 0);
    check('analysis has priorityChanges (owner premium)', Array.isArray(analysis.priorityChanges) && analysis.priorityChanges.length > 0);
    // Verify premium fields are NOT empty/free-text-generic.
    const pc = analysis.priorityChanges ?? [];
    check('priorityChanges not generic', pc.some((p) => !/improve your .{0,20}|optimize your .{0,20}|increase .{0,20}|use .{0,20}/i.test(p)));
  } else {
    check('analysis present', false);
  }

  console.log(`\n${pass}/${pass + fail} owner-mode smoke tests passed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Smoke test error:', e.message);
  process.exit(1);
});
