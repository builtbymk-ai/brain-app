import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingNav } from '@/components/LandingNav';
import { MODE_DEFINITIONS } from '@/lib/analysis/modes';

export const metadata: Metadata = {
  title: 'Choose Your Research — BRAIN',
  description:
    'Two research experiences, one intelligence engine: understand your own business, or research a prospect before the pitch.',
};

export default function ResearchChooserPage() {
  return (
    <>
      <LandingNav />

      <main className="rw-main">
        <div className="container">
          <div className="rw-header">
            <div className="section-label">Research Workspace</div>
            <h1 className="section-headline">Two experiences. One intelligence engine.</h1>
            <p className="section-copy" style={{ margin: '0 auto' }}>
              Both research modes run the same ACR Revenue Opportunity Model underneath —
              the same evidence rules, benchmarks and analysis discipline. What changes is
              the perspective: your own business, or a prospect you are about to pitch.
            </p>
          </div>

          <div className="chooser-grid">
            {(Object.keys(MODE_DEFINITIONS) as Array<'owner' | 'prospect'>).map((key) => {
              const mode = MODE_DEFINITIONS[key];
              return (
                <article key={key} className={`chooser-card chooser-card-${key}`}>
                  <div className="chooser-card-label">{mode.label}</div>
                  <h2 className="chooser-card-title">{mode.chooserTitle}</h2>
                  <p className="chooser-card-copy">{mode.chooserCopy}</p>
                  <Link
                    href={`/research/${key}`}
                    className="chooser-card-cta"
                    aria-label={`${mode.cta} — open the ${mode.label} workspace`}
                  >
                    {mode.cta}
                    <span aria-hidden="true"> →</span>
                  </Link>
                </article>
              );
            })}
          </div>

          <p className="chooser-note">
            Not sure which fits? If the research subject is a business you own or operate,
            choose Owner Research. If you would be paid to solve its problems, choose
            Prospect Research.
          </p>
        </div>
      </main>
    </>
  );
}
