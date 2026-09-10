import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';

export default function LandingPage() {
  return (
    <>
      <LandingNav />

      <main id="top">
        {/* ===== HERO ===== */}
        <section className="hero" aria-label="Hero">
          <div className="container">
            <div className="hero-badge">
              <span className="hero-badge-dot" aria-hidden="true"></span>
              <span className="hero-badge-text">
                Business Revenue Assessment &amp; Intelligence Node
              </span>
            </div>

            <h1 className="hero-headline">
              <span className="hero-line">
                RESEARCH THE BUSINESS
                <span className="hero-arrow">&#8681;</span>
              </span>
              <span className="hero-line">
                UNCOVER THE PROBLEMS
                <span className="hero-arrow">&#8681;</span>
              </span>
              <span className="hero-line">
                ASSESS THE OPPORTUNITIES
                <span className="hero-arrow">&#8681;</span>
              </span>
              <span className="hero-line">IMPLEMENT THE SOLUTIONS</span>
            </h1>

            <p className="hero-subtitle">
              Powered by real-world case studies, industry benchmarks, and
              structured business intelligence. Everything you need to turn
              research into action.
            </p>

            <div className="hero-process" aria-label="Research process">
              <div className="hero-process-step">
                <div className="hero-process-num">01</div>
                <div className="hero-process-name">RESEARCH</div>
              </div>
              <div className="hero-process-step">
                <div className="hero-process-num">02</div>
                <div className="hero-process-name">DIAGNOSE</div>
              </div>
              <div className="hero-process-step">
                <div className="hero-process-num">03</div>
                <div className="hero-process-name">ASSESS</div>
              </div>
              <div className="hero-process-step">
                <div className="hero-process-num">04</div>
                <div className="hero-process-name">IMPLEMENT</div>
              </div>
            </div>

            <Link href="/research" className="hero-cta">
              Start Business Research
            </Link>
            <p className="hero-support-text">
              Research up to 10 businesses in one session. Choose owner research or prospect research at the workspace.
            </p>
          </div>
        </section>

        {/* ===== WHO BRAIN IS FOR ===== */}
        <section id="who" className="who" aria-label="Who BRAIN is for">
          <div className="container">
            <div className="section-label">
              Built for two sides of the same problem
            </div>
            <h2 className="section-headline">
              Research the business from a perspective its own dashboard may
              never show.
            </h2>
            <p className="section-copy">
              BRAIN is designed for people who need to understand a business
              before deciding what should happen next.
            </p>

            <div className="who-grid">              <article className="who-card">
                <div className="who-card-num">01</div>
                <h3 className="who-card-title">E-commerce Owners &amp; Operators</h3>
                <p className="who-card-copy">
                  Get an external, structured view of your e-commerce business
                  before investing in a new strategy, system, agency, tool or
                  growth initiative.
                </p>
                <ul className="who-card-bullets">
                  <li>Identify potential bottlenecks and growth gaps.</li>
                  <li>Benchmark the business against relevant signals.</li>
                  <li>Understand potential upside, downside and risk.</li>
                  <li>Evaluate proposed strategies before implementation.</li>
                </ul>
                <Link
                  href="/research/owner"
                  className="who-card-cta"
                  aria-label="Understand My Business — open Owner Research"
                >
                  Understand My Business <span aria-hidden="true">→</span>
                </Link>
              </article>

              <article className="who-card">
                <div className="who-card-num">02</div>
                <h3 className="who-card-title">Freelancers, Agencies &amp; Lead Generators</h3>
                <p className="who-card-copy">
                  Research prospective businesses before pitching a service,
                  product, system or strategy — turning generic outreach into
                  evidence-backed opportunity identification.
                </p>
                <ul className="who-card-bullets">
                  <li>Research multiple prospects in one workflow.</li>
                  <li>Find business-specific problems worth investigating.</li>
                  <li>Assess whether your proposed solution fits the evidence.</li>
                  <li>Build stronger discovery calls and proposals.</li>
                </ul>
                <Link
                  href="/research/prospect"
                  className="who-card-cta"
                  aria-label="Research My Prospect — open Prospect Research"
                >
                  Research My Prospect <span aria-hidden="true">→</span>
                </Link>
              </article>
            </div>
          </div>
        </section>

        {/* ===== RESEARCH WORKSPACE ===== */}
        <section id="research" className="research" aria-label="Research workspace">
          <div className="container">
            <div className="section-label">Research Workspace</div>
            <h2 className="section-headline">One structured view of the business.</h2>
            <p className="section-copy">
              BRAIN collects available signals from multiple sources and organizes
              them into a research-ready business intelligence workspace.
            </p>

            <div className="spreadsheet-wrap">
              <div className="spreadsheet-topbar">
                <span className="spreadsheet-topbar-title">
                  Business Research — Preview
                </span>
                <span className="spreadsheet-topbar-meta">
                  9 displayed fields · Sample output
                </span>
              </div>
              <div className="spreadsheet-scroll">
                <table className="spreadsheet" role="table">
                  <thead>
                    <tr>
                      <th scope="col">Business</th>
                      <th scope="col">Status</th>
                      <th scope="col">Monthly Traffic</th>
                      <th scope="col">Products</th>
                      <th scope="col">Reviews</th>
                      <th scope="col">On-site Data Collection</th>
                      <th scope="col">Potential Revenue Lift</th>
                      <th scope="col">Revenue Calculation</th>
                      <th scope="col">Growth Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="td-bold">Example Brand</td>
                      <td>
                        <span className="status-badge">
                          <span className="status-dot"></span> Complete
                        </span>
                      </td>
                      <td>48K+</td>
                      <td>36</td>
                      <td>2,840</td>
                      <td>Present</td>
                      <td>$8,420/mo</td>
                      <td>
                        <span className="rw-cell-calc">
                          {`AOV = $89.17 [BMK]
CVR = 2.66% [BMK]
Data Collection Start = 5% [ASM]
Completion = 65% [BMK]
Purchase = 12% [ASM]

Incremental Buyers = Collection Buyers − Baseline Buyers
Gross Lift = Incremental Buyers × AOV
Risk Adjustment = composite buffer
Potential Lift = $8,420/mo`}
                        </span>
                      </td>
                      <td>74 / 100</td>
                    </tr>
                    <tr>
                      <td className="td-bold">Example Store</td>
                      <td>
                        <span className="status-badge">
                          <span className="status-dot"></span> Complete
                        </span>
                      </td>
                      <td>31K+</td>
                      <td>21</td>
                      <td>1,190</td>
                      <td>Not found</td>
                      <td>$5,240/mo</td>
                      <td>
                        <span className="rw-cell-calc">
                          {`AOV = $61.22 [BMK]
CVR = 2.66% [BMK]
RPR = 28.2% [BMK]
High RPR = 29% [BMK]

Projected RPR = Baseline + ΔRPR × Realization
Additional Buyers = Entering × ΔRPR
LTV Lift = Additional Buyers × AOV
Risk Adjustment = composite buffer
Potential Lift = $5,240/mo`}
                        </span>
                      </td>
                      <td>61 / 100</td>
                    </tr>
                    <tr>
                      <td className="td-bold">Another Brand</td>
                      <td>
                        <span className="status-badge status-badge-partial">
                          <span className="status-dot status-dot-partial"></span>{' '}
                          Partial
                        </span>
                      </td>
                      <td>19K+</td>
                      <td>14</td>
                      <td>740</td>
                      <td>Present</td>
                      <td className="td-bold">$3,180/mo</td>
                      <td>
                        <span className="rw-cell-calc">
                          {`AOV = $63.32 [BMK]
CVR = 2.72% [BMK]
Data Collection Start = 3% [ASM]
Completion = 65% [BMK]
Purchase = 8% [ASM]

Gross Lift = Incremental Buyers × AOV
Risk Adjustment = composite buffer
Potential Lift = $3,180/mo`}
                        </span>
                      </td>
                      <td>55 / 100</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="spreadsheet-note">
                Free research remains useful on its own. Selected high-value
                analysis fields can be previewed in the workspace, while the
                complete structured research dataset can be exported when unlocked.
              </div>
              <Link href="/research" className="spreadsheet-export">
                Clean structured export — $1.50
              </Link>
            </div>

            {/* Support Loop — positioned under spreadsheet */}
            <div className="hero-loop" aria-label="Support loop">
              <span>More support</span>
              <span className="hero-loop-arrow" aria-hidden="true">
                →
              </span>
              <span>Better infrastructure</span>
              <span className="hero-loop-arrow" aria-hidden="true">
                →
              </span>
              <span>Higher limits</span>
              <span className="hero-loop-arrow" aria-hidden="true">
                →
              </span>
              <span>Better research</span>
              <span className="hero-loop-arrow" aria-hidden="true">
                →
              </span>
              <span className="hero-loop-highlight">
                Results you can TRUST
              </span>
            </div>
          </div>
        </section>

        {/* ===== BENEFITS ===== */}
        <section className="benefits" aria-label="Benefits">
          <div className="container">
            <div className="benefits-grid">
              <div className="benefit-item">
                <div className="benefit-num">01</div>
                <h3 className="benefit-title">Research Faster</h3>
                <p className="benefit-copy">
                  Replace scattered manual research with structured business
                  intelligence gathered across multiple sources.
                </p>
              </div>
              <div className="benefit-item">
                <div className="benefit-num">02</div>
                <h3 className="benefit-title">Find the Gaps</h3>
                <p className="benefit-copy">
                  Surface potential acquisition, conversion, retention,
                  operational and strategic bottlenecks.
                </p>
              </div>
              <div className="benefit-item">
                <div className="benefit-num">03</div>
                <h3 className="benefit-title">Assess Before Acting</h3>
                <p className="benefit-copy">
                  Compare conservative, base and aggressive outcomes, including
                  potential risks, failures and upside.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== $1.50 EXPORT ===== */}
        <section className="export-section" aria-label="Structured export">
          <div className="container">
            <div className="export-card">
              <h3>Help build the infrastructure you use.</h3>
              <p>
                Research can be viewed for free. The $1.50 structured export
                helps fund better research infrastructure, higher usage limits,
                stronger data sources and ongoing maintenance — so BRAIN can
                continue becoming more useful for everyone using it.
              </p>
              <div className="export-price">$1.50</div>
              <div className="export-price-label">One-time export</div>
            </div>
          </div>
        </section>

        {/* ===== INTELLIGENCE STACK ===== */}
        <section id="sources" className="sources" aria-label="Intelligence stack">
          <div className="container">
            <div className="section-label">Intelligence Stack</div>
            <h2 className="section-headline">Multiple sources. One structured view.</h2>
            <p className="section-copy">
              BRAIN combines publicly available business, website, traffic,
              social, company and advertising signals before the analysis layer
              evaluates what those signals may mean.
            </p>

            <div className="sources-grid">
              <div className="source-item">
                <div className="source-name">Firecrawl</div>
                <div className="source-desc">Website Intelligence</div>
              </div>
              <div className="source-item">
                <div className="source-name">Apify</div>
                <div className="source-desc">Social Intelligence</div>
              </div>
              <div className="source-item">
                <div className="source-name">Apollo</div>
                <div className="source-desc">Company Intelligence</div>
              </div>
              <div className="source-item">
                <div className="source-name">Semrush</div>
                <div className="source-desc">Traffic &amp; Search Signals</div>
              </div>
              <div className="source-item">
                <div className="source-name">Meta Ad Library</div>
                <div className="source-desc">Advertising Signals</div>
              </div>
              <div className="source-item">
                <div className="source-name">Industry Benchmarks</div>
                <div className="source-desc">Performance Context</div>
              </div>
              <div className="source-item">
                <div className="source-name">Real-World Case Studies</div>
                <div className="source-desc">Strategy Evidence</div>
              </div>
              <div className="source-item">
                <div className="source-name">ACR Framework</div>
                <div className="source-desc">Acquisition · Conversion · Retention</div>
              </div>
            </div>

            <p className="sources-disclaimer">
              Source availability varies by business and research session.
              Available data is classified by its evidence type and source.
              Missing information is not silently fabricated.
            </p>

            <a href="#research" className="sources-cta">
              Research a Business
            </a>
          </div>
        </section>

        {/* ===== ANALYSIS LAYER ===== */}
        <section className="analysis" aria-label="Analysis layer">
          <div className="container">
            <div className="section-label">The Analysis Layer</div>
            <h2 className="section-headline">
              Not just data collection. Contextual assessment.
            </h2>
            <p className="section-copy">
              BRAIN is designed to cross-reference observed business signals
              against relevant benchmarks and real-world evidence before
              assessing the potential impact of a proposed solution.
            </p>

            <div className="analysis-grid">
              <div className="analysis-item">
                <div className="analysis-num">01</div>
                <h3 className="analysis-title">Conservative</h3>
                <p className="analysis-copy">
                  The lowest plausible outcome based on the available evidence,
                  assumptions and identified constraints.
                </p>
              </div>
              <div className="analysis-item">
                <div className="analysis-num">02</div>
                <h3 className="analysis-title">Base</h3>
                <p className="analysis-copy">
                  The central scenario representing a reasonable outcome when
                  the proposed strategy performs as expected.
                </p>
              </div>
              <div className="analysis-item">
                <div className="analysis-num">03</div>
                <h3 className="analysis-title">Aggressive</h3>
                <p className="analysis-copy">
                  The highest potential scenario supported by relevant evidence,
                  without presenting the result as a guarantee.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== USER EVIDENCE ===== */}
        <section className="evidence" aria-label="User evidence">
          <div className="container">
            <div className="section-label">User Evidence</div>
            <h2 className="section-headline">Let the users write this section.</h2>
            <p className="section-copy">
              BRAIN will never manufacture testimonials. Real feedback from
              business owners, consultants, agencies and researchers will appear
              here as the product is used.
            </p>

            <div className="evidence-grid">
              <article className="evidence-card">
                <p className="evidence-card-quote">
                  Reviews will appear here after real users begin using BRAIN.
                </p>
                <div className="evidence-card-status">
                  Awaiting verified user feedback
                </div>
              </article>
              <article className="evidence-card">
                <p className="evidence-card-quote">
                  Real results. Real research. No manufactured testimonials.
                </p>
                <div className="evidence-card-status">
                  Awaiting verified user feedback
                </div>
              </article>
              <article className="evidence-card">
                <p className="evidence-card-quote">
                  The strongest proof will come from what people do with the
                  intelligence BRAIN produces.
                </p>
                <div className="evidence-card-status">
                  Awaiting verified user feedback
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ===== CREATOR / ABOUT ===== */}
        <section id="about" className="about" aria-label="About BRAIN">
          <div className="container">
            <div className="section-label">The People Behind BRAIN</div>
            <h2 className="section-headline">Built by a strategist. Accelerated by AI.</h2>

            <div className="about-card">
              <div className="about-card-heading">MK × AI</div>
              <p>
                BRAIN was created by MK as a practical business intelligence
                system for researching businesses, identifying bottlenecks,
                evaluating opportunities and connecting research to action.
              </p>
              <p>
                The system combines strategic thinking, business research,
                automation, structured data and AI-assisted analysis. The goal is
                simple: make high-quality business research more accessible, more
                structured and more actionable.
              </p>
              <div className="about-card-footer">
                Human Strategy · AI-Assisted Development · Continuous Iteration
              </div>
            </div>
          </div>
        </section>

        {/* ===== ROADMAP ===== */}
        <section id="roadmap" className="roadmap" aria-label="Roadmap">
          <div className="container">
            <div className="section-label">The Roadmap</div>
            <h2 className="section-headline">
              From research tool to business intelligence infrastructure.
            </h2>
            <p className="section-copy">
              BRAIN is being developed in stages. Each phase expands what the
              system can research, assess and eventually connect to.
            </p>

            <div className="roadmap-grid">
              <article className="roadmap-card">
                <span className="roadmap-card-status completed">Completed</span>
                <div className="roadmap-card-num">01</div>
                <h3 className="roadmap-card-title">Research Engine</h3>
                <p className="roadmap-card-desc">
                  Multi-business research, structured intelligence, source
                  classification, research workspace and exportable data.
                </p>
              </article>
              <article className="roadmap-card">
                <span className="roadmap-card-status planned">Planned</span>
                <div className="roadmap-card-num">02</div>
                <h3 className="roadmap-card-title">Automated Intelligence</h3>
                <p className="roadmap-card-desc">
                  Deeper automated research, broader data coverage, stronger
                  normalization and more efficient research workflows.
                </p>
              </article>
              <article className="roadmap-card">
                <span className="roadmap-card-status planned">Planned</span>
                <div className="roadmap-card-num">03</div>
                <h3 className="roadmap-card-title">Opportunity Analysis</h3>
                <p className="roadmap-card-desc">
                  Benchmark-driven opportunity assessment, scenario modelling,
                  risk analysis and structured strategic recommendations.
                </p>
              </article>
              <article className="roadmap-card">
                <span className="roadmap-card-status planned">Planned</span>
                <div className="roadmap-card-num">04</div>
                <h3 className="roadmap-card-title">Intelligence Infrastructure</h3>
                <p className="roadmap-card-desc">
                  Expanded integrations, advanced workflows, MCP connectivity and
                  a broader intelligence infrastructure built around BRAIN.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ===== DISCLAIMER ===== */}
        <section className="disclaimer" aria-label="Disclaimer">
          <div className="container">
            <p>
              BRAIN is a pre-implementation research and opportunity-assessment
              tool. Results may be based on publicly available information,
              industry benchmarks, observed signals and explicitly identified
              assumptions. They are estimates and are not guarantees of revenue,
              ROI or business performance. Brand-specific financial analysis
              requires first-party business data.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </>
  );
}

