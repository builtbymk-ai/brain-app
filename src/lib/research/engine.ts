import { normalizeDomain } from '../id';
import { parseTrafficEstimateTestable } from './test-utils';
import { scrapeWebsite } from './firecrawl';
import { gatherSocial } from './apify';
import { enrichCompany } from './apollo';
import { estimateSearchVisibility } from './serpapi';
import { analyzeBusiness } from '../analysis/gemini';
import { calculateAcrOpportunity } from '../analysis/calculator';
import { BusinessResult, CapturedSignals, UserType } from './types';
import { compact, toNumber } from './signals';

/**
 * Run the full research pipeline for a single business.
 * Each source degrades gracefully, so a single source failure never aborts
 * the whole research run — status is recorded as complete or partial.
 *
 * @param rawInput    Brand URL / domain (user input)
 * @param brandName   User-supplied brand name (optional; used for display + analysis)
 * @param proposedSolution User-supplied solution to assess against the evidence
 */
export interface ResearchInput {
  url: string;
  brandName?: string;
  proposedSolution?: string;
  /** Which research experience is requesting the analysis (owner | prospect). */
  userType?: UserType;
}

export async function researchBusiness(
  rawInput: string | ResearchInput
): Promise<BusinessResult | null> {
  // Accept both legacy string inputs and the new structured input.
  const input: ResearchInput = typeof rawInput === 'string' ? { url: rawInput } : rawInput;
  const domain = normalizeDomain(input.url);
  if (!domain) return null;

  const brandName = input.brandName?.trim() || null;
  const proposedSolution = input.proposedSolution?.trim() || null;
  const userType: UserType = input.userType === 'owner' ? 'owner' : 'prospect';

  const website = await scrapeWebsite(domain);
  const social = await gatherSocial(domain, website?.socialLinks ?? []);
  const company = await enrichCompany(domain);
  const traffic = await estimateSearchVisibility(domain);

  // Attempt benchmark context (heuristic, clearly labelled as benchmark).
  const benchmarkSignals = buildBenchmarkSignals({ website, social, company, traffic });

  const captured: CapturedSignals = {
    website: website?.signals ?? null,
    social: social.signals,
    company: company.signals,
    traffic: traffic.signals,
    benchmarking: benchmarkSignals,
  };

  // Derive the workspace row values from observed/deduced signals.
  const products = estimateProducts(website?.productCount ?? 0);
  const reviews = estimateReviews(website, social);
  const quiz = website?.hasQuiz ? 'Present' : 'Not found';
  const monthlyTraffic = estimateMonthlyTraffic(traffic, website);

  // Aggregate numbers feeding the analysis layer.
  const aggregate = {
    domain,
    brandName,
    proposedSolution,
    userType,
    traffic: parseTrafficEstimate(monthlyTraffic),
    products: products === 'Not found' ? null : toNumber(products),
    reviews: reviews === 'Not found' ? null : toNumber(reviews),
    followerEstimate: social.followerEstimate,
    employeeCount: company.employeeCount,
    hasQuiz: website ? website.hasQuiz : null,
    remark: buildRemark({ website, company, social, traffic }),
  };

  // --- ACR CALCULATOR (authoritative arithmetic) ---
  // All numeric opportunity math happens here, deterministically. The
  // analysis layer (Gemini) receives CalculatedMetrics and INTERPRETS it —
  // it never recomputes revenue (hard boundary per the ACR architecture).
  const industrySignals: string[] = [
    ...(website?.signals ?? []).map((s) => s.value),
    ...(company.industry ? [company.industry] : []),
    ...(website?.title ? [website.title] : []),
    ...(website?.description ? [website.description] : []),
  ];

  const calculated = calculateAcrOpportunity(
    {
      domain,
      displayName: brandName ?? company.name ?? domain,
      industrySignals,
      hasQuiz: website ? website.hasQuiz : null,
    },
    aggregate.traffic,
    { userType }
  );

  const analysis = await analyzeBusiness({ ...aggregate, calculated });

  // A source is only "complete" if we actually retrieved core signals.
  const hasAnyRealSignal =
    (website && website.productCount > 0) ||
    social.followerEstimate !== null ||
    company.employeeCount !== null ||
    traffic.visibilityScore !== null;

  const status: BusinessResult['status'] = hasAnyRealSignal ? 'complete' : 'partial';

  return {
    domain,
    displayName: brandName ?? company.name ?? domain,
    brandName,
    proposedSolution,
    status,
    monthlyTraffic,
    products,
    reviews,
    quiz,
    revenueOpportunity: formatRevenueRange(analysis),
    growthAssessment: `${analysis.growthScore} / 100`,
    rawSignals: captured,
    analysis,
  };
}

