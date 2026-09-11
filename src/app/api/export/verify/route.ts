import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { verifyCheckoutSession } from '@/lib/bachs';
import { toCsv, toJson, ExportRowPayload } from '@/lib/export/serialize';
import { uploadFile, createDownloadUrl, isR2Configured } from '@/lib/r2';
import { generateId } from '@/lib/id';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Verify the payment server-side against Bachs before unlocking the export.
 * The browser supplies only the BRAIN reference; the authoritative payment
 * state comes from Bachs' own checkout-session endpoint (payment_status),
 * never from browser parameters. Only after Bachs confirms `succeeded` do we
 * generate and serve the file.
 */
export async function POST(request: Request) {
  let body: { reference?: string; checkoutId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { reference, checkoutId } = body;
  if (!reference && !checkoutId) {
    return NextResponse.json({ error: 'Missing payment reference' }, { status: 400 });
  }

  // Look up the transaction by BRAIN reference (the browser never provides amounts).
  const transaction = reference
    ? await db.query.exportTransactions.findFirst({
        where: eq(schema.exportTransactions.transactionRef, reference),
      })
    : null;

  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  const sessionIdForBachs = checkoutId ?? extractCheckoutId(transaction.authorizationUrl);
  if (!sessionIdForBachs) {
    return NextResponse.json(
      { error: 'Payment could not be verified. Try again or contact support.' },
      { status: 502 }
    );
  }

  const verification = await verifyCheckoutSession(sessionIdForBachs);
  if (!verification) {
    return NextResponse.json(
      { error: 'Payment could not be verified. Try again or contact support.' },
      { status: 502 }
    );
  }

  if (verification.status !== 'paid') {
    return NextResponse.json(
      { status: verification.status, error: 'Payment not confirmed. Export is still locked.' },
      { status: 402 }
    );
  }

  // Server-side amount check: what Bachs actually collected must match
  // the authorized export price (150 cents = $1.50).
  const collected = Math.round(Number(verification.amount) * 100);
  if (Number.isFinite(collected) && collected > 0 && collected !== transaction.amount) {
    await db
      .update(schema.exportTransactions)
      .set({ paymentStatus: 'failed', updatedAt: new Date() })
      .where(eq(schema.exportTransactions.id, transaction.id));
    return NextResponse.json(
      { error: 'Payment amount mismatch. Export remains locked.' },
      { status: 402 }
    );
  }

  // The export's premium column follows the session's research mode.
  const session = transaction.sessionId
    ? await db.query.researchSessions.findFirst({
        where: eq(schema.researchSessions.id, transaction.sessionId),
      })
    : null;
  const userType: 'owner' | 'prospect' = session?.userType === 'owner' ? 'owner' : 'prospect';

  const results = await db.query.businesses.findMany({
    where: eq(schema.businesses.sessionId, transaction.sessionId ?? ''),
    orderBy: (b, { asc }) => [asc(b.createdAt)],
  });

  const payloads: ExportRowPayload[] = results.map((r) => ({
    business: {
      domain: r.domain,
      displayName: r.brandName ?? r.displayName ?? r.domain,
      brandName: r.brandName ?? null,
      proposedSolution: r.proposedSolution ?? null,
      status: r.status as 'complete' | 'partial',
      monthlyTraffic: r.monthlyTraffic ?? 'Not found',
      products: r.products ?? 'Not found',
      reviews: r.reviews ?? 'Not found',
      quiz: r.quiz ?? 'Not found',
      revenueOpportunity: r.revenueOpportunity ?? 'Unavailable',
      growthAssessment: r.growthAssessment ?? 'Unavailable',
      rawSignals: (r.rawSignals as never) ?? {},
      analysis: (r.analysis as never) ?? null,
    },
  }));

  try {
    if (isR2Configured()) {
      const csv = toCsv(payloads, userType);
      const json = toJson(payloads, userType);
      const key = `exports/${transaction.sessionId ?? 'session'}-${generateId()}-brain.csv`;
      await uploadFile(key, Buffer.from(csv, 'utf-8'), 'text/csv; charset=utf-8');
      const downloadUrl = await createDownloadUrl(key, 3600);

      // Idempotent unlock: only flip the record when it is not already paid
      // and unlocked, so repeated verification cannot duplicate entitlement.
      const alreadyUnlocked = transaction.paymentStatus === 'paid' && transaction.exportStatus === 'unlocked';
      if (!alreadyUnlocked) {
        await db
          .update(schema.exportTransactions)
          .set({
            exportStatus: 'unlocked',
            paymentStatus: 'paid',
            exportObjectKey: key,
            exportDownloadUrl: downloadUrl,
            updatedAt: new Date(),
          })
          .where(eq(schema.exportTransactions.id, transaction.id));
      }

      return NextResponse.json({ status: 'paid', downloadUrl, format: 'csv', filename: key.split('/').pop() });
    }

    // No R2 configured: return the generated file inline (dev fallback) so the
    // flow is still testable, but clearly mark it as a non-persisted download.
    const csv = toCsv(payloads, userType);
    return NextResponse.json({ status: 'paid', inline: true, format: 'csv', data: csv });
  } catch (error) {
    console.error('Export generation failed:', error);
    return NextResponse.json({ error: 'Export generation failed. Please retry.' }, { status: 500 });
  }
}

/**
 * Recover the Bachs checkout id from the stored checkout URL when the client
 * only knows the BRAIN reference. Bachs hosted URLs end in the checkout token.
 */
function extractCheckoutId(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments.length ? segments[segments.length - 1] : null;
  } catch {
    return null;
  }
}
