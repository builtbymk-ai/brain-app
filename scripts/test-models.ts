export {};

// Test which Gemini models are available for the current GOOGLE_API_KEY.
// Usage: GOOGLE_API_KEY=... bun scripts/test-models.ts
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.log('NO KEY found in process.env.GOOGLE_API_KEY');
  process.exit(1);
}

async function runTest() {
  const key: string = apiKey as string;
  for (const model of ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.6-flash']) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word: ok' }] }] }),
          signal: AbortSignal.timeout(30_000),
        }
      );
      const body = await res.json().catch(() => ({}));
      const text =
        body?.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(body).slice(0, 120);
      console.log(`${model}: HTTP ${res.status} — ${typeof text === 'string' ? text.trim() : text}`);
    } catch (e) {
      console.log(`${model}: ERROR ${(e as Error).message}`);
    }
  }
}

runTest();
