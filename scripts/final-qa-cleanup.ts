/** Final QA cleanup: delete sessions whose token starts with 'qa-' (QA-labelled only). */
export {};

import { db, schema } from '../src/db/client';
import { like } from 'drizzle-orm';

const sessions = await db.query.researchSessions.findMany({
  where: like(schema.researchSessions.sessionToken, 'qa-%'),
});

for (const s of sessions) {
  await db.delete(schema.researchSessions).where(like(schema.researchSessions.sessionToken, s.sessionToken));
  console.log(`Deleted QA session token=${s.sessionToken.slice(0, 12)}… and its businesses (cascade).`);
}

console.log(`Cleanup complete: ${sessions.length} QA session(s) removed.`);
process.exit(0);
