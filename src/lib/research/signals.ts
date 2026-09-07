import { EvidenceTag, Signal } from './types';

/** Create an observed signal. */
export function obs(value: string, source: string, note?: string): Signal {
  return { tag: 'OBS', source, value, note };
}

/** Create a benchmark signal. */
export function bmk(value: string, source: string, note?: string): Signal {
  return { tag: 'BMK', source, value, note };
}

/** Create an assumption signal. */
export function asm(value: string, source: string, note?: string): Signal {
  return { tag: 'ASM', source, value, note };
}

/** Create a derived signal. */
export function drv(value: string, source: string, note?: string): Signal {
  return { tag: 'DRV', source, value, note };
}

/** Format a number as a compact string (e.g. 48000 -> 48K+). */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

/** Safely parse a number, returning null when missing/invalid. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Count matches in a raw text blob, used for product/catalog signals. */
export function countMatches(haystack: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    const matches = haystack.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}
