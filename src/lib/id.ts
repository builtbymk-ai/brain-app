import { randomBytes, randomUUID } from 'crypto';

/** URL-safe random session token generated server-side. */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateId(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Normalize a user-supplied business input into a clean domain.
 * Accepts full URLs (https://store.example.com/page) or bare domains.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let value = trimmed;
  // Strip protocol
  value = value.replace(/^https?:\/\//i, '');
  // Strip www.
  value = value.replace(/^www\./i, '');
  // Strip path, query, hash
  value = value.split('/')[0].split('?')[0].split('#')[0];

  // Basic domain validation
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return null;

  // Remove a single trailing dot
  value = value.replace(/\.$/, '');
  return value.toLowerCase();
}
