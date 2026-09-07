import { env } from '../env';
import { Signal } from './types';

const APOLLO_API = 'https://api.apollo.io/v1';

export interface CompanyFindings {
  name: string | null;
  industry: string | null;
  employeeCount: number | null;
  revenueRange: string | null;
  location: string | null;
  signals: Signal<string>[];
}

/**
 * Enrich company/firmographic data from a domain using Apollo.
 * Apollo requires a paid plan for API access; we degrade gracefully when the
 * key is absent or the endpoint is unavailable.
 */
export async function enrichCompany(domain: string): Promise<CompanyFindings> {
  const key = env.apolloKey;

  const empty: CompanyFindings = {
    name: null,
    industry: null,
    employeeCount: null,
    revenueRange: null,
    location: null,
    signals: [{ tag: 'ASM', source: 'apollo', value: 'Not configured — no API key', note: 'APOLLO_API_KEY missing' }],
  };

  if (!key) return empty;

  try {
    const response = await fetch(`${APOLLO_API}/organizations/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': key,
      },
      body: JSON.stringify({ domain }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return {
        ...empty,
        signals: [{ tag: 'ASM', source: 'apollo', value: `Enrichment skipped — HTTP ${response.status}`, note: 'Apollo request failed' }],
      };
    }

    const data = await response.json();
    const org = data?.organization ?? {};
    const signals: Signal<string>[] = [];

    const name = org?.name ?? null;
    const industry = org?.industry ?? null;
    const employeeCount = typeof org?.estimated_num_employees === 'number' ? org.estimated_num_employees : null;
    const revenueRange = org?.estimated_annual_revenue ?? null;
    const location = org?.city ? `${org.city}` : null;

    if (name) signals.push({ tag: 'OBS', source: 'apollo', value: String(name).slice(0, 120), note: 'Company name' });
    if (industry) signals.push({ tag: 'OBS', source: 'apollo', value: String(industry).slice(0, 120), note: 'Industry' });
    if (employeeCount) signals.push({ tag: 'OBS', source: 'apollo', value: `~${employeeCount} employees`, note: 'Estimated headcount' });
    if (revenueRange) signals.push({ tag: 'OBS', source: 'apollo', value: String(revenueRange).slice(0, 80), note: 'Estimated revenue range' });

    if (signals.length === 0) {
      signals.push({ tag: 'ASM', source: 'apollo', value: 'No firmographic data returned', note: 'Company not found' });
    }

    return { name, industry, employeeCount, revenueRange, location, signals };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ...empty,
      signals: [{ tag: 'ASM', source: 'apollo', value: `Enrichment error — ${message}`, note: 'Apollo request failed' }],
    };
  }
}
