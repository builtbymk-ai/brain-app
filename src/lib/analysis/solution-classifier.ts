/**
 * BRAIN — deterministic proposed-solution classifier.
 *
 * THE authoritative, single-source classifier for proposed-solution
 * intervention knowledge. It is responsible for TWO distinct decisions:
 *
 *   1. Data-collection ACTIVATION — does the proposed solution explicitly
 *      describe a mechanism that would create an on-site data-collection
 *      pathway (quiz, product finder, routine creator, preference capture,
 *      survey/questionnaire, zero/first-party data capture…)?
 *
 *   2. Intervention DIMENSION — which business-intervention category does the
 *      proposal belong to (CONVERSION / RETENTION / ACQUISITION / UNKNOWN)?
 *      The dimension describes the intervention concept ONLY. It never
 *      implies that a revenue calculation pathway exists — supported-pathway
 *      knowledge lives in the calculator + revenue-state layer, not here.
 *
 * This classification is MODEL ACTIVATION / taxonomy only. It never calculates
 * revenue, never invents values, and never calls an LLM — it is pure,
 * transparent keyword/phrase matching so the decision is auditable and
 * deterministic.
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

/** Business-intervention category of a proposed solution. Describes the
 * intervention concept only — NEVER whether a revenue calculation pathway
 * exists for it (INTervention dimension ≠ supported revenue pathway). */
export type InterventionDimension = 'CONVERSION' | 'RETENTION' | 'ACQUISITION' | 'UNKNOWN';

export interface SolutionClassification {
  /** True when the proposed solution explicitly creates a data-collection mechanism. */
  activatesDataCollection: boolean;
  /** Business-intervention category (taxonomy only — not pathway support). */
  dimension: InterventionDimension;
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
    return { activatesDataCollection: false, dimension: 'UNKNOWN', matchedPhrases: [] };
  }

  const text = normalize(proposedSolution);
  const matchedPhrases = new Set<string>();

  for (const pattern of ACTIVATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) matchedPhrases.add(match[0].toLowerCase());
  }

  return {
    activatesDataCollection: matchedPhrases.size > 0,
    dimension: classifyDimension(text),
    matchedPhrases: Array.from(matchedPhrases).sort(),
  };
}

// ---------------------------------------------------------------------------
// Intervention dimension classification (V2C).
//
// The dimension is the business-intervention CATEGORY of the proposal —
// taxonomy only. It never implies that BRAIN has a revenue calculation
// pathway for it: e.g. "abandoned checkout recovery" is CONVERSION yet
// currently NOT_SUPPORTED for revenue, while "replenishment automation" is
// RETENTION and reaches the existing retention analytical pathway.
//
// Precedence when several concepts appear in one proposal (deterministic):
//   1. Whole-concept phrases first (e.g. "retention email", "paid
//      acquisition", "abandoned checkout recovery") — the strongest explicit
//      intervention concept wins.
//   2. Then category keyword families, evaluated RETENTION → ACQUISITION →
//      CONVERSION so that intervention-specific concepts are not swallowed by
//      the broadest family. The families use word-boundary discipline and
//      concept-level phrases (never bare "customer", "email", "ads", or
//      "data"), so generic words alone cannot decide a dimension.
//   3. Explicit category overrides (below) re-anchor misfamilies phrases
//      whose strongest concept is unambiguous.
//   4. Nothing matched → UNKNOWN (never guessed).
// ---------------------------------------------------------------------------

/** Whole-concept phrases — strongest explicit intervention concepts. */
const DIMENSION_CONCEPTS: ReadonlyArray<{ dimension: InterventionDimension; phrases: RegExp[] }> = [
  {
    dimension: 'CONVERSION',
    phrases: [
      /\babandoned\s+checkout\b/i,
      /\bcheckout\s+recovery\b/i,
      /\bcart\s+recovery\b/i,
      /\bcheckout\s+optimi[sz]ation\b/i,
      /\b(cart|checkout)\s+abandonment\b/i,
      /\bproduct\s+page\s+conversion\b/i,
      /\bupsell(?:s|ing)?\b/i,
      /\bcross[-\s]?sell(?:s|ing)?\b/i,
      /\bbundl(?:e|es|ing)\b/i,
    ],
  },
  {
    dimension: 'RETENTION',
    phrases: [
      /\bcustomer\s+retention\b/i,
      /\bretention\s+(?:strategy|email|emails|campaign|automation|program|rate|workflow)\b/i,
      /\brepeat[-\s]?purchase(?:s|\s+automation|\s+rate|\s+workflow)?\b/i,
      /\breplenish(?:ment|ing)?\b/i,
      /\bwin[-\s]?back\b/i,
      /\bwinback\b/i,
      /\brewin[-\s]?back\b/i,
      /\breactivation\b/i,
      /\bre[-\s]?engagement\b/i,
      /\bpost[-\s]?purchase\s+lifecycle\b/i,
      /\bcustomer\s+lifecycle\b/i,
      /\blifetime\s+value\b/i,
      /\bltv\b/i,
      /\bloyalty\b/i,
      /\bsubscription(?:s|\s+program|\s+model)?\b/i,
      /\bsubscribe\s+and\s+save\b/i,
      /\bchurn\b/i,
      // Bare "lifecycle" — covers "customer education lifecycle" (V2B audit
      // #17) and generic lifecycle programs; conversion-mechanical phrases
      // like "post-purchase upsells" are decided earlier by CONVERSION
      // concepts (precedence rule 1).
      /\blifecycle\b/i,
      /\breorder\b/i,
      /\brepurchase\b/i,
      /\bauto[-\s]?replenishment\b/i,
      /\bcustomer\s+retention\s+workflow\b/i,
    ],
  },
  {
    dimension: 'ACQUISITION',
    phrases: [
      /\bsearch\s+engine\s+optimi[sz]ation\b/i,
      /\bseo\b/i,
      /\bpaid\s+adverti(?:sing|sements?|sements?)\b/i,
      /\bpaid\s+ads?\b/i,
      /\bppc\b/i,
      /\bgoogle\s+ads\b/i,
      /\bmeta\s+ads\b/i,
      /\bsocial\s+media\s+(?:acquisition|campaigns?|marketing|growth)\b/i,
      /\blead\s+gen(?:eration)?\b/i,
      /\blead\s+magnet\b/i,
      /\bprospecting\b/i,
      /\breferral\s+acquisition\b/i,
      /\b(?:new\s+)?customer\s+acquisition\b/i,
      /\btraffic\s+acquisition\b/i,
      /\binfluencer\s+acquisition\b/i,
      /\binfluencer\s+marketing\b/i,
    ],
  },
];

