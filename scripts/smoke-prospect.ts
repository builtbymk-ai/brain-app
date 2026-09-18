#!/usr/bin/env node
/** Prospect-mode pipeline smoke test — verifies solutionFit + angleOfPitch.

Requires a running dev server.
*/
export {};

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

interface AnalysisResult {
  solutionFit?: string | null;
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
  brandName: string | null;
  proposedSolution: string | null;
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

  console.log(`\n--- Prospect-mode smoke test ---\n`);

  const res = await fetch(`${BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userType: 'prospect',
      inputs: [
        {
          url: 'https://theordinary.com',
          brandName: 'The Ordinary',
          proposedSolution: 'Implement a post-purchase email lifecycle system that uses customer purchase history and product lifespan to trigger personalized replenishment, support-aware follow-ups, and repeat-purchase messaging.',
        },
      ],
    }),
  });

  const data = await res.json();
  check('POST succeeds', res.ok);
  const research = Array.isArray(data.research) ? data.research : [];
  check('returns 1 row', research.length === 1);

  const row = research[0] as ResearchRow | undefined;
  check('row has domain', typeof row?.domain === 'string' && row.domain.includes('.'));
  check('row has proposedSolution', typeof row?.proposedSolution === 'string' && row.proposedSolution.length > 0);
  check('row has status', ['complete', 'partial', 'error'].includes(row?.status ?? ''));

  const analysis = row?.analysis;
  if (analysis) {
    check('analysis present', true);
    check('analysis has solutionFit (prospect premium)', typeof analysis.solutionFit === 'string' && analysis.solutionFit.length > 0);
    // solutionFit should contain a verdict phrase, not just generic text.
    const sf = analysis.solutionFit ?? '';
    check('solutionFit contains verdict', /supported|not supported|partially|insufficient/i.test(sf));
    check('analysis has angleOfPitch (prospect premium)', typeof analysis.angleOfPitch === 'string' && analysis.angleOfPitch.length > 0);
    // angleOfPitch should reference evidence, not generic pitch.
    const aop = analysis.angleOfPitch ?? '';
    check('angleOfPitch connects to evidence', /evidence|observ|benchmark|discover|validate/i.test(aop));
    check('analysis has scenarios', Array.isArray(analysis.scenarios));
    check('analysis has growthScore 0-100', typeof analysis.growthScore === 'number' && analysis.growthScore >= 0 && analysis.growthScore <= 100);
    check('analysis has confidence', ['low', 'medium', 'high'].includes(analysis.confidence ?? ''));
  } else {
    check('analysis present', false);
  }

  console.log(`\n${pass}/${pass + fail} prospect-mode smoke tests passed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Smoke test error:', e.message);
  process.exit(1);
});
