import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { createCheckoutSession, EXPORT_AMOUNT, EXPORT_CURRENCY } from '@/lib/bachs';
import { generateId } from '@/lib/id';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Create a one-time $1.50 Bachs hosted checkout for a session's structured export.
 * The amount is fixed server-side (never trusted from the browser). The BRAIN
 * transaction id is used as the Bachs `reference` and embedded in metadata, so
 * the webhook and server-side verification both map back to this exact record.
 * Nothing is unlocked here — entitlement is granted only via the verified
 * Bachs webhook / server-side checkout-session retrieval.
 */
export async function POST(request: Request) {
  let body: { sessionId?: string; token?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, token, email } = body;
  if (!sessionId && !token) {
    return NextResponse.json({ error: 'Missing session reference' }, { status: 400 });
  }

  // Resolve the session server-side from the token (never trust the client id directly).
  let resolvedSession;
  if (token) {
    resolvedSession = await db.query.researchSessions.findFirst({
      where: eq(schema.researchSessions.sessionToken, token),
    });
  } else if (sessionId) {
    resolvedSession = await db.query.researchSessions.findFirst({
      where: eq(schema.researchSessions.id, sessionId),
    });
  }

  if (!resolvedSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // The BRAIN transaction id doubles as the Bachs reference (unique, max 128 chars).
  const transactionId = generateId();
  const reference = `brain_${transactionId}`;

  // Server determines the base URL for post-payment redirects.
  const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const checkout = await createCheckoutSession({
    email: email || 'buyer@brain.local',
    reference,
    sessionId: resolvedSession.id,
    successUrl: `${base}/research/return?status=success&ref=${reference}`,
    cancelUrl: `${base}/research/return?status=cancelled&ref=${reference}`,
  });

  if (!checkout) {
    return NextResponse.json(
      { error: 'Payment provider is not configured. Please configure Bachs keys.' },
      { status: 503 }
    );
  }

  // Persist a transaction record so the webhook/verification can find it.
  // authorizationUrl stores the Bachs hosted checkout URL; checkoutId stores
  // the authoritative chk_… id used for webhook matching and server-side
  // verification (the URL itself ends in a page token, not the id).
  await db.insert(schema.exportTransactions).values({
    id: transactionId,
    sessionId: resolvedSession.id,
    transactionRef: reference,
    authorizationUrl: checkout.checkoutUrl,
    checkoutId: checkout.checkoutId,
    amount: 150,
    currency: 'USD',
    paymentStatus: 'pending',
    exportStatus: 'locked',
  });

  return NextResponse.json({
    reference,
    checkoutUrl: checkout.checkoutUrl,
    checkoutId: checkout.checkoutId,
    amount: EXPORT_AMOUNT,
    currency: EXPORT_CURRENCY,
  });
}