/**
 * Category keyword families — weaker signals than whole concepts. Evaluated
 * RETENTION → ACQUISITION → CONVERSION (see precedence note above). Every
 * pattern is a concept-level phrase; bare generic words ("customer",
 * "email", "ads", "data") never appear here.
 */
const DIMENSION_FAMILIES: ReadonlyArray<{ dimension: InterventionDimension; patterns: RegExp[] }> = [
  {
    dimension: 'RETENTION',
    patterns: [
      /\bretention\b/i,
      /\breplenish(?:ment|ing)?\b/i,
      /\bwin[-\s]?back\b/i,
      /\bwinback\b/i,
      /\breactivation\b/i,
      /\brepurchase\b/i,
      /\bre[-\s]?order\b/i,
      /\bsubscription(?:s|\s+program|\s+model)?\b/i,
      /\bloyalty\b/i,
      /\bchurn\b/i,
      /\brepeat[-\s]?purchase\b/i,
      /\bpost[-\s]?purchase\b/i,
    /\blifetime\s+value\b/i,
      /\bltv\b/i,
    ],
  },
  {
    dimension: 'ACQUISITION',
    patterns: [
      /\bseo\b/i,
      /\bsearch\s+engine\s+optimi[sz]ation\b/i,
      /\bpaid\s+(?:ads?|adverti(?:sing|sements?)|search|social|media|acquisition|campaigns?)\b/i,
      /\bppc\b/i,
      /\b(?:google|meta)\s+ads\b/i,
      /\blead\s+gen(?:eration)?\b/i,
      /\blead\s+magnet\b/i,
      /\bprospecting\b/i,
      /\breferral(?:s|\s+program|\s+acquisition)?\b/i,
      /\breferral\s+acquisition\b/i,
    ],
  },
  {
    dimension: 'CONVERSION',
    patterns: [
      /\babandoned\s+checkout\b/i,
      /\bcheckout\s+recovery\b/i,
      /\b(?:cart|checkout)\s+abandonment\b/i,
      /\b(?:upsell|cross[-\s]?sell)\b/i,
      /\bbundl(?:e|es|ing)\b/i,
      /\bcro\b/i,
      /\bconversion\s+(?:optimi[sz]ation|rate|funnel)\b/i,
      /\b(?:quiz(?:zes)?|product\s+finder|fit\s+finder|routine\s+(?:creator|finder|builder|generator)|regimen\s+(?:creator|builder)|recommendation\s+quiz|product\s+recommendations?|personalized\s+(?:routine|regimen|recommendations?|product\s+recommendations?))\b/i,
      /\b(?:zero|first)[-\s]?party\s+data\b/i,
      /\bpreference\s+(?:capture|collection|center|centre|quiz|profiling?)\b/i,
      /\b(?:questionnaire|survey)\b/i,
      /\b(?:sign\s*-?up|lead|email)\s+capture\b/i,
    ],
  },
];

/**
 * Deterministic dimension classification: concepts → families → UNKNOWN.
 * Pure function; identical input always yields identical output.
 */
function classifyDimension(text: string): InterventionDimension {
  // 1. Whole-concept phrases (strongest explicit intervention concepts).
  for (const group of DIMENSION_CONCEPTS) {
    for (const p of group.phrases) {
      if (p.test(text)) return group.dimension;
      
    }
  }

  // 2. Category keyword families (RETENTION → ACQUISITION → CONVERSION).
  for (const family of DIMENSION_FAMILIES) {
    for (const p of family.patterns) {
      if (p.test(text)) return family.dimension;
    }
  }

  // 3. Nothing matched — never guess.
  return 'UNKNOWN';
}
