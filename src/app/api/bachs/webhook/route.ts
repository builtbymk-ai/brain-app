import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { env } from '@/lib/env';
import {
  verifyBachsWebhookSignature,
  mapBachsEventStatus,
  extractBrainReference,
  extractBachsCheckoutId,
  type BachsEvent,
} from '@/lib/bachs';

export const runtime = 'nodejs';

/**
 * Bachs webhook — the authoritative source of truth for export fulfilment.
 *
 *  1. POST only.
 *  2. Reads the RAW request body before any JSON parsing (signature requirement).
 *  3. Verifies HMAC-SHA256("{timestamp}.{raw_body}", BACHS_WEBHOOK_SECRET) against
 *     `X-Bachs-Signature`, rejecting stale timestamps beyond BACHS_WEBHOOK_TOLERANCE.
 *  4. Parses the event only after successful verification.
 *  5. Maps `collection.succeeded` (and `checkout.completed`) to paid, and
 *     `collection.failed` / `collection.underpaid` / `checkout.failed` /
 *     `checkout.expired` to failed. Subscription/invoice events are ignored —
 *     BRAIN has no subscription product.
 *  6. Maps the event back to the BRAIN transaction via `metadata.brain_reference`
 *     (falling back to the session-created reference) and marks it idempotently:
 *     retries never double-grant, downgrade, or duplicate entitlements.
 *
 * The browser success redirect NEVER grants entitlement — arriving on
 * /research/return?status=success only prompts the client to verify server-side,
 * which queries Bachs' own checkout-session endpoint.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('X-Bachs-Signature');
  const timestamp = request.headers.get('X-Bachs-Timestamp');

  // A signing secret must be configured; without one no webhook can be trusted.
  if (!env.bachsWebhookSecret) {
    console.warn('Bachs webhook: BACHS_WEBHOOK_SECRET not configured — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  const verification = verifyBachsWebhookSignature(rawBody, timestamp, signature);
  if (!verification.valid) {
    console.warn(`Bachs webhook: rejected (${verification.reason})`);
    const status = verification.reason === 'stale' ? 400 : 401;
    return NextResponse.json({ received: false, error: verification.reason }, { status });
  }

  let event: BachsEvent;
  try {
    event = JSON.parse(rawBody) as BachsEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!event?.id || !event?.type) {
    return NextResponse.json({ received: true });
  }

  // Map the event to a normalized payment state; ignore non-payment events
  // (e.g. subscription/invoice/customer events) with a 2xx so Bachs stops retrying.
  const status = mapBachsEventStatus(event);
  if (!status) {
    return NextResponse.json({ received: true });
  }

  // Locate the BRAIN transaction. The real Bachs payload nests reference and
  // metadata under `data` (observed live on checkout.completed):
  //   data.metadata.brain_reference → data.reference → data.charge.metadata
  // If the reference still cannot be resolved, fall back to matching the
  // Bachs checkout id stored on the transaction record at create time.
  const brainReference = extractBrainReference(event);

  let transaction = brainReference
    ? await db.query.exportTransactions.findFirst({
        where: eq(schema.exportTransactions.transactionRef, brainReference),
      })
    : null;

  if (!transaction) {
    const checkoutId = extractBachsCheckoutId(event);
    if (checkoutId) {
      transaction = await db.query.exportTransactions.findFirst({
        where: eq(schema.exportTransactions.checkoutId, checkoutId),
      });
    }
  }

  if (!transaction) {
    // Unknown transaction — acknowledge so Bachs does not retry a dead letter.
    console.warn(`Bachs webhook: no BRAIN transaction for event ${event.id}`);
    return NextResponse.json({ received: true });
  }

  // Idempotent update: never downgrade a paid record, never re-unlock.
  const alreadyPaid = transaction.paymentStatus === 'paid';
  const nextPaymentStatus = alreadyPaid ? 'paid' : status === 'paid' ? 'paid' : status;
  const alreadyUnlocked = transaction.exportStatus === 'unlocked';
  const nextExportStatus = alreadyUnlocked ? 'unlocked' : status === 'paid' ? 'unlocked' : transaction.exportStatus;

  if (nextPaymentStatus !== transaction.paymentStatus || nextExportStatus !== transaction.exportStatus) {
    await db
      .update(schema.exportTransactions)
      .set({
        paymentStatus: nextPaymentStatus,
        exportStatus: nextExportStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.exportTransactions.id, transaction.id));
  }

  // Always 2xx after successful processing so Bachs marks the delivery complete.
  return NextResponse.json({ received: true });
}
