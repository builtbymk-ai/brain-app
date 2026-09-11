import { normalizeDomain } from '../id';
import { parseTrafficEstimateTestable } from './test-utils';
import { scrapeWebsite } from './firecrawl';
import { gatherSocial } from './apify';
import { enrichCompany } from './apollo';
import { estimateSearchVisibility } from './serpapi';
import { estimateTrafficFromSimilarWeb } from './similarweb';
import { analyzeBusiness } from '../analysis/gemini';
import { classifyProposedSolution } from '../analysis/solution-classifier';
import { calculateAcrOpportunity } from '../analysis/calculator';
import { CalculatedMetrics } from '../analysis/types';
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
  
  // Get SimilarWeb traffic estimate for monthly visits
  const similarWebTraffic = await estimateTrafficFromSimilarWeb(domain);

  // Attempt benchmark context (heuristic, clearly labelled as benchmark).
  const benchmarkSignals = buildBenchmarkSignals({ website, social, company, traffic, similarWebTraffic });

  const captured: CapturedSignals = {
    website: website?.signals ?? null,
    social: social.signals,
    company: company.signals,
    traffic: [...traffic.signals, ...similarWebTraffic.signals],
    benchmarking: benchmarkSignals,
  };

  // Derive the workspace row values from observed/deduced signals.
  const products = estimateProducts(website?.productCount ?? 0);
  const reviews = estimateReviews(website, social);
  const quiz = website?.hasQuiz ? 'Present' : 'Not found';
  const monthlyTraffic = estimateMonthlyTraffic(traffic, website, similarWebTraffic);
  const trafficSource = getTrafficSource(traffic, website, similarWebTraffic);

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

  // Deterministic MODEL-ACTIVATION classification of the proposed solution.
  // Runs BEFORE the calculator; the calculator receives only the boolean
  // result — never the raw solution text (and never performs arithmetic on it).
  const solutionClassification = classifyProposedSolution(proposedSolution);

  const calculated = calculateAcrOpportunity(
    {
      domain,
      displayName: brandName ?? company.name ?? domain,
      industrySignals,
      hasQuiz: website ? website.hasQuiz : null,
      solutionActivatesDataCollection: solutionClassification.activatesDataCollection,
    },
    aggregate.traffic,
    { userType, trafficSource }
  );

  const analysis = await analyzeBusiness({ ...aggregate, calculated });

  // A source is only "complete" if we actually retrieved core signals.
  const hasAnyRealSignal =
    (website && website.productCount > 0) ||
    social.followerEstimate !== null ||
    company.employeeCount !== null ||
    traffic.visibilityScore !== null;

  const status: BusinessResult['status'] = hasAnyRealSignal ? 'complete' : 'partial';

  // --- Workspace Potential Revenue Lift ---
  // The calculator's risk-adjusted combined base scenario is the single
  // authoritative figure. `analysis.scenarios` (Gemini's interpretive
  // layer) is no longer the source of the workspace revenue value.
  const potentialRevenueLift = formatPotentialRevenueLift(calculated);
  const revenueCalculation = buildRevenueCalculationTrail(calculated);

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
    revenueOpportunity: potentialRevenueLift,
    revenueCalculation,
    growthAssessment: `${analysis.growthScore} / 100`,
    rawSignals: captured,
    analysis,
  };
}

/**
 * Compact Potential Revenue Lift display: risk-adjusted combined base
 * scenario from the deterministic calculator, e.g. "$8,420/mo".
 *
 * Zero-vs-unavailable semantics (typed, not string-matched):
 *   combined.base === null                          → unavailable (no pathway ran)
 *   combined.base = {low: 0, high: 0}               → "$0/mo" (a calculated zero)
 *   any positive figure                             → "$X/mo"
 * A legitimate calculated zero is never converted to "Unavailable", and
 * missing evidence is never presented as "$0/mo".
 */
function formatPotentialRevenueLift(calculated: CalculatedMetrics): string {
  const base = calculated.combined.base;
  if (base === null) return 'Unavailable';
  return `$${base.low.toLocaleString('en-US')}/mo`;
}

/**
 * Concise technical calculation trail for the Revenue Calculation column,
 * built ONLY from calculator-resolved inputs and evidence. Shows the
 * resolved variables with their evidence tags and the model shape — never
 * realization factors, maturity modifiers, or the proprietary weighting.
 */
