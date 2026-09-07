import { UserType } from './types';

export type { UserType };

/**
 * BRAIN runs one proprietary ACR Revenue Opportunity Model underneath two
 * distinct research experiences:
 *
 *   owner    — E-commerce Owners & Operators  ("Understand My Business")
 *   prospect — Freelancers, Agencies & Lead Generators ("Research My Prospect")
 *
 * Both modes share the same engine, evidence rules and calculation model.
 * They differ in customer-facing language, workspace labels, output columns
 * and how the analysis layer frames its interpretation.
 *
 * All customer-facing copy follows the MAPS standard: business before
 * technology, explain the principle before the tool, teach before selling,
 * never exaggerate results, never invent evidence.
 */
export interface ModeDefinition {
  key: UserType;
  /** Short mode label (badges, nav). */
  label: string;
  /** Audience name (landing page, chooser). */
  audience: string;
  /** MAPS-style primary CTA for this mode. */
  cta: string;
  /** Chooser card headline. */
  chooserTitle: string;
  /** Chooser card copy. */
  chooserCopy: string;
  /** Workspace page headline. */
  headline: string;
  /** Workspace intro paragraph. */
  intro: string;
  /** Column heads for the three input fields. */
  inputHeads: [string, string, string];
  /** Placeholders for the three input fields. */
  placeholders: [string, string, string];
  /** Accessible labels for the three input fields. */
  ariaLabels: [string, string, string];
  /** Helper note under the inputs. */
  helperNote: string;
  /** Empty-state copy. */
  emptyTitle: string;
  emptyCopy: string;
  /** Premium results column appended for this mode (paywalled beyond row 2). */
  premiumColumn?: { key: 'priorityChanges' | 'angleOfPitch'; head: string };
  /** Interpretation framing injected into the analysis prompt. */
  promptHeader: string;
  interpretation: string;
}

export const MODE_DEFINITIONS: Record<UserType, ModeDefinition> = {
  owner: {
    key: 'owner',
    label: 'Owner Research',
    audience: 'E-commerce Owners & Operators',
    cta: 'Understand My Business',
    chooserTitle: 'See your business the way an outside researcher would.',
    chooserCopy:
      'BRAIN researches your store across public intelligence sources, benchmarks it against relevant industry data, and maps where acquisition, conversion and retention may be limiting growth — before you commit budget to a new strategy, system or agency.',
    headline: 'Understand the business from the outside in.',
    intro:
      'Enter your business details below. BRAIN researches each brand across multiple intelligence sources, benchmarks what it finds against relevant industry data, and assesses your proposed initiative against the evidence — so the next decision is made on research, not guesswork. Up to 10 businesses per session.',
    inputHeads: ['Brand Name', 'Brand URL', 'Initiative / Strategy Proposed'],
    placeholders: [
      'e.g. Glow Skin Co (your business)',
      'e.g. glowskinco.com',
      'e.g. Launch post-purchase email lifecycle',
    ],
    ariaLabels: ['Brand name', 'Brand URL', 'Initiative or strategy proposed'],
    helperNote:
      'The brand name labels your results. The initiative you propose is assessed against the research evidence — describe the business outcome you are aiming for, not just the tool. Only the URL is required.',
    emptyTitle: 'Start Your Research',
    emptyCopy:
      'Enter your business URL above — name and proposed initiative are recommended — then run the research. BRAIN gathers what is publicly observable, benchmarks it, and returns a structured assessment you can act on.',
    premiumColumn: { key: 'priorityChanges', head: 'Priority Changes' },
    promptHeader: 'OWNER (e-commerce owner / operator)',
    interpretation:
      'The requester runs or operates this business. Frame the assessment as an internal decision document: what the evidence says about where the business stands across acquisition, conversion and retention (ACR), which gaps deserve attention first, and what decision this research should inform next. Put the business outcome before any tool, tactic or vendor. Explain the principle before recommending the mechanism. Do not pitch services. Keep revenue language cautious: "estimated incremental revenue opportunity" and "benchmark-based opportunity" — never guarantees.',
  },
  prospect: {
    key: 'prospect',
    label: 'Prospect Research',
    audience: 'Freelancers, Agencies & Lead Generators',
    cta: 'Research My Prospect',
    chooserTitle:
      'Research the prospect before the pitch, not after the rejection.',
    chooserCopy:
      'BRAIN researches a prospective client across public intelligence sources, identifies problems worth investigating, and tests whether the solution you propose is supported by the evidence — so your outreach opens with their business, not your service.',
    headline: 'Research the prospect. Assess the fit.',
    intro:
      'For each prospect, provide the business name, the website URL, and the solution you propose to deliver. BRAIN researches each business across multiple intelligence sources and assesses whether the evidence supports your proposed solution — up to 10 prospects per session.',
    inputHeads: ['Prospect Name', 'Prospect URL', 'Solution You Propose'],
    placeholders: [
      'e.g. Glow Skin Co',
      'e.g. glowskinco.com',
      'e.g. Implement email lifecycle automation',
    ],
    ariaLabels: ['Prospect name', 'Prospect URL', 'Solution you propose'],
    helperNote:
      'The prospect name labels your results. The solution you propose is assessed against the research evidence — BRAIN will tell you whether the observed signals support it, and what a discovery call would need to establish if they do not. Only the URL is required.',
    emptyTitle: 'Start Your Prospect Research',
    emptyCopy:
      'Enter each prospect\'s name, URL, and the solution you propose above, then run the research. BRAIN analyzes each business across multiple intelligence sources and tells you whether the evidence supports your pitch before you make it.',
    premiumColumn: { key: 'angleOfPitch', head: 'Angle of Pitch' },
    promptHeader: 'PROSPECT (freelancer / agency / lead generator)',
    interpretation:
      'The requester is researching this business as a potential client and has proposed a solution to deliver. Assess solution–evidence fit explicitly: use the "solutionFit" field to state a verdict (Supported / Partially supported / Not supported by current evidence / INSUFFICIENT_DATA) citing the specific observed signals and benchmark IDs behind it. Pitch angles belong in "opportunities" only when the evidence supports them. If the evidence is insufficient, say exactly what a discovery call would need to establish before the solution can be judged. Never endorse a solution the evidence does not support, and never invent evidence to validate a pitch.',
  },
};

export function getModeDefinition(userType: UserType): ModeDefinition {
  return MODE_DEFINITIONS[userType] ?? MODE_DEFINITIONS.prospect;
}

/** Validate an untrusted user_type value at the API boundary. */
export function isUserType(value: unknown): value is UserType {
  return value === 'owner' || value === 'prospect';
}
