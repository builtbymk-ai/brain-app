import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { initializeCheckout } from '@/lib/paystack';
import { generateId } from '@/lib/id';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Create a one-time $1.50 checkout for a session's structured export.
 * Returns the Paystack authorization/reference so the client can open the
 * checkout. Nothing is unlocked here — payment is verified server-side.
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

  const checkout = await initializeCheckout(email || 'buyer@brain.local', {
    sessionId: resolvedSession.id,
    product: 'BRAIN Clean Structured Export',
  });

  if (!checkout) {
    return NextResponse.json(
      { error: 'Payment provider is not configured. Please configure Paystack keys.' },
      { status: 503 }
    );
  }

  // Persist a transaction record so we can verify on webhook/verification.
  await db.insert(schema.exportTransactions).values({
    id: generateId(),
    sessionId: resolvedSession.id,
    transactionRef: checkout.reference,
    authorizationUrl: checkout.authorizationUrl,
    amount: 150,
    currency: 'USD',
    paymentStatus: 'pending',
    exportStatus: 'locked',
  });

  return NextResponse.json({
    reference: checkout.reference,
    authorizationUrl: checkout.authorizationUrl,
    accessCode: checkout.accessCode,
    amount: 150,
    currency: 'USD',
  });
}
