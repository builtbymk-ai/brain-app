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
 * Normalize a Bachs payment state to BRAIN's three-state model.
 *
 * Bachs has used both "succeeded" (older charges/events) and "paid" (current
 * checkout sessions — observed live: `payment_status: "paid"` with
 * `status: "completed"`) for a collected one-time payment, so both map to
 * `paid`. A session `status` of `completed` with no payment_status field also
 * means collected. Anything unrecognized stays `pending` (never guessed).
 */
export function mapPaymentStatus(
  paymentStatus?: string | null,
  sessionStatus?: string | null
): VerifyResult['status'] {
  const p = (paymentStatus ?? '').toLowerCase();
  if (p === 'succeeded' || p === 'paid' || p === 'completed') return 'paid';
  if (p === 'failed' || p === 'canceled' || p === 'cancelled' || p === 'expired') return 'failed';
  if (!p && (sessionStatus ?? '').toLowerCase() === 'completed') return 'paid';
  return 'pending';
}

/**
 * Server-side payment state from Bachs: GET /v1/checkout-sessions/{id}.
 * The `charge` field populates once the customer submits a payment;
 * `payment_status === 'succeeded' | 'paid'` is the authoritative paid state.
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

    const status = mapPaymentStatus(d?.payment_status, d?.status);

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
  /**
   * Event payload. In the real Bachs delivery everything lives here —
   * payment_status, reference, metadata and the charge are all nested under
   * `data` (observed live on checkout.completed).
   */
  data?: {
    charge_id?: string;
    checkout_id?: string;
    status?: string;
    amount?: string;
    currency?: string;
    payment_status?: string | null;
    /** Our own order id, echoed back on the checkout object. */
    reference?: string;
    /** Checkout/session metadata — copied from the create request. */
    metadata?: Record<string, unknown>;
    /** Populated once the customer submits a payment. */
    charge?: {
      id?: string;
      status?: string;
      amount?: string;
      currency?: string;
      settlement_amount?: string;
      settlement_currency?: string;
      metadata?: Record<string, unknown>;
    } | null;
  };
  /** Legacy/alternate location — tolerated but never relied upon. */
  metadata?: Record<string, unknown>;
}

/**
 * Resolve the BRAIN transaction reference from a verified Bachs event.
 *
 * Precedence: checkout metadata.brain_reference (written by /api/export/create),
 * charge metadata fallback, the checkout's own `reference` field, then the
 * top-level legacy metadata location. Session-id values are normalized into
 * `brain_` references (the create route's `brain_<sessionId>` fallback shape).
 */
export function extractBrainReference(event: BachsEvent): string | null {
  const dataMeta = event.data?.metadata ?? {};
  const chargeMeta = event.data?.charge?.metadata ?? {};
  const legacyMeta = event.metadata ?? {};

  const candidates: Array<[unknown, boolean]> = [
    [dataMeta.brain_reference, true],
    [dataMeta.session_id, false],
    [chargeMeta.brain_reference, true],
    [chargeMeta.session_id, false],
    [event.data?.reference, true],
    [legacyMeta.brain_reference, true],
    [legacyMeta.session_id, false],
  ];

  for (const [value, isRef] of candidates) {
    if (typeof value === 'string' && value) {
      return isRef ? value : `brain_${value}`;
    }
  }
  return null;
}

/**
 * Resolve the Bachs checkout id from a verified event.
 * The live payload carries it on `data.checkout_id` (and mirrors it inside the
 * charge); both are checked.
 */
export function extractBachsCheckoutId(event: BachsEvent): string | null {
  const candidates = [event.data?.checkout_id, event.data?.charge?.id];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('chk_')) return c;
  }
  // charge.id is a charge id (ch_…), not a checkout id — only accept chk_ values.
  if (typeof event.data?.checkout_id === 'string' && event.data.checkout_id) {
    return event.data.checkout_id;
  }
  return null;
}

/**
 * Extract the checkout id from a Bachs success redirect URL.
 *
 * Per the docs, Bachs appends `?checkout_id=` to the configured success_url
 * after payment. This is the ONLY sanctioned way to recover the id from a URL —
 * the hosted checkout_url's final path segment is a page token, NOT the id,
 * and must never be used as one.
 */
export function extractCheckoutIdFromSuccessUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const value = new URL(url).searchParams.get('checkout_id');
    return value && value.startsWith('chk_') ? value : null;
  } catch {
    return null;
  }
}

/**
 * Decide whether the amount reported by Bachs may be compared against the
 * authorized price.
 *
 * Bachs prices the checkout in the pricing currency (e.g. USD 1.50) and may
 * bill the customer in their local currency (e.g. NGN 2,217.34), settling at
 * USD 1.50. The session object's `amount`/`currency` are the PRICED values;
 * only a same-currency amount can be compared to the authorization. An
 * unknown amount (webhook-only confirmation, billing-currency representation)
 * must not fail the check.
 */
export function resolveVerifyAmount(
  sessionAmount: string | null | undefined,
  sessionCurrency: string | null | undefined,
  expectedCents: number,
  expectedCurrency: string | null | undefined
): { check: boolean; matches: boolean | null; reason: 'ok' | 'unknown-amount' | 'billed-currency' } {
  const cents = Math.round(Number(sessionAmount) * 100);
  const known = Number.isFinite(cents) && cents > 0;
  if (!known) return { check: false, matches: null, reason: 'unknown-amount' };

  const cur = (sessionCurrency ?? '').toUpperCase();
  const expected = (expectedCurrency ?? '').toUpperCase();
  if (cur && expected && cur !== expected) {
    return { check: false, matches: null, reason: 'billed-currency' };
  }

  return { check: true, matches: cents === expectedCents, reason: 'ok' };
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
