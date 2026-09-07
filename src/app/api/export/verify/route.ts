import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { verifyTransaction } from '@/lib/paystack';
import { toCsv, toJson, ExportRowPayload } from '@/lib/export/serialize';
import { uploadFile, createDownloadUrl, isR2Configured } from '@/lib/r2';
import { generateId } from '@/lib/id';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Verify the payment server-side against Paystack before unlocking the export.
 * Only after the backend confirms `paid` do we generate and serve the file.
 */
export async function POST(request: Request) {
  let body: { reference?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { reference } = body;
  if (!reference) {
    return NextResponse.json({ error: 'Missing payment reference' }, { status: 400 });
  }

  const verification = await verifyTransaction(reference);
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

  // Load the transaction and its session.
  const transaction = await db.query.exportTransactions.findFirst({
    where: eq(schema.exportTransactions.transactionRef, reference),
  });
  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
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
