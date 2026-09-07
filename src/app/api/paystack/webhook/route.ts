import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { eq } from 'drizzle-orm';
import { env } from '@/lib/env';
import { createHmac } from 'node:crypto';

export const runtime = 'nodejs';

const WEBHOOK_SECRET = env.paystackWebhookSecret;

/**
 * Paystack webhook. We rely on server-side verification in /api/export/verify
 * as the source of truth; this webhook updates transaction records asynchronously
 * and is a safety net for status sync.
 *
 * Signature verification uses Paystack's documented mechanism:
 *   payload = raw request body (before JSON.parse)
 *   signature = HMAC-SHA512(payload, secret)
 *   compare sig header `x-paystack-signature` to the computed value.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-paystack-signature');

    if (WEBHOOK_SECRET && signature) {
      const computed = createHmac('sha512', WEBHOOK_SECRET).update(rawBody).digest('hex');
      if (computed !== signature) {
        console.warn('Paystack webhook: signature mismatch');
        return NextResponse.json({ received: false, error: 'Signature mismatch' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody) as {
      event?: string;
      data?: { reference?: string; status?: string };
    };
    const reference = payload?.data?.reference;
    if (!reference) {
      return NextResponse.json({ received: true });
    }

    const status = mapStatus(payload?.data?.status, payload?.event);
    if (status) {
      await db
        .update(schema.exportTransactions)
        .set({ paymentStatus: status, updatedAt: new Date() })
        .where(eq(schema.exportTransactions.transactionRef, reference));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.warn('Paystack webhook error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}

function mapStatus(paystackStatus: string | undefined, event: string | undefined): string | null {
  if (event === 'charge.success' || paystackStatus === 'success') return 'paid';
  if (event === 'charge.failed') return 'failed';
  return null;
}
