export {};

/**
 * QA — Paystack key sanity (prints presence/format only, never the key value).
 */
const key = process.env.PAYSTACK_SECRET_KEY;

if (!key) {
  console.log('PAYSTACK_SECRET_KEY: MISSING from env');
  process.exit(1);
}

console.log('PAYSTACK_SECRET_KEY: PRESENT');
console.log('length:', key.length);
console.log('starts with:', key.startsWith('sk_test_') ? 'sk_test_ (test mode)' : key.startsWith('sk_live_') ? 'sk_live_ (LIVE mode!)' : `UNEXPECTED prefix: ${key.slice(0, 6)}…`);
console.log('has whitespace:', /\s/.test(key));
console.log('has quotes:', /^["']|["']$/.test(key));

const pub = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
if (pub) {
  console.log('NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY prefix:', pub.startsWith('pk_test_') ? 'pk_test_' : pub.startsWith('pk_live_') ? 'pk_live_' : 'UNEXPECTED');
}

// Live API check: initialize a test transaction.
try {
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'qa-test@brain.local',
      amount: 150,
      currency: process.env.NEXT_PUBLIC_EXPORT_CURRENCY ?? 'USD',
      reference: `brain_qa_${Date.now()}`,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  console.log('Paystack initialize: HTTP', res.status, '| status:', body?.status, '| message:', body?.message);
} catch (e) {
  console.log('Paystack API error:', e instanceof Error ? e.message : e);
}
