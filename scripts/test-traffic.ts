/**
 * Test suite for monthly traffic estimation.
 * Tests the SimilarWeb integration and traffic parsing logic.
 */

import { parseTrafficEstimateTestable } from '../src/lib/research/test-utils';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`);
    passed++;
  } else {
    console.error(`  FAIL  ${message}`);
    failed++;
  }
}

console.log('=== TRAFFIC ESTIMATION TESTS ===\n');

// Test 1: parseTrafficEstimateTestable with various formats
console.log('[1] Traffic parsing');

assert(parseTrafficEstimateTestable('Not found') === null, 'Not found returns null');
assert(parseTrafficEstimateTestable('') === null, 'Empty string returns null');
assert(parseTrafficEstimateTestable('48K+') === 48000, '48K+ parses to 48000');
assert(parseTrafficEstimateTestable('1.5M+') === 1500000, '1.5M+ parses to 1500000');
assert(parseTrafficEstimateTestable('2.3B+') === 2300000000, '2.3B+ parses to 2300000000');
assert(parseTrafficEstimateTestable('100K+') === 100000, '100K+ parses to 100000');
assert(parseTrafficEstimateTestable('500+') === null, 'Bare number without suffix returns null');
assert(parseTrafficEstimateTestable('abc') === null, 'Non-numeric string returns null');
assert(parseTrafficEstimateTestable('48K') === 48000, '48K without + parses to 48000');
assert(parseTrafficEstimateTestable('1.2M') === 1200000, '1.2M without + parses to 1200000');

// Test 2: Edge cases
console.log('\n[2] Edge cases');

assert(parseTrafficEstimateTestable('(48K+)') === null, 'Parenthesized value returns null (parentheses removed as annotation)');
assert(parseTrafficEstimateTestable('10K+') === 10000, '10K+ parses to 10000');
assert(parseTrafficEstimateTestable('100M+') === 100000000, '100M+ parses to 100000000');
assert(parseTrafficEstimateTestable('1B+') === 1000000000, '1B+ parses to 1000000000');

// Test 3: Invalid formats
console.log('\n[3] Invalid formats');

assert(parseTrafficEstimateTestable('48') === null, 'Bare number returns null');
assert(parseTrafficEstimateTestable('48K+ visits') === null, 'Value with trailing text returns null');
assert(parseTrafficEstimateTestable('K48') === null, 'Suffix before number returns null');
assert(parseTrafficEstimateTestable('48.5.5K') === 48500, 'Multiple decimal points: parser extracts first valid number (48.5K)');

console.log(`\n=== TRAFFIC TESTS: ${passed} passed, ${failed} failed ===`);

process.exit(failed > 0 ? 1 : 0);
