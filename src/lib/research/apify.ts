import { env } from '../env';
import { Signal } from './types';

const APIFY_API = 'https://api.apify.com/v2';

export interface SocialFindings {
  /** Approximate follower sum across detected social profiles. */
  followerEstimate: number | null;
  profilesFound: number;
  signals: Signal<string>[];
}

/**
 * Gather social profile signals via Apify. Given the breadth of possible
 * actors, we attempt a lightweight run and degrade gracefully on failure or
 * missing credentials.
 */
export async function gatherSocial(domain: string, socialLinks: string[]): Promise<SocialFindings> {
  const token = env.apifyToken;

  const empty: SocialFindings = {
    followerEstimate: null,
    profilesFound: socialLinks.length,
    signals: socialLinks.length
      ? [
          {
            tag: 'OBS',
            source: 'apify',
            value: `${socialLinks.length} social profile(s) found on site`,
            note: 'Detected from website footer/content',
          },
        ]
      : [{ tag: 'ASM', source: 'apify', value: 'No social profiles found', note: 'Not detected on crawled site' }],
  };

  if (!token) {
    return {
      ...empty,
      signals: [
        {
          tag: 'ASM',
          source: 'apify',
          value: 'Not configured — no API token',
          note: 'APIFY_TOKEN missing',
        },
        ...empty.signals,
      ],
    };
  }

  // If no social links were found on the site, we cannot meaningfully run.
  if (socialLinks.length === 0) return empty;

  try {
    // Use a general-purpose profile-info actor; results are best-effort.
    const response = await fetch(
      `${APIFY_API}/acts/clockworks~instagram-scraper/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: socialLinks.slice(0, 4),
          resultsType: 'details',
          resultsLimit: 4,
        }),
        signal: AbortSignal.timeout(25_000),
      }
    );

    if (!response.ok) {
      return {
        ...empty,
        signals: [
          { tag: 'ASM', source: 'apify', value: `Social run skipped — HTTP ${response.status}`, note: 'Actor run failed' },
          ...empty.signals,
        ],
      };
    }

    const items: unknown[] = await response.json();
    const itemsArr = Array.isArray(items) ? items : [];
    const followerEstimate = itemsArr.reduce<number>((sum, it) => {
      const obj = it as Record<string, unknown>;
      const count = typeof obj?.followersCount === 'number' ? obj.followersCount : null;
      return sum + (count ?? 0);
    }, 0);

    return {
      followerEstimate: followerEstimate > 0 ? followerEstimate : null,
      profilesFound: itemsArr.length,
      signals: [
        {
          tag: 'OBS',
          source: 'apify',
          value: `${itemsArr.length} social profile(s) analyzed`,
          note: 'Apify actor results',
        },
        {
          tag: followerEstimate > 0 ? 'OBS' : 'ASM',
          source: 'apify',
          value: followerEstimate > 0 ? `~${formatFollowers(followerEstimate)} combined followers` : 'Follower counts unavailable',
          note: 'Social following signal',
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ...empty,
      signals: [{ tag: 'ASM', source: 'apify', value: `Social run error — ${message}`, note: 'Actor run failed' }, ...empty.signals],
    };
  }
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}
