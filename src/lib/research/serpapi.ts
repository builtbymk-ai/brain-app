import { env } from '../env';
import { Signal } from './types';

const SERPAPI = 'https://serpapi.com/search.json';

export interface TrafficFindings {
  /** Heuristic visibility score 0-100 based on organic results + related queries. */
  visibilityScore: number | null;
  resultCount: number | null;
  relatedQueries: string[];
  signals: Signal<string>[];
}

/**
 * Approximate a business's online presence / search-visibility signal using
 * SerpAPI organic results and related search queries. Serves as the traffic
 * & search-signal stand-in for the intelligence stack.
 */
export async function estimateSearchVisibility(domain: string): Promise<TrafficFindings> {
  const key = env.serpapiKey;

  const empty: TrafficFindings = {
    visibilityScore: null,
    resultCount: null,
    relatedQueries: [],
    signals: [{ tag: 'ASM', source: 'serpapi', value: 'Not configured — no API key', note: 'SERPAPI_KEY missing' }],
  };

  if (!key) return empty;

  try {
    const params = new URLSearchParams({
      engine: 'google',
      q: domain,
      num: '20',
      api_key: key,
    });

    const response = await fetch(`${SERPAPI}?${params.toString()}`, {
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return {
        ...empty,
        signals: [{ tag: 'ASM', source: 'serpapi', value: `Search skipped — HTTP ${response.status}`, note: 'SerpAPI request failed' }],
      };
    }

    const data = await response.json();
    const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
    const related = Array.isArray(data?.related_queries) ? data.related_queries : [];

    const resultCount = data?.search_information?.total_results ?? null;

    // Visibility = share of the first page of results belonging to the domain
    // (0-100). Querying the brand/domain name nearly always returns the domain
    // itself at position 1, so position-based scoring saturated at 100 for
    // every domain; share-of-page distinguishes a strong SERP presence
    // (multiple owned results: store, help, press) from a single listing.
    const topPage = organic.slice(0, 10);
    const ownedResults = topPage.filter((item: unknown) =>
      String((item as Record<string, unknown>)?.link ?? '').toLowerCase().includes(domain)
    ).length;
    const visibilityScore = ownedResults > 0 ? Math.min(100, ownedResults * 10) : null;

    const relatedQueries = related
      .slice(0, 5)
      .map((r: unknown) => String((r as Record<string, unknown>)?.query ?? ''))
      .filter(Boolean);

    const signals: Signal<string>[] = [
      {
        tag: 'OBS',
        source: 'serpapi',
        value: `${organic.length} organic results returned`,
        note: 'Search presence',
      },
      {
        tag: visibilityScore ? 'OBS' : 'ASM',
        source: 'serpapi',
        value: visibilityScore
          ? `Brand SERP share ${visibilityScore}/100 (${ownedResults}/${topPage.length} first-page results)`
          : 'Domain not found in top organic results',
        note: 'Search-visibility heuristic (share of first page)',
      },
    ];

    return { visibilityScore, resultCount, relatedQueries, signals };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ...empty,
      signals: [{ tag: 'ASM', source: 'serpapi', value: `Search error — ${message}`, note: 'SerpAPI request failed' }],
    };
  }
}
