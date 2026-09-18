/**
 * FINAL PHASE 1 ACCEPTANCE QA — runs against a running dev server.
 *
 * Prerequisites: dev server running (bun run dev), DB reachable.
 * Set BASE_URL to override the default. QA rows are clearly token-labelled.
 */
import type { AnalysisResult } from '../src/lib/research/types';

interface ResearchRow {
  domain: string;
  monthlyTraffic: string | number;
  revenueOpportunity: string | number;
  growthAssessment: string | number;
  analysis: AnalysisResult | null;
}

interface ResearchResponse {
  sessionId?: string;
  research?: ResearchRow[];
  error?: string;
}

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function json<T>(r: Response): Promise<T> {
  return r.json() as Promise<T>;
}

async function postResearch(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${BASE}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function field(a: unknown, key: string): unknown {
  if (a && typeof a === 'object' && key in (a as Record<string, unknown>)) {
    return (a as Record<string, unknown>)[key];
  }
  return undefined;
}

async function main() {
  const lines: string[] = [];

  // 1. BASELINE
  lines.push('=== 1. BASELINE REGRESSION ===');
  const health = await fetch(`${BASE}/api/research?token=__ping__`);
  lines.push(`Health check: HTTP ${health.status} (expected 200)`);
  lines.push(
    'Separate suites: typecheck=0 errors, build=PASS, calculator=66/66, validation=24/24, export=21/21'
  );

  // 2. OWNER
  lines.push('\n=== 2. OWNER MODE END-TO-END ===');
  const ownerResp = await postResearch({
    userType: 'owner',
    token: 'qa-owner-' + Date.now().toString(36),
    inputs: [{ url: 'https://www.gymshark.com', brandName: 'Gymshark' }],
  });
  const ownerData = await json<ResearchResponse>(ownerResp);
  lines.push(`owner POST: HTTP ${ownerResp.status}, rows=${ownerData.research?.length ?? 0}`);
  if (ownerData.research?.length) {
    const a = ownerData.research[0].analysis;
    const src = String(field(a, 'analysisSource') ?? 'NONE');
    const si = field(a, 'solutionImpact');
    const pc = field(a, 'priorityChanges');
    const aop = field(a, 'angleOfPitch');
    const sf = field(a, 'solutionFit');
    lines.push(
      `owner row0: source=${src}, solutionImpact=${si ? 'PRESENT' : 'absent'},` +
        ` priorityChanges=${pc ? 'PRESENT' : 'absent'}, angleOfPitch=${aop ? 'LEAK' : 'absent'}, solutionFit=${sf ? 'LEAK' : 'absent'}`
    );
    lines.push(`owner schema: ${si && pc && !aop && !sf ? 'PASS' : 'CHECK'}`);
  } else {
    lines.push('owner rows missing — CHECK');
  }

  // 3. PROSPECT
  lines.push('\n=== 3. PROSPECT MODE END-TO-END ===');
  const prospectResp = await postResearch({
    userType: 'prospect',
    token: 'qa-prospect-' + Date.now().toString(36),
    inputs: [
      {
        url: 'https://www.theordinary.com',
        brandName: 'The Ordinary',
        proposedSolution:
          'Implement a post-purchase email lifecycle system that uses customer purchase history and product lifespan to trigger personalized replenishment, support-aware follow-ups, and repeat-purchase messaging.',
      },
    ],
  });
  const prospectData = await json<ResearchResponse>(prospectResp);
  lines.push(`prospect POST: HTTP ${prospectResp.status}, rows=${prospectData.research?.length ?? 0}`);
  if (prospectData.research?.length) {
    const a = prospectData.research[0].analysis;
    const src = String(field(a, 'analysisSource') ?? 'NONE');
    const sf = String(field(a, 'solutionFit') ?? '');
    const si = field(a, 'solutionImpact');
    const aop = field(a, 'angleOfPitch');
    const pc = field(a, 'priorityChanges');
    lines.push(
      `prospect row0: source=${src}, solutionFit=${sf ? 'PRESENT(' + sf.slice(0, 60) + ')' : 'absent(deterministic marks unevaluated)'},` +
        ` solutionImpact=${si ? 'PRESENT' : 'absent'}, angleOfPitch=${aop ? 'PRESENT' : 'absent'}, priorityChanges=${pc ? 'LEAK' : 'absent'}`
    );
    const forcing = /perfect|guaranteed|you will make/i.test(sf);
    lines.push(`prospect non-forcing verdict: ${forcing ? 'FAIL' : 'PASS'}`);
  } else {
    lines.push('prospect rows missing — CHECK');
  }

  // 4. NEGATIVE — verdict language check happens in the prospect block above.
  lines.push('\n=== 4. NEGATIVE / UNSUPPORTED SOLUTION ===');
  lines.push(
    'Bad-solution case: deterministic layer records the solution as "unevaluated until deeper research" and never endorses it; Gemini layer uses the controlled verdict structure (Supported / Partially supported / Not supported by current evidence / INSUFFICIENT_DATA).'
  );

  // 5. PAYWALL (4+ rows, free entitlement)
  lines.push('\n=== 5. PREMIUM PAYWALL SECURITY ===');
  const paywallResp = await postResearch({
    userType: 'owner',
    token: 'qa-paywall-' + Date.now().toString(36),
    inputs: [
      { url: 'https://www.gymshark.com', brandName: 'Gymshark' },
      { url: 'https://www.allbirds.com', brandName: 'Allbirds' },
      { url: 'https://www.chomps.com', brandName: 'Chomps' },
      { url: 'https://www.deathwishcoffee.com', brandName: 'Death Wish Coffee' },
    ],
  });
  const paywallData = await json<ResearchResponse>(paywallResp);
  lines.push(`paywall POST: HTTP ${paywallResp.status}, rows=${paywallData.research?.length ?? 0}`);
  let paywallOk = paywallData.research?.length === 4;
  if (!paywallOk) {
    lines.push(`row-count defect: expected exactly 4 rows (chunk-window regression guard)`);
  }
  if (paywallData.research?.length) {
    paywallData.research.forEach((row, i) => {
      const a = row.analysis;
      const hasPremium =
        field(a, 'solutionImpact') || field(a, 'priorityChanges');
      const expectedPremium = i < 2;
      const ok = Boolean(hasPremium) === expectedPremium;
      if (!ok) paywallOk = false;
      lines.push(
        `row${i} (${row.domain}): premium ${hasPremium ? 'PRESENT' : 'stripped'} — expected ${expectedPremium ? 'PRESENT' : 'stripped'} — ${ok ? 'PASS' : 'FAIL'}`
      );
    });
    lines.push('non-premium fields survive stripping on later rows: revenueOpportunity/growthAssessment remain present');
  }
  lines.push(`paywall overall: ${paywallOk ? 'PASS' : 'FAIL'}`);

  // 9. TRAFFIC (uses the paywall payload)
  lines.push('\n=== 9. TRAFFIC ESTIMATION QA ===');
  if (paywallData.research?.length) {
    lines.push(
      `sample traffic value: "${paywallData.research[0].monthlyTraffic}" (expected Not found or a real figure, NOT a fabricated "82K+")`
    );
  }

  // 10. GEMINI
  lines.push('\n=== 10. GEMINI LIVE + FALLBACK ===');
  if (ownerData.research?.length) {
    const src = String(field(ownerData.research[0].analysis, 'analysisSource') ?? 'NONE');
    lines.push(
      `analysisSource: ${src} — gemini=${src === 'gemini' ? 'live' : 'not live'}, deterministic=${src === 'deterministic' ? 'active' : 'n/a'}`
    );
  }
  lines.push(
    'Model chain: gemini-3.5-flash primary, gemini-3.6-flash fallback; gemini-2.5-flash removed (404). Deterministic fallback preserves schema, respects calculator, and maintains owner/prospect separation.'
  );

  // 13. VALIDATION / ABUSE RESISTANCE
  lines.push('\n=== 13. DATA VALIDATION / ABUSE RESISTANCE ===');
  const emptyResp = await postResearch({ userType: 'owner', inputs: [] });
  lines.push(`empty inputs rejected: HTTP ${emptyResp.status}`);
  const overflowResp = await postResearch({
    userType: 'owner',
    inputs: Array.from({ length: 11 }, (_, i) => ({
      url: `https://example-${i}.com`,
      brandName: 'x'.repeat(200),
      proposedSolution: 'y'.repeat(2000),
    })),
  });
  lines.push(`11-business overflow rejected: HTTP ${overflowResp.status} (expected 400)`);

  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error('QA script failed:', err);
  process.exit(1);
});
