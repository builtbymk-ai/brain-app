import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { AnalysisResult } from './research/types';
import { UserType } from './analysis/types';

/**
 * Server-side premium paywall.
 *
 * Free sessions see the full premium column (Solution Impact / Priority
 * Changes / Angle of Pitch) for the FIRST 2 rows only; every later row has
 * those fields stripped BEFORE the response leaves the server. The browser
 * can never recover the hidden values by inspecting the API response — they
 * are simply absent from the payload. The paid export (verify route) reads
 * the full database rows directly and is unaffected.
 */

/** How many rows show premium fields for free sessions. */
export const FREE_PREMIUM_ROWS = 2;

/**
 * Query whether the session's latest export transaction is paid.
 * DB errors resolve to `false` (fail closed — free view).
 */
export async function isSessionPaid(sessionId: string | null | undefined): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const paid = await db.query.exportTransactions.findFirst({
      where: eq(schema.exportTransactions.sessionId, sessionId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    return paid?.paymentStatus === 'paid' && paid?.exportStatus === 'unlocked';
  } catch (error) {
    console.error('Paywall: failed to check payment status, treating as unpaid:', error);
    return false;
  }
}

/**
 * Strip premium fields from rows beyond the free allowance.
 * Accepts both typed BusinessResult rows and raw DB rows (jsonb analysis is
 * `unknown` there); narrows internally. Returns rows safe to serialize to an
 * unpaid client.
 */
export function applyPaywall<T extends { analysis: unknown }>(rows: T[], paid: boolean): T[] {
  if (paid) return rows;
  return rows.map((row, index) => {
    const a = row.analysis as AnalysisResult | null | undefined;
    if (!a || typeof a !== 'object') return row;
    if (!(a.solutionImpact || a.priorityChanges?.length || a.angleOfPitch)) return row;
    if (index < FREE_PREMIUM_ROWS) return row;
    return {
      ...row,
      analysis: {
        ...a,
        solutionImpact: null,
        priorityChanges: null,
        angleOfPitch: null,
      },
    } as T;
  });
}

/**
 * The mode-specific premium column label used in UI/export headers.
 * Kept next to the paywall so the free preview and the paid export always
 * describe the same field.
 */
export function premiumColumnFor(userType: UserType): 'priorityChanges' | 'angleOfPitch' {
  return userType === 'owner' ? 'priorityChanges' : 'angleOfPitch';
}
