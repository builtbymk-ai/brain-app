export {};

/**
 * QA — Paystack NGN flow: initialize a checkout with a valid email, then
 * verify the UNPAID reference (failure-path test). Test mode, no charge.
 */
const key = process.env.PAYSTACK_SECRET_KEY;
if (!key) {
  console.log('PAYSTACK_SECRET_KEY: MISSING');
  process.exit(1);
}

const reference = `brain_qa_ngn_${Date.now()}`;

const init = await fetch('https://api.paystack.co/transaction/initialize', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'booking.donmk@gmail.com',
    amount: 150,
    currency: 'NGN',
    reference,
  }),
  signal: AbortSignal.timeout(20_000),
});
const initBody = await init.json().catch(() => ({}));
console.log('initialize: HTTP', init.status, '| status:', initBody?.status, '| message:', initBody?.message ?? '');
if (initBody?.status) {
  console.log('  reference:', initBody.data.reference);
  console.log('  authorization_url present:', Boolean(initBody.data.authorization_url));
  console.log('  access_code present:', Boolean(initBody.data.access_code));

  // Failure-path: verify the unpaid reference — Paystack must report pending/abandoned.
  const ver = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  const verBody = await ver.json().catch(() => ({}));
  console.log('verify (unpaid): HTTP', ver.status, '| gateway_status:', verBody?.data?.gateway_response ?? verBody?.message);
  console.log('  transaction status:', verBody?.data?.status, '(export must stay locked unless "success")');
}
