import { env } from '../env';
import { Signal } from './types';

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';

export interface WebsiteFindings {
  title: string | null;
  description: string | null;
  /** Raw markdown of the crawled page. */
  markdown: string;
  productCount: number;
  hasQuiz: boolean;
  socialLinks: string[];
  signals: Signal<string>[];
}

/**
 * Scrape a business website using Firecrawl. Returns an empty/marked result
 * when no API key is configured or the crawl fails, so the engine degrades
 * gracefully instead of silently fabricating data.
 */
export async function scrapeWebsite(domain: string): Promise<WebsiteFindings | null> {
  const key = env.firecrawlKey;
  const url = `https://${domain}`;

  const empty: WebsiteFindings = {
    title: null,
    description: null,
    markdown: '',
    productCount: 0,
    hasQuiz: false,
    socialLinks: [],
    signals: [],
  };

  if (!key) {
    return { ...empty, signals: [{ tag: 'ASM', source: 'firecrawl', value: 'Not configured — no API key', note: 'FIRECRAWL_API_KEY missing' }] };
  }

  try {
    const response = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return { ...empty, signals: [{ tag: 'ASM', source: 'firecrawl', value: `Crawl failed — HTTP ${response.status}` }] };
    }

    const data = await response.json();
    const meta = data?.data?.metadata ?? {};
    const markdown: string = data?.data?.markdown ?? '';
    const content = `${meta.title ?? ''} ${meta.description ?? ''} ${markdown}`.toLowerCase();

    // Look for common storefront / product signals
    const productCount = countMarkers(content, [
      /\bproduct\b/g,
      /\bshop\b/g,
      /\bcart\b/g,
      /\bcheckout\b/g,
      /\badd to bag\b/g,
      /\bbuy now\b/g,
    ]);

    const hasQuiz = /\bquiz\b|\bq&a\b|\bsurvey\b|\bquestionnaire\b/i.test(content);

    // Extract social links
    const socialLinks = [
      ...matchUrls(markdown, /instagram\.com\/[a-z0-9._-]+/gi),
      ...matchUrls(markdown, /tiktok\.com\/@?[a-z0-9._-]+/gi),
      ...matchUrls(markdown, /facebook\.com\/[a-z0-9._-]+/gi),
    ];
    const uniqueSocial = [...new Set(socialLinks)].slice(0, 6);

    const signals: Signal<string>[] = [
      { tag: 'OBS', source: 'firecrawl', value: meta.title ? String(meta.title).slice(0, 120) : 'No title found', note: 'Website title' },
      { tag: 'OBS', source: 'firecrawl', value: meta.description ? String(meta.description).slice(0, 200) : 'No meta description found', note: 'Website description' },
      { tag: 'OBS', source: 'firecrawl', value: productCount > 0 ? `${productCount} product/storefront markers` : 'No product/storefront markers', note: 'Catalog markers' },
      { tag: 'OBS', source: 'firecrawl', value: hasQuiz ? 'Quiz/interactive element present' : 'No quiz element found', note: 'Quiz detection' },
    ];

    return {
      title: meta?.title ?? null,
      description: meta?.description ?? null,
      markdown,
      productCount,
      hasQuiz,
      socialLinks: uniqueSocial,
      signals,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ...empty, signals: [{ tag: 'ASM', source: 'firecrawl', value: `Crawl error — ${message}` }] };
  }
}

function countMarkers(haystack: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) {
    const m = haystack.match(p);
    if (m) count += m.length;
  }
  return count;
}

function matchUrls(haystack: string, ...patterns: RegExp[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    const m = haystack.match(p);
    if (m) out.push(...m);
  }
  return out;
}
