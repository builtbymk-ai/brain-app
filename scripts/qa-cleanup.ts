/**
 * QA cleanup — remove the clearly-labelled QA test session from the DB.
 * Deletes only the session whose brandName is the QA marker (cascades to its
 * businesses rows). Leaves all real data untouched.
 */
export {};

import { db, schema } from '../src/db/client';
import { eq } from 'drizzle-orm';

const MARKER = 'QA-TEST-CHOMPS-DELETE-ME';

const sessions = await db.query.researchSessions.findMany();
const qaSessions = [];

for (const s of sessions) {
  const businesses = await db.query.businesses.findMany({
    where: eq(schema.businesses.sessionId, s.id),
  });
  if (businesses.some((b) => b.brandName === MARKER)) {
    qaSessions.push(s);
  }
}

if (qaSessions.length === 0) {
  console.log('No QA test sessions found — database already clean.');
  process.exit(0);
}

for (const s of qaSessions) {
  await db.delete(schema.researchSessions).where(eq(schema.researchSessions.id, s.id));
  console.log(`Deleted QA session ${s.id} (token ${s.sessionToken.slice(0, 8)}…) and its businesses (cascade).`);
}

console.log(`Cleanup complete: ${qaSessions.length} QA session(s) removed.`);
process.exit(0);
