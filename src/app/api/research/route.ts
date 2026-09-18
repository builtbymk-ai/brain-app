import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { researchBusiness } from '@/lib/research/engine';
import { generateId, generateToken } from '@/lib/id';
import { applyPaywall, isSessionPaid } from '@/lib/paywall';
import { validateFirstPartyInput, ValidatedFirstPartyInput } from '@/lib/research/first-party';
import {
  validateRecoveryEvidence,
  hasRecoveryEvidence,
  RecoveryValidationResult,
} from '@/lib/research/recovery-evidence';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** GET: fetch a session's research results by session token. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionToken = searchParams.get('token');
  if (!sessionToken) {
    return NextResponse.json({ error: 'Missing session token' }, { status: 400 });
  }

  try {
    const session = await db.query.researchSessions.findFirst({
      where: eq(schema.researchSessions.sessionToken, sessionToken),
    });
    if (!session) {
      return NextResponse.json({ research: [] });
    }

    const results = await db.query.businesses.findMany({
      where: eq(schema.businesses.sessionId, session.id),
      orderBy: (b, { asc }) => [asc(b.createdAt)],
    });

    // Server-side paywall: unpaid sessions get premium fields on the first
    // FREE_PREMIUM_ROWS rows only; later rows have them stripped before the
    // response leaves the server.
    const paid = await isSessionPaid(session.id);
    const gated = applyPaywall(results, paid);

    return NextResponse.json({ sessionId: session.id, research: gated });
  } catch (error) {
    console.error('GET /api/research failed:', error);
    return NextResponse.json({ research: [] });
  }
}

