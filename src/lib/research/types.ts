/**
 * Evidence classification tags used across the research engine.
 * [OBS] Observed     — directly captured from a source
 * [BMK] Benchmark    — industry / comparative reference
 * [ASM] Assumption   — explicit assumption, not observed
 * [DRV] Derived      — computed from observed/benchmark data
 */
export type EvidenceTag = 'OBS' | 'BMK' | 'ASM' | 'DRV';

export type UserType = 'owner' | 'prospect';

export interface Signal<T = string> {
  tag: EvidenceTag;
  source: string;
  value: T;
  /** Optional confidence note / reasoning. */
  note?: string;
}

export interface CapturedSignals {
  website: Signal<string>[] | null;
  social: Signal<string>[] | null;
  company: Signal<string>[] | null;
  traffic: Signal<string>[] | null;
  benchmarking: Signal<string>[] | null;
}

export type ResearchStatus = 'complete' | 'partial';

export interface BusinessResult {
  domain: string;
  displayName: string;
  /** User-supplied brand name (null if not provided). */
  brandName: string | null;
  /** User-supplied proposed solution assessed against the evidence (null if not provided). */
  proposedSolution: string | null;
  status: ResearchStatus;
  monthlyTraffic: string;
  products: string;
  reviews: string;
  quiz: string;
  revenueOpportunity: string;
  growthAssessment: string;
  rawSignals: CapturedSignals;
  analysis: AnalysisResult | null;
}

export interface Scenario {
  label: 'Conservative' | 'Base' | 'Aggressive';
  description: string;
  revenueLow: number;
  revenueHigh: number;
}

export interface AnalysisResult {
  /** Solution–evidence verdict (prospect mode only). */
  solutionFit?: string | null;
  scenarios: Scenario[];
  growthScore: number; // 0 - 100
  bottlenecks: string[];
  opportunities: string[];
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  /** Which analysis layer produced this result. */
  analysisSource?: string;

  // --- PREMIUM FIELDS (paywalled: free sessions receive them for the
  // first 2 rows only — enforced server-side in src/lib/paywall.ts) ---
  /** Business consequence of addressing the primary opportunity (both modes). */
  solutionImpact?: string | null;
  /** Owner mode: prioritized, evidence-ordered changes/investigations. */
  priorityChanges?: string[] | null;
  /** Prospect mode: pitch angle connecting the proposed solution to evidence. */
  angleOfPitch?: string | null;
}
