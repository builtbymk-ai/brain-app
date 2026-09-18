/**
 * Read-only inspection of the real Bachs checkout session behind the live
 * sandbox payment (requirement: verify the exact GET response shape before
 * trusting amount logic).
 *
 * Prints ONLY response fields — the API key is never read into output.
 * Run: bun scripts/inspect-checkout.ts [checkout_id]
 */

export {};

const KEY = process.env.BACHS_API_KEY;
const BASE = process.env.BACHS_BASE_URL ?? 'https://sandbox-api.bachs.io';
const CHECKOUT_ID = process.argv[2] ?? 'chk_rvX0OposDRwfnZpb';

if (!KEY) {
  console.error('BACHS_API_KEY not configured in this environment.');
  process.exit(1);
}

interface SessionResponse {
  checkout_id?: string;
  status?: string;
  payment_status?: string | null;
  amount?: string;
  currency?: string;
  reference?: string;
  charge?: {
    id?: string;
    status?: string;
    amount?: string;
    currency?: string;
    settlement_amount?: string;
    settlement_currency?: string;
  } | null;
}

try {
  const res = await fetch(`${BASE}/v1/checkout-sessions/${encodeURIComponent(CHECKOUT_ID)}`, {
    headers: { Authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(20_000),
  });

  console.log(`GET ${BASE}/v1/checkout-sessions/${CHECKOUT_ID}`);
  console.log(`HTTP ${res.status}`);

  const text = await res.text();
  let d: SessionResponse;
  try {
    d = JSON.parse(text) as SessionResponse;
  } catch {
    console.log('Non-JSON response body (first 500 chars):');
    console.log(text.slice(0, 500));
    process.exit(1);
  }

  if (!res.ok) {
    console.log('Error payload:', text.slice(0, 500));
    process.exit(1);
  }

  console.log('--- normalized session fields ---');
  console.log('checkout_id   :', d.checkout_id);
  console.log('status        :', d.status);
  console.log('payment_status:', d.payment_status);
  console.log('amount        :', d.amount);
  console.log('currency      :', d.currency);
  console.log('reference     :', d.reference);
  if (d.charge) {
    console.log('--- charge ---');
    console.log('charge.id                 :', d.charge.id);
    console.log('charge.status             :', d.charge.status);
    console.log('charge.amount (billed)    :', d.charge.amount, d.charge.currency);
    console.log('charge.settlement_amount  :', d.charge.settlement_amount, d.charge.settlement_currency);
  } else {
    console.log('charge: (absent on session object)');
  }

  console.log('--- amount check against authorized 150 cents ---');
  const cents = Math.round(Number(d.amount) * 100);
  console.log(
    `session amount ${d.amount} ${d.currency} → ${Number.isFinite(cents) && cents > 0 ? cents : 'unknown'} cents ` +
      `(${cents === 150 ? 'MATCHES' : 'does not match'} authorized 150)`
  );
} catch (error) {
  console.error('Request failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
