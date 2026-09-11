/**
 * BRAIN — deterministic proposed-solution classifier.
 *
 * Responsibility (deliberately narrow): decide whether a PROPOSED SOLUTION
 * explicitly describes a mechanism that would create an on-site
 * data-collection pathway (quiz, product finder, routine creator,
 * preference capture, survey/questionnaire, zero/first-party data capture…).
 *
 * This classification is MODEL ACTIVATION only. It never calculates revenue,
 * never invents values, and never calls an LLM — it is pure, transparent
 * keyword/phrase matching so the decision is auditable and deterministic.
 *
 * Distinction that matters downstream:
 *   hasQuiz                          = OBSERVED current business state
 *   solutionActivatesDataCollection  = PROPOSED-SOLUTION counterfactual
 *
 * Generic marketing/automation solutions (SEO, social management, generic
 * email marketing, paid ads, redesigns, branding, content, general CRO,
 * analytics) do NOT match any activation pattern and therefore do NOT
 * activate the ACR data-collection model.
 */

export interface SolutionClassification {
  /** True when the proposed solution explicitly creates a data-collection mechanism. */
  activatesDataCollection: boolean;
  /** The exact phrases that matched (deduplicated) — transparency/audit trail. */
  matchedPhrases: string[];
}

/**
 * Activation patterns. Each pattern targets an explicit customer-facing
 * first-party data-collection concept. Word-boundary anchored; case-insensitive.
 */
const ACTIVATION_PATTERNS: RegExp[] = [
  // Quizzes (product/recommendation/skin/routine/etc.) — "quiz" or "quizzes"
  /\bquiz(?:zes)?\b/i,
  /\bproduct\s+finder\b/i,
  /\bfit\s+finder\b/i,
  /\bproduct\s+recommendation\s+(quiz|engine|tool|system)\b/i,
  /\brecommendation\s+quiz\b/i,
  /\b(skin|skin\s*care|skincare|hair|beauty)\s+quiz\b/i,
  // Routine / regimen builders (covers "AI Skincare Routine Creator")
  /\broutine\s+(finder|creator|builder|generator|wizard)\b/i,
  /\bregimen\s+(finder|creator|builder|generator)\b/i,
  /\b(shade|scent|size)\s+(finder|match(er|ing)?)\b/i,
  // Personalization funnels that require customer input
  /\bpersonalized\s+(routine|regimen|recommendations?|product\s+recommendations?)\b/i,
  /\bpersonalized\s+product\s+recommendation/i,
  // Zero/first-party data capture
  /\bzero[-\s]?party\s+data\b/i,
  /\bfirst[-\s]?party\s+data\s+(capture|collection|strategy)\b/i,
  /\b(customer|shopper)\s+data\s+(capture|collection)\b/i,
  /\bdata\s+capture\s+(form|mechanism|flow|tool)\b/i,
  // Preference capture
  /\bpreference\s+(capture|collection|center|centre|quiz|profiling?)\b/i,
  /\bcustomer\s+preference\s+(capture|collection|profiling?)\b/i,
  /\bpreference\s+matching\b/i,
  // Questionnaires / surveys / guided intake
  /\bquestionnaire\b/i,
  /\bsurvey\b/i,
  /\bguided\s+(intake|flow)\b/i,
  // Signup / lead capture mechanisms
  /\b(sign\s*-?up|lead|email)\s+capture\b/i,
  /\bsign\s*-?up\s+(form|flow|mechanism|quiz)\b/i,
];

/**
 * Normalize text for matching: collapse whitespace so multi-word phrases
 * survive line breaks and double spaces.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Deterministically classify a proposed solution.
 * Pure function: identical input always yields identical output.
 */
export function classifyProposedSolution(
  proposedSolution: string | null | undefined
): SolutionClassification {
  if (!proposedSolution || !proposedSolution.trim()) {
    return { activatesDataCollection: false, matchedPhrases: [] };
  }

  const text = normalize(proposedSolution);
  const matchedPhrases = new Set<string>();

  for (const pattern of ACTIVATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) matchedPhrases.add(match[0].toLowerCase());
  }

  return {
    activatesDataCollection: matchedPhrases.size > 0,
    matchedPhrases: Array.from(matchedPhrases).sort(),
  };
}
