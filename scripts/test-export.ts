/** Export serializer tests — CSV structure, premium columns, JSON shape. */

import { toCsv, toJson, ExportRowPayload } from '../src/lib/export/serialize';
import { BusinessResult, AnalysisResult } from '../src/lib/research/types';

export {};

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    scenarios: [],
    growthScore: 42,
    bottlenecks: [],
    opportunities: [],
    confidence: 'low',
    summary: 'test summary',
    solutionImpact:
      '[DRV] Fixing checkout friction converts the existing 10K visits instead of buying more traffic.',
    priorityChanges: [
      '1. Verify traffic in analytics [OBS missing]',
      '2. Audit quiz capture [OBS]',
    ],
    angleOfPitch: '[ASM] Lead with the 31 product markers; discovery must establish AOV.',
    ...overrides,
  };
}

function makeBusiness(overrides: Partial<BusinessResult> = {}): BusinessResult {
  return {
    domain: 'example.com',
    displayName: 'Example Co',
    brandName: 'Example',
    proposedSolution: 'Email lifecycle',
    status: 'complete',
    monthlyTraffic: 'Not found',
    products: '31',
    reviews: '1200',
    quiz: 'Present',
    revenueOpportunity: '$1,200 - $2,400 /mo (est.)',
    growthAssessment: '42 / 100',
    rawSignals: { website: null, social: null, company: null, traffic: null, benchmarking: null },
    analysis: makeAnalysis(),
    ...overrides,
  };
}

const rows: ExportRowPayload[] = [
  { business: makeBusiness() },
  {
    business: makeBusiness({
      domain: 'second.com',
      displayName: 'Second',
      brandName: null,
      analysis: makeAnalysis({
        solutionImpact: null,
        priorityChanges: null,
        angleOfPitch: null,
      }),
    }),
  },
];

// ---- OWNER CSV ----
const ownerCsv = toCsv(rows, 'owner');
const ownerLines = ownerCsv.split('\n');
check('owner: header row exists', ownerLines.length === 3);
check(
  'owner: premium headers present',
  ownerLines[0].includes('SolutionImpact') && ownerLines[0].includes('PriorityChanges')
);
check(
  'owner: customer-facing terminology (OnsiteDataCollection, PotentialRevenueLift, RevenueCalculation)',
  ownerLines[0].includes('OnsiteDataCollection') &&
    ownerLines[0].includes('PotentialRevenueLift') &&
    ownerLines[0].includes('RevenueCalculation') &&
    !ownerLines[0].includes('Quiz') &&
    !ownerLines[0].includes('RevenueOpportunity')
);
check('owner: 12 columns in header', ownerLines[0].split(',').length === 12);
check(
  'owner: revenue calculation trail present in row',
  ownerLines[1].includes('AOV =') || ownerLines[1].includes('Unavailable')
);
check(
  'owner: row 1 carries priorityChanges numbered list',
  ownerLines[1].includes('1. Verify traffic in analytics')
);
check(
  'owner: row with null premium falls back to Unavailable',
  ownerLines[2].includes('Unavailable')
);
check('owner: quotes multiline/quoted cells', ownerLines[1].includes('"') === true);

// ---- PROSPECT CSV ----
const prospectCsv = toCsv(rows, 'prospect');
const prospectHeader = prospectCsv.split('\n')[0];
check(
  'prospect: AngleOfPitch header replaces PriorityChanges',
  prospectHeader.includes('AngleOfPitch') && !prospectHeader.includes('PriorityChanges')
);
check(
  'prospect: customer-facing terminology matches owner',
  prospectHeader.includes('OnsiteDataCollection') && prospectHeader.includes('PotentialRevenueLift')
);
check(
  'prospect: row 1 carries angleOfPitch',
  prospectCsv.split('\n')[1].includes('Lead with the 31 product markers')
);

// ---- CSV escaping ----
const tricky = toCsv(
  [
    {
      business: makeBusiness({
        brandName: 'Quote"Brand, Inc',
        analysis: makeAnalysis({ solutionImpact: 'Line1\nLine2' }),
      }),
    },
  ],
  'owner'
);
check('escaping: embedded quote doubled', tricky.includes('""'));
check('escaping: multiline cell wrapped in quotes', /"Line1\nLine2"/.test(tricky));

// ---- DEFAULT userType ----
const defaultCsv = toCsv(rows);
check('default userType is owner', defaultCsv.split('\n')[0].includes('PriorityChanges'));

// ---- JSON ----
const ownerJson = JSON.parse(toJson(rows, 'owner'));
check('json: disclaimer present', typeof ownerJson.disclaimer === 'string');
check('json: exportType owner', ownerJson.exportType === 'owner');
check('json: potentialRevenueLift present', 'potentialRevenueLift' in ownerJson.businesses[0]);
check('json: onsiteDataCollection present', 'onsiteDataCollection' in ownerJson.businesses[0]);
check('json: legacy quiz/revenueOpportunity keys removed from customer payload', !('quiz' in ownerJson.businesses[0]) && !('revenueOpportunity' in ownerJson.businesses[0]));
check(
  'json: owner carries priorityChanges',
  ownerJson.businesses[0].priorityChanges.includes('1. Verify traffic in analytics')
);
check('json: no angleOfPitch key for owner', !('angleOfPitch' in ownerJson.businesses[0]));

const prospectJson = JSON.parse(toJson(rows, 'prospect'));
check('json: exportType prospect', prospectJson.exportType === 'prospect');
check(
  'json: prospect carries angleOfPitch',
  prospectJson.businesses[0].angleOfPitch.includes('Lead with the 31 product markers')
);
check('json: no priorityChanges key for prospect', !('priorityChanges' in prospectJson.businesses[0]));
check('json: rawSignals preserved', 'rawSignals' in prospectJson.businesses[0]);
check('json: all rows included', prospectJson.businesses.length === 2);

// ---- Null analysis ----
const noAnalysis = toCsv([{ business: makeBusiness({ analysis: null }) }], 'prospect');
check('null analysis: Unavailable fallbacks', noAnalysis.split('\n')[1].includes('Unavailable'));

console.log(`\n${pass}/${pass + fail} export tests passed`);
if (fail > 0) process.exit(1);