function buildRevenueCalculationTrail(calculated: CalculatedMetrics): string {
  const lines: string[] = [];
  const i = calculated.inputs;

  // Resolved inputs (compact, evidence-tagged).
  const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
  const fmtRate = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 2).replace(/\.0$/, '')}%`;

  lines.push(`AOV = ${fmtMoney(i.aov.value ?? 0)} [${i.aov.basis}]`);
  lines.push(`CVR = ${fmtRate(i.conversionRate.value ?? 0)} [${i.conversionRate.basis}]`);
  if (i.quizParticipation.value !== null) {
    lines.push(`Data Collection Start = ${fmtRate(i.quizParticipation.value)} [${i.quizParticipation.basis}]`);
  }
  if (i.quizCompletion.value !== null) {
    lines.push(`Completion = ${fmtRate(i.quizCompletion.value)} [${i.quizCompletion.basis}]`);
  }
  if (i.quizToPurchase.value !== null) {
    lines.push(`Purchase = ${fmtRate(i.quizToPurchase.value)} [${i.quizToPurchase.basis}]`);
  }
  lines.push(`RPR = ${fmtRate(i.repeatPurchaseRate.value ?? 0)} [${i.repeatPurchaseRate.basis}]`);

  // Model shape — both paths, when they produced numbers.
  const conv = calculated.conversion.base;
  const ret = calculated.retention.base;
  const combinedBase = calculated.combined.base;

  if (conv.incrementalUnits !== null) {
    lines.push('Incremental Buyers = Collection Buyers − Baseline Buyers');
    lines.push('Glow Lift = Incremental Buyers × AOV');
  }
  if (ret.incrementalUnits !== null) {
    lines.push('Projected RPR = Baseline + ΔRPR × Realization');
    lines.push('Additional Buyers = Entering × ΔRPR');
    lines.push('LTV Lift = Additional Buyers × AOV');
  }

  // Unavailable: no pathway produced a calculable figure (combined is the
  // typed null state). A calculated zero still falls through to the trail
  // below and prints "$0/mo" — never "Unavailable" (zero ≠ unavailable).
  if (combinedBase === null) {
    const missing = calculated.sufficiency.missingInputs;
    lines.push(
      missing.length
        ? `Potential Lift: unavailable — missing ${missing.join(', ')}`
        : 'Potential Lift: unavailable — insufficient defensible evidence'
    );
    return lines.join('\n');
  }

  // Risk adjustment and result. Per MODEL RULES P2 the buffer is ONE
  // composite haircut for model error — never presented as three separate
  // technical/market/infrastructure deductions (V1 audit finding).
  const grossBase = (conv.realizedRevenueLift ?? 0) + (ret.realizedRevenueLift ?? 0);
  const potential = combinedBase.low;
  lines.push(`Gross Lift = $${grossBase.toLocaleString('en-US')}/mo`);
  lines.push(`Risk Adjustment = −$${(grossBase - potential).toLocaleString('en-US')}`);
  lines.push(`Potential Lift = $${potential.toLocaleString('en-US')}/mo`);
  return lines.join('\n');
}

function buildBenchmarkSignals(input: {
  website: { productCount: number } | null;
  social: { followerEstimate: number | null };
  company: { employeeCount: number | null };
  traffic: { visibilityScore: number | null };
  similarWebTraffic: { monthlyVisits: number | null };
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
  if (input.similarWebTraffic?.monthlyVisits != null) {
    signals.push({
      tag: 'BMK' as const,
      source: 'similarweb',
      value: `SimilarWeb monthly visits: ~${formatTrafficForBenchmark(input.similarWebTraffic.monthlyVisits)}`,
      note: 'Traffic benchmark from SimilarWeb',
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
  website: { markdown: string } | null,
  similarWebTraffic: { monthlyVisits: number | null; confidence: string } | null
): string {
  // [OBS] Priority 1: Prefer a traffic figure actually declared on the site.
  const text = website?.markdown?.toLowerCase() ?? '';
  const trafficMatch = text.match(/(\d[\d,.]*\s*[kmb]?)\s*(monthly\s+)?(visitors|visits|traffic|sessions)/);
  if (trafficMatch) {
    const normalized = trafficMatch[1].replace(/\s+/g, '').toUpperCase();
    // Only accept explicitly suffixed values (e.g. "48K") — bare numbers
    // in page copy are usually prices or counts, not traffic figures.
    if (/[KMB]$/.test(normalized)) return `${normalized}+`;
  }

  // [OBS] Priority 2: Use SimilarWeb traffic estimate if available with high confidence.
  // SimilarWeb provides defensible estimates based on their methodology (panel data, crawling, modeling).
  if (similarWebTraffic?.monthlyVisits != null && similarWebTraffic.confidence === 'high') {
    return formatTrafficForDisplay(similarWebTraffic.monthlyVisits);
  }

  // [DRV] No declared figure and no high-confidence SimilarWeb data → report honestly.
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

/**
 * Determine the traffic source for provenance tracking.
 * Used by the calculator to distinguish observed vs estimated traffic.
 */
function getTrafficSource(
  traffic: { visibilityScore: number | null; resultCount: number | null },
  website: { markdown: string } | null,
  similarWebTraffic: { monthlyVisits: number | null; confidence: string } | null
): 'observed' | 'estimated' {
  // Priority 1: Website-declared traffic
  const text = website?.markdown?.toLowerCase() ?? '';
  const trafficMatch = text.match(/(\d[\d,.]*\s*[kmb]?)\s*(monthly\s+)?(visitors|visits|traffic|sessions)/);
  if (trafficMatch) {
    const normalized = trafficMatch[1].replace(/\s+/g, '').toUpperCase();
    if (/[KMB]$/.test(normalized)) return 'observed';
  }

  // Priority 2: SimilarWeb estimated traffic
  if (similarWebTraffic?.monthlyVisits != null && similarWebTraffic.confidence === 'high') {
    return 'estimated';
  }

  // Fallback: no traffic (will be null)
  return 'estimated';
}

function formatTrafficForDisplay(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B+`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K+`;
  return `${n}+`;
}

function formatTrafficForBenchmark(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
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
