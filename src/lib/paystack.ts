import { env } from './env';

const PAYSTACK_API = 'https://api.paystack.co';

/**
 * Paystack amounts are in the currency's smallest unit.
 * For USD, $1.50 => 150 cents. For NGN, we'd use kobo.
 */
export const EXPORT_AMOUNT = 150; // 1.50 USD (smallest unit = cents)
export const EXPORT_CURRENCY = process.env.NEXT_PUBLIC_EXPORT_CURRENCY ?? 'USD';

export interface InitializeResult {
  accessCode: string | null;
  authorizationUrl: string | null;
  reference: string;
}

/**
 * Initialize a one-time Paystack checkout for the $1.50 structured export.
 * Secret key stays server-side; only the (public-safe) result is returned.
 */
export async function initializeCheckout(email: string, metadata: Record<string, unknown>): Promise<InitializeResult | null> {
  const secret = env.paystackSecret;
  if (!secret) return null;

  try {
    const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: EXPORT_AMOUNT,
        currency: EXPORT_CURRENCY,
        reference: `brain_export_${Date.now()}`,
        metadata,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.status) return null;

    // Store the access_code so we can load the Paystack inline/popup if needed.
    return {
      accessCode: data?.data?.access_code ?? null,
      authorizationUrl: data?.data?.authorization_url ?? null,
      reference: data?.data?.reference ?? `brain_export_${Date.now()}`,
    };
  } catch (error) {
    console.warn('Paystack initialize failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

export interface VerifyResult {
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  reference: string;
}

/** Verify a Paystack transaction server-side before unlocking the export. */
export async function verifyTransaction(reference: string): Promise<VerifyResult | null> {
  const secret = env.paystackSecret;
  if (!secret) return null;

  try {
    const response = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.status) return null;

    const d = data?.data ?? {};
    // Map Paystack status to our normalized states.
    const status: VerifyResult['status'] =
      d?.status === 'success' ? 'paid' : d?.status === 'failed' ? 'failed' : d?.status === 'abandoned' ? 'failed' : 'pending';

    return {
      status,
      amount: Number(d?.amount ?? 0),
      currency: String(d?.currency ?? ''),
      reference: String(d?.reference ?? reference),
    };
  } catch (error) {
    console.warn('Paystack verify failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
