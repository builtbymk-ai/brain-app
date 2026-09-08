/**
 * Live OpenRouter test — exercises the secondary AI provider chain.
 * Requires OPENROUTER_API_KEY in the environment.
 */

import { analyzeBusiness } from '../src/lib/analysis/gemini';

async function main(): Promise<void> {
  console.log('=== OPENROUTER LIVE TEST ===\n');

  const apiKey = process.env.OPENROUTER_API_KEY;
  const primaryModel = process.env.OPENROUTER_PRIMARY_MODEL;
  const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL;
  
  console.log(`OPENROUTER_API_KEY: ${apiKey ? 'present' : 'MISSING'}`);
  console.log(`OPENROUTER_PRIMARY_MODEL: ${primaryModel ?? 'not set'}`);
  console.log(`OPENROUTER_FALLBACK_MODEL: ${fallbackModel ?? 'not set'}`);
  console.log(`GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? 'present' : 'MISSING'}\n`);

  if (!apiKey) {
    console.log('SKIP: OPENROUTER_API_KEY not set — cannot test live OpenRouter');
    process.exit(0);
  }

  // Test 1: Owner mode — should go through Gemini chain, possibly OpenRouter if Gemini fails
  console.log('[Test 1] Owner mode — realistic business');
  const ownerInput = {
    domain: 'gymshark.com',
    brandName: 'Gymshark',
    userType: 'owner' as const,
    traffic: 1200000,
    products: 500,
    reviews: 50000,
    followerEstimate: 2500000,
    employeeCount: 800,
    hasQuiz: false,
    remark: 'Major fitness apparel brand with strong social presence.',
  };

  const ownerResult = await analyzeBusiness(ownerInput);
  console.log(`  analysisSource: ${ownerResult.analysisSource}`);
  console.log(`  confidence: ${ownerResult.confidence}`);
  console.log(`  scenarios[0].revenueLow: ${ownerResult.scenarios[0]?.revenueLow}`);
  console.log(`  solutionImpact present: ${Boolean(ownerResult.solutionImpact)}`);
  console.log(`  priorityChanges present: ${Boolean(ownerResult.priorityChanges?.length)}`);
  console.log(`  angleOfPitch present: ${Boolean(ownerResult.angleOfPitch)}`);
  console.log(`  owner-specific: priorityChanges=${Boolean(ownerResult.priorityChanges)}, angleOfPitch=${Boolean(ownerResult.angleOfPitch)}`);
  console.log('');

  // Test 2: Prospect mode
  console.log('[Test 2] Prospect mode — with proposed solution');
  const prospectInput = {
    domain: 'allbirds.com',
    brandName: 'Allbirds',
    userType: 'prospect' as const,
    proposedSolution: 'Implement post-purchase email lifecycle using purchase history to trigger replenishment reminders and personalized follow-ups.',
    traffic: 800000,
    products: 100,
    reviews: 20000,
    followerEstimate: 1200000,
    employeeCount: 600,
    hasQuiz: false,
    remark: 'Sustainable footwear brand with DTC model.',
  };

  const prospectResult = await analyzeBusiness(prospectInput);
  console.log(`  analysisSource: ${prospectResult.analysisSource}`);
  console.log(`  confidence: ${prospectResult.confidence}`);
  console.log(`  solutionFit present: ${Boolean(prospectResult.solutionFit)}`);
  console.log(`  solutionImpact present: ${Boolean(prospectResult.solutionImpact)}`);
  console.log(`  angleOfPitch present: ${Boolean(prospectResult.angleOfPitch)}`);
  console.log(`  prospect-specific: solutionFit=${Boolean(prospectResult.solutionFit)}, angleOfPitch=${Boolean(prospectResult.angleOfPitch)}`);
  console.log('');

  console.log('=== TEST COMPLETE ===');
  console.log(`Owner source: ${ownerResult.analysisSource}`);
  console.log(`Prospect source: ${prospectResult.analysisSource}`);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
