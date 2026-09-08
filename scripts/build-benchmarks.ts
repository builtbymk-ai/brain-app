/**
 * Build-time generator: converts the benchmark + model-rules text files into
 * a server-safe bundled TypeScript module. Run via `bun run benchmarks:build`.
 * The generated file is committed to the repo so production never needs
 * runtime filesystem access to the source .txt files.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ANALYSIS_DIR = join(process.cwd(), 'src', 'lib', 'analysis');
const BENCHMARK_PATH = join(ANALYSIS_DIR, 'benchmark.txt');
const RULES_PATH = join(ANALYSIS_DIR, 'model-rules.txt');
const OUTPUT_PATH = join(ANALYSIS_DIR, 'benchmark-bundle.generated.ts');

function escapeTemplate(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

try {
  const benchmark = readFileSync(BENCHMARK_PATH, 'utf-8');
  const rules = readFileSync(RULES_PATH, 'utf-8');

  const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: src/lib/analysis/benchmark.txt and model-rules.txt.
 * Regenerate with: bun run benchmarks:build
 *
 * This module bundles the BRAIN benchmark knowledge and model rules as
 * string constants so they are guaranteed to be present in the production
 * server runtime (no filesystem access required).
 */

export const BENCHMARK_LIBRARY = \`${escapeTemplate(benchmark)}\`;

export const MODEL_RULES = \`${escapeTemplate(rules)}\`;
`;

  writeFileSync(OUTPUT_PATH, out, 'utf-8');
  console.log(`[benchmarks:build] Wrote ${OUTPUT_PATH}`);
  console.log(`[benchmarks:build] benchmark.txt: ${benchmark.length} chars`);
  console.log(`[benchmarks:build] model-rules.txt: ${rules.length} chars`);
  process.exit(0);
} catch (error) {
  console.error('[benchmarks:build] FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
}
