import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';

export const metadata: Metadata = {
  title: 'Documentation — Evidence, Benchmarks & Methodology | BRAIN',
  description:
    'How BRAIN classifies evidence (OBS / EST / BMK / ASM / DRV), which benchmarks it uses, and how the deterministic Potential Revenue Lift calculation works.',
};

/**
 * BRAIN Documentation — evidence taxonomy, benchmark provenance, and the
 * boundaries of the ACR methodology. This page is the destination for the
 * "Benchmark references and source methodology → Documentation" reference.
 *
 * IP boundary: realization factors, maturity modifiers, and the complete
 * internal ACR weighting are intentionally NOT documented here.
 */
export default function DocumentationPage() {
  return (
    <>
      <LandingNav />

      <main className="rw-main">
        <div className="container docs-page">
          <div className="rw-header">
            <div className="section-label">Documentation</div>
            <h1 className="section-headline">
              Evidence, benchmarks and methodology.
            </h1>
            <p className="section-copy" style={{ margin: '0 auto' }}>
              How BRAIN classifies every number it shows you, where its
              benchmarks come from, and what the Potential Revenue Lift
              estimate does — and does not — claim.
            </p>
          </div>

          {/* Evidence taxonomy */}
          <section className="docs-section" aria-labelledby="docs-evidence">
            <h2 id="docs-evidence" className="docs-heading">
              Evidence labels
            </h2>
            <p className="docs-copy">
              Every input in a BRAIN calculation carries a provenance tag so
              you can see exactly what kind of evidence stands behind it.
            </p>
            <dl className="evidence-guide-list docs-evidence-list">
              <div className="evidence-guide-item">
                <dt>OBS — Observed</dt>
                <dd>Directly captured or declared business data. The highest-confidence layer.</dd>
              </div>
              <div className="evidence-guide-item">
                <dt>EST — Estimated</dt>
                <dd>Externally estimated data — for example, monthly traffic estimated by SimilarWeb. Useful context, but not first-party analytics.</dd>
              </div>
              <div className="evidence-guide-item">
                <dt>BMK — Benchmark</dt>
                <dd>Validated external industry or reference data from a named, dated, primary dataset.</dd>
              </div>
              <div className="evidence-guide-item">
                <dt>ASM — Assumption</dt>
                <dd>An explicit modelling assumption used where appropriate, always labelled as such.</dd>
              </div>
              <div className="evidence-guide-item">
                <dt>DRV — Derived</dt>
                <dd>A value calculated from other evidence — for example, modelled monthly buyers from traffic × baseline conversion rate.</dd>
              </div>
              <div className="evidence-guide-item">
                <dt>INSUFFICIENT DATA</dt>
                <dd>BRAIN does not have enough defensible evidence to calculate the metric. It reports the gap honestly instead of substituting a guess.</dd>
              </div>
            </dl>
          </section>

          {/* Potential Revenue Lift */}
          <section className="docs-section" aria-labelledby="docs-prl">
            <h2 id="docs-prl" className="docs-heading">
              Potential Revenue Lift
            </h2>
            <p className="docs-copy">
              <strong>
                Potential Revenue Lift is a modeled opportunity estimate, not
                guaranteed revenue.
              </strong>{' '}
              It represents the estimated incremental revenue that could
              potentially be generated from the modeled impact of the relevant
              ACR solution — calculated deterministically from available
              evidence, validated benchmarks, explicit assumptions, and risk
              adjustments.
            </p>
            <p className="docs-copy">
              Where a business-specific value cannot be observed from public
              research, BRAIN resolves it through a defined evidence hierarchy:
              observed data first, then external estimates, then validated
              benchmarks, then explicitly labelled assumptions. Unverified
              references never drive revenue arithmetic. If a required input
              has no defensible source at any layer, the calculation reports{' '}
              <em>Insufficient evidence</em> rather than inventing a number.
            </p>
            <p className="docs-copy">
              The result is a risk-adjusted figure: a gross modeled lift,
              reduced by a composite risk adjustment covering technical,
              market, and infrastructure failure modes. BRAIN does not
              guarantee any revenue outcome, and actual results will differ.
            </p>
            <p className="docs-copy">
              Every research result carries one of three revenue states:
            </p>
            <dl className="evidence-guide-list docs-evidence-list">
              <div className="evidence-guide-item">
                <dt>Calculated</dt>
                <dd>
                  A revenue estimate was produced because the applicable
                  calculation pathway had sufficient evidence. This includes a
                  genuine calculated zero — a defensible $0/mo result is a
                  calculation, not a gap.
                </dd>
              </div>
              <div className="evidence-guide-item">
                <dt>Insufficient Data</dt>
                <dd>
                  BRAIN has a calculation pathway for the intervention, but the
                  available evidence is insufficient to establish a defensible
                  revenue estimate. The report names the specific evidence that
                  is missing — for example, an observed repeat purchase rate.
                </dd>
              </div>
              <div className="evidence-guide-item">
                <dt>Not Supported</dt>
                <dd>
                  BRAIN does not currently have a validated calculation pathway
                  for the intervention. The intervention can still be assessed
                  qualitatively, but BRAIN will not manufacture a revenue
                  estimate without a defensible calculation model.
                </dd>
              </div>
            </dl>
          </section>

          {/* Benchmark provenance */}
          <section className="docs-section" aria-labelledby="docs-benchmarks">
            <h2 id="docs-benchmarks" className="docs-heading">
              Benchmark sources
            </h2>
            <p className="docs-copy">
              Benchmarks used in revenue calculations come from credible,
              dated primary datasets. The most frequently applied records:
            </p>
            <ul className="docs-list">
              <li>
                <strong>BMK-001 / BMK-003</strong> — Global ecommerce conversion
                rate (~2.66% / ~2.72%). Triple Whale (53,000+ brands, Aug 2025 –
                Jul 2026) and Dynamic Yield XP².
              </li>
              <li>
                <strong>BMK-002</strong> — Beauty &amp; personal care conversion
                rate (~5.39%). Dynamic Yield XP², 12-month average.
              </li>
              <li>
                <strong>BMK-015 / BMK-017</strong> — Repeat purchase rate
                (~28.2% average; ~29% consumables). Shopify customer-retention
                research.
              </li>
              <li>
                <strong>BMK-074</strong> — On-site data collection completion
                rate (V1 range 50/65/80%). Outgrow-derived reference range.
              </li>
              <li>
                <strong>BMK-043 – BMK-048, BMK-041</strong> — Category order
                values (apparel $89.17, electronics $113.41, food &amp;
                beverage $63.32, home &amp; garden $114.43, automotive $116.34,
                travel $130.91) and the DTC paid-channel median ($61.22), all
                from Triple Whale Ecommerce Benchmarks 2026.
              </li>
              <li>
                <strong>BMK-064</strong> — Support contact rate (~21 per 100
                orders, health &amp; beauty). Gorgias Ecom Lab. Used for Revenue
                Protection reporting, never deducted from revenue math.
              </li>
            </ul>
            <p className="docs-copy">
              Some historical references (for example the 8/12/18% purchase
              band for on-site data collection funnels) are used only as
              explicitly labelled assumptions because they have not yet been
              validated against a current primary dataset. Unvalidated records
              are excluded from revenue arithmetic and are never presented as
              benchmarks.
            </p>
          </section>

          {/* Determinism + IP boundary */}
          <section className="docs-section" aria-labelledby="docs-method">
            <h2 id="docs-method" className="docs-heading">
              How the calculation works
            </h2>
            <ul className="docs-list">
              <li>
                <strong>Deterministic.</strong> Every revenue figure is produced
                by a fixed calculation engine with the same inputs, evidence and
                configuration — no AI model performs arithmetic. AI analysis
                layers interpret the calculated results; they never change them.
              </li>
              <li>
                <strong>Traceable.</strong> The Revenue Calculation column shows
                the resolved inputs with their evidence tags and the shape of
                the model, so technical users can verify that defensible
                variables produced the result.
              </li>
              <li>
                <strong>Deliberately incomplete.</strong> The full proprietary
                ACR methodology — including realization weighting, maturity
                modifiers, and complete internal risk weighting — is
                intentionally not exposed. The calculation trail is sufficient
                to audit the inputs, not to reproduce the model.
              </li>
            </ul>
          </section>

          <p className="docs-footer-note">
            Questions about a specific calculation? The evidence tag on every
            line of the Revenue Calculation column identifies exactly which
            layer supplied each value.
          </p>
          <Link href="/research" className="docs-cta">
            Open the research workspace →
          </Link>
        </div>
      </main>
    </>
  );
}
