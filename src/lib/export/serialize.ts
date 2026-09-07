import { BusinessResult, AnalysisResult } from '../research/types';
import { UserType } from '../analysis/types';

export interface ExportRowPayload {
  business: BusinessResult;
}

/** Narrow the jsonb-persisted analysis into its premium fields.
 * The `userType` selects which premium column is authoritative for this row:
 *   owner    → priorityChanges (numbered list)
 *   prospect → angleOfPitch (narrative)
 * Using the wrong mode's field would leak cross-mode content in the export.
 */
function premiumFields(analysis: AnalysisResult | null | undefined, userType: UserType): {
  solutionImpact: string;
  premium: string;
} {
  if (!analysis || typeof analysis !== 'object') {
    return { solutionImpact: 'Unavailable', premium: 'Unavailable' };
  }
  const solutionImpact = analysis.solutionImpact ?? 'Unavailable';
  let premium = 'Unavailable';
  if (userType === 'owner') {
    if (Array.isArray(analysis.priorityChanges) && analysis.priorityChanges.length) {
      premium = analysis.priorityChanges.map((s, i) => `${i + 1}. ${s}`).join(' | ');
    }
  } else {
    if (typeof analysis.angleOfPitch === 'string' && analysis.angleOfPitch) {
      premium = analysis.angleOfPitch;
    }
  }
  return { solutionImpact, premium };
}

function csvHeaders(userType: UserType): readonly string[] {
  return userType === 'owner'
    ? ([
        'BrandName',
        'Domain',
        'Status',
        'MonthlyTraffic',
        'Products',
        'Reviews',
        'Quiz',
        'RevenueOpportunity',
        'GrowthAssessment',
        'SolutionImpact',
        'PriorityChanges',
      ] as const)
    : ([
        'BrandName',
        'Domain',
        'Status',
        'MonthlyTraffic',
        'Products',
        'Reviews',
        'Quiz',
        'RevenueOpportunity',
        'GrowthAssessment',
        'SolutionImpact',
        'AngleOfPitch',
      ] as const);
}

function esc(v: string | number): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(businesses: ExportRowPayload[], userType: UserType = 'owner'): string {
  const rows = businesses.map(({ business }) => {
    const { solutionImpact, premium } = premiumFields(business.analysis, userType);
    return [
      business.brandName ?? business.displayName,
      business.domain,
      business.status,
      business.monthlyTraffic,
      business.products,
      business.reviews,
      business.quiz,
      business.revenueOpportunity,
      business.growthAssessment,
      solutionImpact,
      premium,
    ]
      .map((v) => esc(v))
      .join(',');
  });
  return [csvHeaders(userType).join(','), ...rows].join('\n');
}

export function toJson(businesses: ExportRowPayload[], userType: UserType = 'owner'): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      exportType: userType === 'owner' ? 'owner' : 'prospect',
      disclaimer:
        'BRAIN results are estimates based on publicly available information, benchmarks, observed signals and explicit assumptions. They are not guarantees of revenue or business performance.',
      businesses: businesses.map(({ business }) => {
        const { solutionImpact, premium } = premiumFields(business.analysis, userType);
        return {
          brandName: business.brandName,
          proposedSolution: business.proposedSolution,
          domain: business.domain,
          status: business.status,
          monthlyTraffic: business.monthlyTraffic,
          products: business.products,
          reviews: business.reviews,
          quiz: business.quiz,
          revenueOpportunity: business.revenueOpportunity,
          growthAssessment: business.growthAssessment,
          solutionImpact,
          ...(userType === 'owner' ? { priorityChanges: premium } : { angleOfPitch: premium }),
          analysis: business.analysis,
          rawSignals: business.rawSignals,
        };
      }),
    },
    null,
    2
  );
}
