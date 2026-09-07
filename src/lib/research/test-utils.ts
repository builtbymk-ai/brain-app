import { toNumber } from './signals';

/**
 * Parse a monthly-traffic display string back into a numeric estimate.
 * Shared between engine.ts and the validation harness so the harness
 * tests the exact production parsing logic.
 *
 * Returns null for 'Not found' or unparsable values — the analysis layer
 * treats null traffic as INSUFFICIENT_DATA rather than zero (MODEL RULES P4/R7).
 */
export function parseTrafficEstimateTestable(display: string): number | null {
  const cleaned = display
    .replace(/\(.*\)/, '')
    .replace(/\+/g, '')
    .trim()
    .toUpperCase();
  if (!cleaned || cleaned === 'NOT FOUND') return null;

  const match = cleaned.match(/^([\d.]+)\s*([KMB])$/);
  if (!match) return null;

  const num = toNumber(match[1]);
  if (num === null) return null;

  const multiplier = match[2] === 'K' ? 1_000 : match[2] === 'M' ? 1_000_000 : match[2] === 'B' ? 1_000_000_000 : 1;
  return Math.round(num * multiplier);
}
