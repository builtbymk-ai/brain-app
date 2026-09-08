export {};

/**
 * QA — discover which currency the Paystack merchant account supports.
 * Creates unpaid test-mode transactions only.
 */
const key = process.env.PAYSTACK_SECRET_KEY;
if (!key) {
  console.log('PAYSTACK_SECRET_KEY: MISSING');
  process.exit(1);
}

for (const cur of ['NGN', 'GHS', 'ZAR', 'USD']) {
  try {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'qa-test@brain.local',
        amount: 150,
        currency: cur,
        reference: `brain_qa_cur_${cur}_${Date.now()}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const b = await res.json().catch(() => ({}));
    console.log(`${cur}: HTTP ${res.status} | ${b?.status ? 'ACCEPTED' : b?.message}`);
  } catch (e) {
    console.log(`${cur}: ERROR ${(e as Error).message}`);
  }
}
