/**
 * BRAIN_BENCHMARK_SUMMARY — curated Gemini-facing benchmark library.
 *
 * This is NOT a second authoritative benchmark database. The authoritative
 * records live in src/lib/analysis/benchmarks.ts (typed numeric layer) and
 * benchmark-bundle.generated.ts (full library text). This module is a
 * concise INTERPRETATION library: it carries each curated record's id,
 * metric, value, category, source, dataset/sample/period metadata and
 * validation status so Gemini can reason about applicability without
 * receiving the entire benchmark.txt dump.
 *
 * Rules encoded here (mirrors the calculator's contract):
 *  - Values are copied verbatim from benchmarks.ts — never altered.
 *  - Unverified records are clearly marked UNVERIFIED and must never drive
 *    quantitative revenue math (MODEL RULES R6) nor be presented as
 *    validated benchmarks.
 */

import {
  AOV_BENCHMARKS,
  CONVERSION_BENCHMARKS,
  QUIZ_BENCHMARKS,
  RETENTION_BENCHMARKS,
  SUPPORT_BENCHMARKS,
} from '../benchmarks';
import type { BenchmarkRecord } from '../types';

function formatRecord(b: BenchmarkRecord): string {
  const status = b.verification === 'verified' ? 'VERIFIED' : 'UNVERIFIED — context only, must NOT drive revenue math';
  const meta: string[] = [];
  if (b.dataset) meta.push(`dataset: ${b.dataset}`);
  if (b.sampleSize) meta.push(`sample: ${b.sampleSize}`);
  if (b.period) meta.push(`period: ${b.period}`);
  const caution = b.caution ? ` | Caution: ${b.caution}` : '';
  return `- ${b.id} — ${b.metric} = ${b.displayValue} | ${b.source}${meta.length ? ` | ${meta.join(' | ')}` : ''} | Status: ${status}${caution}`;
}

function section(title: string, records: BenchmarkRecord[]): string {
  return [`## ${title}`, ...records.map(formatRecord)].join('\n');
}

const CURATED_SECTIONS = [
  section('CONVERSION BENCHMARKS', CONVERSION_BENCHMARKS),
  section('DATA-COLLECTION / QUIZ BENCHMARKS', QUIZ_BENCHMARKS),
  section('RETENTION BENCHMARKS', RETENTION_BENCHMARKS),
  section('AOV BENCHMARKS', AOV_BENCHMARKS),
  section('REVENUE-PROTECTION BENCHMARKS', SUPPORT_BENCHMARKS),
];

/**
 * Contextual verified references retained for interpretation quality.
 * Values copied verbatim from the benchmark library (BENCHMARK 028, 030,
 * 031, 070, 071, 072). These support narrative interpretation of ACR
 * dimensions; the calculator never uses them as revenue-math inputs.
 */
const CONTEXTUAL_REFERENCES = [
  '## CONTEXTUAL REFERENCES (interpretation only — never revenue-math inputs)',
  '- BENCHMARK 028 — Automated email conversion ~1.49% vs campaign ~0.08% (Omnisend 2026, 20B+ emails / 27,000+ brands). VERIFIED. Caution: the ~19x difference is NOT causal proof automation multiplies a specific store\'s conversion.',
  '- BENCHMARK 030 — Automated emails generate ~37% of email-driven sales from ~2% of email volume (Omnisend 2025). VERIFIED.',
  '- BENCHMARK 031 — Welcome, cart-abandonment and browse-abandonment flows produce ~87% of automated orders (Omnisend). VERIFIED.',
  '- BENCHMARK 070 — Quiz completion ~70–80% considered good, defined as completed/started (Outgrow). VERIFIED.',
  '- BENCHMARK 071 — Quiz lead conversion ~25–30% considered good; results-page offer ~10–12% (Outgrow). VERIFIED. Caution: lead conversion is NOT purchase conversion.',
  '- BENCHMARK 072 — Quiz results-page CTA click ~15–20% considered good (Outgrow). VERIFIED.',
].join('\n');

const HEADER = `## BRAIN BENCHMARK LIBRARY — CURATED V1 INTERPRETATION SET
Selection order when choosing the applicable record: industry match > business model > geography > date > denominator > definition. Never blend records from different sources into one number. Cite the benchmark ID you rely on. Records marked UNVERIFIED are context only: never use their values in quantitative reasoning and never present them as validated.`;

export const BRAIN_BENCHMARK_SUMMARY: string = [
  HEADER,
  ...CURATED_SECTIONS,
  CONTEXTUAL_REFERENCES,
].join('\n\n');
