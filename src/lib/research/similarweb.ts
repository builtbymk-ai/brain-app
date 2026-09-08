import { env } from '../env';
import { Signal } from './types';

const APIFY_API = 'https://api.apify.com/v2';
const SIMILARWEB_ACTOR = 'pro100chok~similarweb-scraper';

export interface TrafficEstimate {
  /** Estimated monthly visits from SimilarWeb data. */
  monthlyVisits: number | null;
  /** Source of the traffic estimate. */
  source: 'similarweb';
  /** Confidence level based on data availability. */
  confidence: 'high' | 'medium' | 'low';
  /** Raw engagement data if available. */
  engagement?: {
    bounceRate?: number;
    pagesPerVisit?: number;
    averageSessionDuration?: number;
  };
  signals: Signal<string>[];
}

/**
 * Estimate monthly traffic using Apify's SimilarWeb scraper actor.
 * This provides defensible traffic estimates based on SimilarWeb's methodology.
 *
 * Returns null for monthly visits if:
 * - No API key configured
 * - Actor fails
 * - Domain not found in SimilarWeb data
 * - Rate limited
 *
 * Provenance: SimilarWeb data via Apify actor
 * Methodology: SimilarWeb's traffic estimation based on panel data, crawling, and modeling
 */
export async function estimateTrafficFromSimilarWeb(domain: string): Promise<TrafficEstimate> {
  const token = env.apifyToken;

  const empty: TrafficEstimate = {
    monthlyVisits: null,
    source: 'similarweb',
    confidence: 'low',
    signals: [{
      tag: 'ASM',
      source: 'apify-similarweb',
      value: 'Not configured — no API token',
      note: 'APIFY_TOKEN missing',
    }],
  };

  if (!token) return empty;

  try {
    // Run the SimilarWeb scraper actor
    const response = await fetch(
      `${APIFY_API}/acts/${SIMILARWEB_ACTOR}/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchType: 'similarweb',
          domains: [domain],
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      return {
        ...empty,
        signals: [{
          tag: 'ASM',
          source: 'apify-similarweb',
          value: `Traffic estimation skipped — HTTP ${response.status}`,
          note: 'SimilarWeb actor request failed',
        }],
      };
    }

    const items: unknown[] = await response.json();
    const itemsArr = Array.isArray(items) ? items : [];
    
    if (itemsArr.length === 0) {
      return {
        ...empty,
        signals: [{
          tag: 'ASM',
          source: 'apify-similarweb',
          value: 'No data returned for domain',
          note: 'Domain not found in SimilarWeb',
        }],
      };
    }

    const result = itemsArr[0] as Record<string, unknown>;
    
    // Extract monthly visits from EstimatedMonthlyVisits
    const estimatedMonthlyVisits = result?.EstimatedMonthlyVisits as Record<string, number> | undefined;
    let monthlyVisits: number | null = null;
    let confidence: 'high' | 'medium' | 'low' = 'low';

    if (estimatedMonthlyVisits && typeof estimatedMonthlyVisits === 'object') {
      // Get the most recent month's data
      const dates = Object.keys(estimatedMonthlyVisits).sort().reverse();
      if (dates.length > 0) {
        const mostRecentDate = dates[0];
        const visits = estimatedMonthlyVisits[mostRecentDate];
        if (typeof visits === 'number' && visits > 0) {
          monthlyVisits = Math.round(visits);
          confidence = 'high';
        }
      }
    }

    // Extract engagement data
    const engagements = result?.Engagments as Record<string, unknown> | undefined;
    const engagement = engagements ? {
      bounceRate: typeof engagements.BounceRate === 'number' ? engagements.BounceRate : undefined,
      pagesPerVisit: typeof engagements.PagePerVisit === 'number' ? engagements.PagePerVisit : undefined,
      averageSessionDuration: typeof engagements.TimeOnSite === 'number' ? engagements.TimeOnSite : undefined,
    } : undefined;

    const signals: Signal<string>[] = [];

    if (monthlyVisits !== null) {
      signals.push({
        tag: 'OBS',
        source: 'apify-similarweb',
        value: `~${formatTraffic(monthlyVisits)} monthly visits`,
        note: 'SimilarWeb traffic estimate',
      });
      
      if (engagement?.bounceRate !== undefined) {
        signals.push({
          tag: 'OBS',
          source: 'apify-similarweb',
          value: `${engagement.bounceRate.toFixed(1)}% bounce rate`,
          note: 'Engagement metric',
        });
      }
    } else {
      signals.push({
        tag: 'ASM',
        source: 'apify-similarweb',
        value: 'Traffic data unavailable for this domain',
        note: 'No SimilarWeb data',
      });
    }

    return {
      monthlyVisits,
      source: 'similarweb',
      confidence,
      engagement,
      signals,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ...empty,
      signals: [{
        tag: 'ASM',
        source: 'apify-similarweb',
        value: `Traffic estimation error — ${message}`,
        note: 'SimilarWeb actor failed',
      }],
    };
  }
}

function formatTraffic(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}