/** POST: run research for up to 10 business inputs. */
export async function POST(request: Request) {
  interface BusinessInput {
    url: string;
    brandName?: string;
    proposedSolution?: string;
    /** V2B.1 owner-mode first-party economics (raw, validated below). */
    aov?: unknown;
    conversionRate?: unknown;
    monthlyBuyers?: unknown;
    repeatPurchaseRate?: unknown;
    /**
     * V2D.3 — raw documented controlled recovery experiment (L3 evidence).
     * Validated as a whole by validateRecoveryEvidence(); never partially
     * accepted. Owner mode only.
     */
    recovery?: Record<string, unknown>;
  }

  let body: { inputs?: (BusinessInput & { userType?: unknown })[] | string[] | string; token?: string; userType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Mode is explicit, never inferred from free text.
  const userType: 'owner' | 'prospect' = body.userType === 'owner' ? 'owner' : 'prospect';

  // Normalize all accepted input shapes into structured BusinessInput objects.
  const rawInputs: BusinessInput[] = (
    Array.isArray(body.inputs)
      ? body.inputs
      : typeof body.inputs === 'string'
        ? [body.inputs]
        : []
  )
    .map((item) => {
      if (typeof item === 'string') return { url: item };
      if (item && typeof item.url === 'string') {
        return {
          url: item.url,
          brandName: typeof item.brandName === 'string' ? item.brandName.slice(0, 120) : undefined,
          proposedSolution:
            typeof item.proposedSolution === 'string' ? item.proposedSolution.slice(0, 1000) : undefined,
          aov: item.aov,
          conversionRate: item.conversionRate,
          monthlyBuyers: item.monthlyBuyers,
          repeatPurchaseRate: item.repeatPurchaseRate,
          recovery: typeof item.recovery === 'object' && item.recovery !== null && !Array.isArray(item.recovery)
            ? (item.recovery as Record<string, unknown>)
            : undefined,
        };
      }
      return null;
    })
    .filter((x): x is BusinessInput => x !== null && x.url.trim().length > 0);

  if (rawInputs.length === 0) {
    return NextResponse.json({ error: 'At least one business URL is required' }, { status: 400 });
  }
  if (rawInputs.length > 10) {
    return NextResponse.json({ error: 'Up to 10 businesses per session' }, { status: 400 });
  }

  // V2B.1 — First-party economics are an Owner-mode input contract. Prospect
  // mode intentionally does not accept them (§9): the owner supplies verified
  // business data about a business they operate; a prospect researcher does
  // not. Invalid values REJECT the request (never clamp — a silently-capped
  // number would enter the evidence chain looking plausible).
  const firstPartyByIndex = new Map<number, ValidatedFirstPartyInput>();
  // V2D.3 — validated documented recovery experiments, per business index.
  const recoveryByIndex = new Map<number, RecoveryValidationResult['values']>();
  if (userType === 'owner') {
    const fieldErrors: { index: number; field: string; message: string }[] = [];
    rawInputs.forEach((input, index) => {
      const { values, errors } = validateFirstPartyInput(input as unknown as Record<string, unknown>);
      firstPartyByIndex.set(index, values);
      errors.forEach((e) => fieldErrors.push({ index, field: e.field, message: e.message }));

      // V2D.3 — recovery experiment intake (owner mode only, §18). Evidence
      // rules are all-or-nothing: any supplied-but-invalid experiment REJECTS
      // the request (reject-never-clamp) rather than partially entering the
      // evidence chain. Prospect mode ignores it entirely.
      if (input.recovery && hasRecoveryEvidence(input.recovery)) {
        const { values, errors: recoveryErrors } = validateRecoveryEvidence(input.recovery);
        if (values) {
          recoveryByIndex.set(index, values);
        }
        recoveryErrors.forEach((e) =>
          fieldErrors.push({ index, field: e.field, message: e.message })
        );
      }
    });
    if (fieldErrors.length > 0) {
      return NextResponse.json(
        {
          error: 'First-party business data could not be used.',
          details: fieldErrors.map((e) => `Business ${e.index + 1} — ${e.message}`),
        },
        { status: 400 }
      );
    }
  }

  let sessionToken = body.token ?? generateToken();
  const isNewSession = !body.token;

  const responseHeaders = { 'X-Session-Token': sessionToken };

  try {
    let session;
    if (isNewSession) {
      const sessionId = generateId();
      await db.insert(schema.researchSessions).values({
        id: sessionId,
        sessionToken,
        userType,
      });
      session = { id: sessionId, sessionToken, userType };
    } else {
      session = await db.query.researchSessions.findFirst({
        where: eq(schema.researchSessions.sessionToken, sessionToken),
      });
      if (!session) {
        const sessionId = generateId();
        await db.insert(schema.researchSessions).values({ id: sessionId, sessionToken, userType });
        session = { id: sessionId, sessionToken, userType };
      }
    }

    // Run research in parallel but bound the concurrency to stay within API limits.
    // NOTE: step by the chunk size (i += 3) — an i++ here creates a sliding
    // window that re-researches overlapping businesses (duplicates + API spend).
    const results = [];
    for (let i = 0; i < rawInputs.length; i += 3) {
      const chunk = rawInputs.slice(i, i + 3);
      const chunkResults = await Promise.all(
        chunk.map((input, idx) => {
          // Canonical fields only: the raw first-party numbers never leak past
          // validation into the engine — the validated/normalized values travel
          // as firstPartyEconomics (calculator representation).
          const {
            aov: _a,
            conversionRate: _c,
            monthlyBuyers: _b,
            repeatPurchaseRate: _r,
            recovery: _recovery,
            ...core
          } = input;
          return researchBusiness({
            ...core,
            userType,
            firstPartyEconomics: firstPartyByIndex.get(i + idx),
            // V2D.3 — canonical, validated RecoveryExperimentEvidence only.
            // Raw intake never crosses this boundary.
            ...(recoveryByIndex.has(i + idx)
              ? { recoveryExperiment: recoveryByIndex.get(i + idx) }
              : {}),
          });
        })
      );
      results.push(...chunkResults);

      // Persist each completed business as we go so a session never fully loses data.
      const valid = chunkResults.filter((r): r is NonNullable<typeof r> => r !== null);
      if (valid.length) {
        await db.insert(schema.businesses).values(
          valid.map((r, idx) => {
            // Recover the user-supplied inputs for this result (chunk is parallel).
            const chunkInput = chunk[idx];
            return {
              id: generateId(),
              sessionId: session.id,
              domain: r.domain,
              brandName: r.brandName ?? chunkInput?.brandName ?? null,
              proposedSolution: r.proposedSolution ?? chunkInput?.proposedSolution ?? null,
              displayName: r.displayName,
              status: r.status,
            monthlyTraffic: r.monthlyTraffic,
            products: r.products,
            reviews: r.reviews,
            quiz: r.quiz,
            revenueOpportunity: r.revenueOpportunity,
            revenueState: r.revenueState,
            revenueExplanation: r.revenueExplanation,
            revenueCalculation: r.revenueCalculation,
            growthAssessment: r.growthAssessment,
            rawSignals: r.rawSignals,
            analysis: r.analysis as never,
            };
          })
        );
      }
    }

    const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (validResults.length === 0) {
      return NextResponse.json(
        { error: 'No valid business domains were recognized' },
        { status: 400, headers: responseHeaders }
      );
    }

    // Server-side paywall: unpaid sessions get premium fields on the first
    // FREE_PREMIUM_ROWS rows only — the same rule as the GET restore path.
    const paid = await isSessionPaid(session.id);
    const gated = applyPaywall(validResults, paid);

    return NextResponse.json(
      { research: gated.map(stripSignals) },
      { headers: responseHeaders }
    );
  } catch (error) {
    console.error('POST /api/research failed:', error);
    return NextResponse.json(
      { error: 'Research failed. Please try again.' },
      { status: 500, headers: responseHeaders }
    );
  }
}

// Collapse raw signals for the preview workspace; full dataset ships in the export.
function stripSignals(r: NonNullable<Awaited<ReturnType<typeof researchBusiness>>>) {
  return {
    domain: r.domain,
    displayName: r.displayName,
    brandName: r.brandName,
    proposedSolution: r.proposedSolution,
    status: r.status,
    monthlyTraffic: r.monthlyTraffic,
    products: r.products,
    reviews: r.reviews,
    quiz: r.quiz,
    revenueOpportunity: r.revenueOpportunity,
    revenueState: r.revenueState,
    revenueExplanation: r.revenueExplanation,
    revenueCalculation: r.revenueCalculation,
    growthAssessment: r.growthAssessment,
    analysis: r.analysis,
  };
}
