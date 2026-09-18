import { BusinessResult, AnalysisResult } from '../research/types';
import { UserType } from '../analysis/types';
import {
  EXPORT_STATUS_CALCULATED,
  EXPORT_STATUS_HEADER,
  EXPORT_STATUS_INSUFFICIENT_DATA,
  EXPORT_STATUS_NOT_SUPPORTED,
  EXPORT_INSUFFICIENT_DATA_CALCULATION,
  EXPORT_NOT_SUPPORTED_CALCULATION,
  type RevenueState,
} from '../research/revenue-state';

export interface ExportRowPayload {
  business: BusinessResult;
}

/**
 * V2B.3 — map the authoritative RevenueState to its export representation.
 * The status is NEVER encoded indirectly ("$0", blank, "N/A") — a downstream
 * consumer must be able to distinguish CALCULATED (incl. true zero) from
 * INSUFFICIENT_DATA and NOT_SUPPORTED unambiguously.
 */
function exportRevenueStatus(
  state: RevenueState | undefined,
): string {
  switch (state) {
    case 'CALCULATED':
      return EXPORT_STATUS_CALCULATED;
    case 'INSUFFICIENT_DATA':
      return EXPORT_STATUS_INSUFFICIENT_DATA;
    case 'NOT_SUPPORTED':
      return EXPORT_STATUS_NOT_SUPPORTED;
    // Legacy persisted rows (pre-V2B.3) carry no state; keep the export
    // schema total rather than emitting undefined.
    default:
      return EXPORT_STATUS_CALCULATED;
  }
}

/**
 * V2B.3 — RevenueCalculation cell semantics per state. CALCULATED keeps the
 * existing evidence-tagged trail verbatim; the two non-calculated states get
 * a concise structured limitation (no proprietary coefficients or formulas).
 */
function exportRevenueCalculation(business: BusinessResult): string {
  const existing = business.revenueCalculation?.trim();
  switch (business.revenueState) {
    case 'INSUFFICIENT_DATA':
      return [
        EXPORT_INSUFFICIENT_DATA_CALCULATION,
        business.revenueExplanation?.additionalEvidence
          ? `Additional evidence: ${business.revenueExplanation.additionalEvidence}.`
          : null,
        business.revenueExplanation?.why ? `Why: ${business.revenueExplanation.why}` : null,
      ]
        .filter(Boolean)
        .join(' ');
    case 'NOT_SUPPORTED':
      return EXPORT_NOT_SUPPORTED_CALCULATION;
    default:
      return existing ?? 'Unavailable';
  }
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
        'OnsiteDataCollection',
        'PotentialRevenueLift',
        EXPORT_STATUS_HEADER,
        'RevenueCalculation',
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
        'OnsiteDataCollection',
        'PotentialRevenueLift',
        EXPORT_STATUS_HEADER,
        'RevenueCalculation',
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
      exportRevenueStatus(business.revenueState),
      exportRevenueCalculation(business),
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
          // Internal field names preserved for backward compatibility; the
          // customer-facing CSV headers carry the On-site Data Collection
          // terminology.
          onsiteDataCollection: business.quiz,
          potentialRevenueLift: business.revenueOpportunity,
          revenueStatus: exportRevenueStatus(business.revenueState),
          revenueCalculation: exportRevenueCalculation(business),
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