function LandingFooter() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-brand-name">BRAIN</div>
            <p className="footer-brand-desc">
              Business Revenue Assessment &amp; Intelligence Node. A business
              research and opportunity assessment system designed to turn
              scattered information into structured intelligence and action.
            </p>
          </div>

          <div className="footer-col">
            <div className="footer-col-title">Resources</div>
            <ul>
              <li>
                <Link href="/research">Research Tools</Link>
              </li>
              <li>
                <a href="#sources">ACR Framework</a>
              </li>
              <li>
                <a href="#">Case Studies</a>
              </li>
              <li>
                <Link href="/docs">Benchmarks &amp; Methodology</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <div className="footer-col-title">Connect</div>
            <ul>
              <li>
                <a href="#">Contact</a>
              </li>
              <li>
                <a href="#">LinkedIn</a>
              </li>
              <li>
                <a href="#">X</a>
              </li>
              <li>
                <a href="#">Instagram</a>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <div className="footer-col-title">BRAIN</div>
            <ul>
              <li>
                <Link href="/research">Research Tool</Link>
              </li>
              <li>
                <a href="#sources">Data Sources</a>
              </li>
              <li>
                <a href="#roadmap">Roadmap</a>
              </li>
              <li>
                <a href="#">Privacy</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copyright">&copy; 2026 BRAIN. All rights reserved.</p>
          <p className="footer-tagline">Research → Diagnose → Assess → Implement</p>
        </div>
      </div>
    </footer>
  );
}