function buildBenchmarkSignals(input: {
  website: { productCount: number } | null;
  social: { followerEstimate: number | null };
  company: { employeeCount: number | null };
  traffic: { visibilityScore: number | null };
}): CapturedSignals['benchmarking'] {
  const signals = [];
  if (input.website?.productCount != null && input.website.productCount > 0) {
    signals.push({
      tag: 'BMK' as const,
      source: 'industry',
      value: `${input.website.productCount} product markers vs typical storefront`,
      note: 'Catalog breadth benchmark',
    });
  }
  if (input.traffic?.visibilityScore != null) {
    signals.push({
      tag: 'BMK' as const,
      source: 'industry',
      value: `Visibility score ${input.traffic.visibilityScore}/100`,
      note: 'Search-visibility benchmark',
    });
  }
  return signals.length ? signals : null;
}

function estimateProducts(raw: number): string {
  if (raw <= 0) return 'Not found';
  return raw >= 1000 ? compact(raw) : `${raw}`;
}

function estimateReviews(website: { markdown: string } | null, _social: { followerEstimate: number | null }): string {
  // [OBS] only: report review counts actually found on the site.
  // NEVER derive a review count from social followers — that was a
  // fabricated heuristic and violates the evidence rules (MODEL RULES R7).
  const text = website?.markdown?.toLowerCase() ?? '';
  const reviewMatch = text.match(/(\d[\d,]*)\s*(reviews?|ratings?)/);
  if (reviewMatch) return reviewMatch[1].replace(/,/g, '');
  return 'Not found';
}

function estimateMonthlyTraffic(
  traffic: { visibilityScore: number | null; resultCount: number | null },
  website: { markdown: string } | null
): string {
  // [OBS] Prefer a traffic figure actually declared on the site.
  const text = website?.markdown?.toLowerCase() ?? '';
  const trafficMatch = text.match(/(\d[\d,.]*\s*[kmb]?)\s*(monthly\s+)?(visitors|visits|traffic|sessions)/);
  if (trafficMatch) {
    const normalized = trafficMatch[1].replace(/\s+/g, '').toUpperCase();
    // Only accept explicitly suffixed values (e.g. "48K") — bare numbers
    // in page copy are usually prices or counts, not traffic figures.
    if (/[KMB]$/.test(normalized)) return `${normalized}+`;
  }

  // [DRV] No declared figure → report honestly instead of fabricating.
  // A SERP visibility score is NOT visit data: converting it into a visit
  // count fabricated numbers (every domain previously read "82K+"). The
  // score is retained in rawSignals for the analysis layer; monthly traffic
  // stays unknown until a real figure is observed or supplied.
  // Downstream analysis treats null traffic as INSUFFICIENT_DATA
  // (MODEL RULES R7/P4).
  return 'Not found';
}

/**
 * Parse a monthly-traffic display string back into a numeric estimate.
 * Logic lives in test-utils.ts so the validation harness exercises the
 * exact production parser. Returns null for unparsable values — analysis
 * treats null as INSUFFICIENT_DATA rather than zero.
 */
function parseTrafficEstimate(display: string): number | null {
  return parseTrafficEstimateTestable(display);
}

function formatRevenueRange(analysis: BusinessResult['analysis']): string {
  if (!analysis) return 'Unavailable';
  const base = analysis.scenarios.find((s) => s.label === 'Base') ?? analysis.scenarios[0];
  if (!base || (base.revenueLow === 0 && base.revenueHigh === 0)) return 'Unavailable';
  return `$${compact(base.revenueLow)} – $${compact(base.revenueHigh)}`;
}

function buildRemark(input: {
  website: { title: string | null; description: string | null } | null;
  company: { industry: string | null; location: string | null };
  social: { profilesFound: number };
  traffic: { relatedQueries: string[] };
}): string {
  const parts: string[] = [];
  if (input.website?.title) parts.push(`Site title: ${input.website.title}`);
  if (input.company?.industry) parts.push(`Industry: ${input.company.industry}`);
  if (input.company?.location) parts.push(`Location: ${input.company.location}`);
  if (input.social.profilesFound > 0) parts.push(`Social profiles: ${input.social.profilesFound}`);
  if (input.traffic.relatedQueries?.length) parts.push(`Related searches: ${input.traffic.relatedQueries.slice(0, 3).join(', ')}`);
  return parts.join('\n');
}
