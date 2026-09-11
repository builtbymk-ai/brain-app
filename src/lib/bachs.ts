import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

/**
 * Bachs payment provider — hosted checkout for the one-time $1.50 structured export.
 *
 * Bachs conventions (per docs.bachs.io):
 *  - Money is a DECIMAL STRING at the currency's precision ("1.50"), never minor units.
 *  - Base URLs: sandbox https://sandbox-api.bachs.io, production https://api.bachs.io
 *  - Auth: `Authorization: Bearer sk_...` (secret key, server-side only)
 *  - Webhooks are the source of truth for fulfilment (`collection.succeeded`).
 *  - Webhook signature: HMAC-SHA256 hex digest of "{X-Bachs-Timestamp}.{raw_body}"
 *    delivered in `X-Bachs-Signature`, with a replay tolerance window.
 */

const BASE_URL = env.bachsBaseUrl;

/** $1.50 structured export — decimal string at currency precision (Bachs format). */
export const EXPORT_AMOUNT = '1.50';
export const EXPORT_CURRENCY = process.env.NEXT_PUBLIC_EXPORT_CURRENCY ?? 'USD';

/**
 * The export price BRAIN authorizes. The browser never supplies an amount:
 * the server fixes the price when creating the Bachs session, so a tampered
 * client payload cannot change what the customer is charged.
 */
export const AUTHORIZED_EXPORT_PRICE = EXPORT_AMOUNT;

/** Human-readable label used in checkout metadata. */
export const EXPORT_PRODUCT_NAME = 'BRAIN Clean Structured Export';

function requireApiKey(): string {
  const key = env.bachsApiKey;
  if (!key) {
    throw new Error('BACHS_API_KEY is not configured');
  }
  return key;
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Checkout session
// ---------------------------------------------------------------------------

export interface CreateCheckoutInput {
  /** Customer email for the hosted checkout receipt. */
  email: string;
  /** BRAIN transaction reference — our own order ID for this export. */
  reference: string;
  /** BRAIN session id, embedded in metadata so the webhook can map back. */
  sessionId: string;
  /** Where Bachs sends the customer after a successful payment. */
  successUrl: string;
  /** Where Bachs sends the customer if they cancel/abandon. */
  cancelUrl: string;
}

export interface CheckoutSession {
  checkoutId: string;
  checkoutUrl: string;
  reference: string;
}

/**
 * Create a Bachs hosted checkout session for the $1.50 export.
 * Uses ad-hoc `pricing` (raw amount) so no catalog product is required;
 * the amount is fixed server-side and never comes from the browser.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput
): Promise<CheckoutSession | null> {
  let apiKey: string;
  try {
    apiKey = requireApiKey();
  } catch {
    return null;
  }

  try {
    const response = await fetch(`${BASE_URL}/v1/checkout-sessions`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        pricing: { currency: EXPORT_CURRENCY, amount: AUTHORIZED_EXPORT_PRICE },
        reference: input.reference,
        customer: { email: input.email },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          source: 'brain',
          product: EXPORT_PRODUCT_NAME,
          session_id: input.sessionId,
          brain_reference: input.reference,
        },
        expires_in_minutes: 60,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.warn('Bachs checkout session failed:', response.status);
      return null;
    }

    const data = (await response.json()) as {
      checkout_id?: string;
      checkout_url?: string;
      reference?: string;
    };

    if (!data?.checkout_id || !data?.checkout_url) {
      console.warn('Bachs checkout session: missing checkout_id/checkout_url');
      return null;
    }

    return {
      checkoutId: data.checkout_id,
      checkoutUrl: data.checkout_url,
      reference: input.reference,
    };
  } catch (error) {
    console.warn('Bachs checkout session error:', error instanceof Error ? error.message : error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Server-side payment verification
// ---------------------------------------------------------------------------

export interface VerifyResult {
  status: 'pending' | 'paid' | 'failed';
  amount: string;
  currency: string;
  checkoutId: string;
}

/**
 * Server-side payment state from Bachs: GET /v1/checkout-sessions/{id}.
 * The `charge` field populates once the customer submits a payment;
 * `payment_status === 'succeeded'` is the authoritative paid state.
 */
export async function verifyCheckoutSession(checkoutId: string): Promise<VerifyResult | null> {
  let apiKey: string;
  try {
    apiKey = requireApiKey();
  } catch {
    return null;
  }

  try {
    const response = await fetch(
      `${BASE_URL}/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20_000) }
    );
    if (!response.ok) {
      console.warn('Bachs verify failed:', response.status);
      return null;
    }

    const d = (await response.json()) as {
      payment_status?: string | null;
      status?: string;
      amount?: string;
      currency?: string;
      checkout_id?: string;
    };

    // Map Bachs payment_status to BRAIN's normalized states.
    const status: VerifyResult['status'] =
      d?.payment_status === 'succeeded' ? 'paid' : d?.payment_status === 'failed' || d?.payment_status === 'canceled' ? 'failed' : 'pending';

    return {
      status,
      amount: String(d?.amount ?? ''),
      currency: String(d?.currency ?? ''),
      checkoutId: String(d?.checkout_id ?? checkoutId),
    };
  } catch (error) {
    console.warn('Bachs verify error:', error instanceof Error ? error.message : error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a Bachs webhook delivery.
 *
 * Signature = HMAC-SHA256("{X-Bachs-Timestamp}.{rawBody}", BACHS_WEBHOOK_SECRET),
 * hex-encoded, compared in constant time. Deliveries outside the tolerance
 * window are rejected as stale.
 */
export function verifyBachsWebhookSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  toleranceSeconds = env.bachsWebhookTolerance
): { valid: boolean; reason?: 'missing_headers' | 'stale' | 'bad_signature' } {
  if (!timestampHeader || !signatureHeader) {
    return { valid: false, reason: 'missing_headers' };
  }

  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: 'bad_signature' };
  }

  // Reject stale deliveries (replay protection).
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { valid: false, reason: 'stale' };
  }

  const message = `${timestamp}.${rawBody}`;
  const secret = env.bachsWebhookSecret ?? '';
  const expected = createHmac('sha256', secret).update(message, 'utf8').digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signatureHeader, 'hex');
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    return { valid: false, reason: 'bad_signature' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------

export type BachsEventType =
  | 'collection.succeeded'
  | 'collection.failed'
  | 'collection.underpaid'
  | 'checkout.completed'
  | 'checkout.expired'
  | 'checkout.failed'
  | string;

export interface BachsEvent {
  id: string;
  type: BachsEventType;
  createdAt?: string;
  data?: {
    charge_id?: string;
    checkout_id?: string;
    status?: string;
    amount?: string;
    currency?: string;
  };
}

/** Map a Bachs webhook event to BRAIN's normalized payment state, or null to ignore. */
export function mapBachsEventStatus(event: BachsEvent): 'paid' | 'failed' | null {
  switch (event.type) {
    case 'collection.succeeded':
    case 'checkout.completed':
      return 'paid';
    case 'collection.failed':
    case 'collection.underpaid':
    case 'checkout.failed':
    case 'checkout.expired':
      return 'failed';
    default:
      return null;
  }
}
