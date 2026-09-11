'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { getModeDefinition, UserType } from '@/lib/analysis/modes';

interface ResearchResult {
  domain: string;
  displayName: string;
  brandName: string | null;
  proposedSolution: string | null;
  status: 'complete' | 'partial';
  monthlyTraffic: string;
  products: string;
  reviews: string;
  quiz: string;
  revenueOpportunity: string;
  revenueCalculation?: string;
  growthAssessment: string;
  analysis?: {
    solutionFit?: string | null;
    confidence?: string;
    summary?: string;
    solutionImpact?: string | null;
    priorityChanges?: string[] | null;
    angleOfPitch?: string | null;
  } | null;
}

interface BusinessInput {
  brandName: string;
  url: string;
  proposedSolution: string;
}

type ResearchState = 'idle' | 'loading' | 'done' | 'error';

const EMPTY_INPUT: BusinessInput = { brandName: '', url: '', proposedSolution: '' };

export function ResearchWorkspace({ userType }: { userType: UserType }) {
  const mode = getModeDefinition(userType);
  const storageKey = `brain_session_token_${userType}`;

  const [inputs, setInputs] = useState<BusinessInput[]>([{ ...EMPTY_INPUT }]);
  const [state, setState] = useState<ResearchState>('idle');
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [exportState, setExportState] = useState<'idle' | 'paying' | 'done' | 'error'>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportData, setExportData] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);

  // Session restore: on mount, recover the previous session for THIS mode
  // from localStorage and re-fetch its results so a refresh doesn't lose work.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    if (!saved) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/research?token=${encodeURIComponent(saved)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.research) && data.research.length > 0) {
          setSessionToken(saved);
          setResults(data.research);
          setState('done');
        }
      } catch {
        // Silent — restore is best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const addInput = useCallback(() => {
    if (inputs.length < 10) {
      setInputs((prev) => [...prev, { ...EMPTY_INPUT }]);
    }
  }, [inputs.length]);

  const removeInput = useCallback((index: number) => {
    setInputs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateInput = useCallback((index: number, field: keyof BusinessInput, value: string) => {
    setInputs((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }, []);

  const handleResearch = async () => {
    const filled = inputs.filter((v) => v.url.trim());
    if (filled.length === 0) {
      setError(`Enter at least one ${userType === 'owner' ? 'brand' : 'prospect'} URL.`);
      return;
    }

    setState('loading');
    setError('');
    setResults([]);

    try {
      const body: Record<string, unknown> = { inputs: filled, userType };
      if (sessionToken) body.token = sessionToken;

      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const token = res.headers.get('X-Session-Token');
      if (token) {
        setSessionToken(token);
        try {
          window.localStorage.setItem(storageKey, token);
        } catch {
          // localStorage unavailable — session continues in memory.
        }
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Research failed. Please try again.');
        setState('error');
        return;
      }

      setResults(data.research ?? []);
      setState('done');

      // Scroll to results after a tick
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setState('error');
    }
  };

  const handleExport = async () => {
    if (!sessionToken) return;

    setExportState('paying');

    try {
      // Step 1: Initialize checkout (amount is fixed server-side)
      const createRes = await fetch('/api/export/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken, email: email || undefined }),
      });

      const createData = await createRes.json();

      if (!createRes.ok) {
        setError(createData.error || 'Failed to initialize checkout.');
        setExportState('error');
        return;
      }

      // Step 2: Open the Bachs overlay checkout (hosted page in a modal).
      // The browser event only drives UI — the server-side webhook/verification
      // is the source of truth that actually unlocks the export.
      if (typeof window !== 'undefined' && createData.checkoutUrl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Bachs = (window as any).Bachs;

        if (Bachs?.Checkout?.open) {
          // One-time SDK initialization (required before open()).
          if (!Bachs.__brainInitialized) {
            Bachs.Initialize({ onEvent: () => {} });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (Bachs as any).__brainInitialized = true;
          }
          Bachs.Checkout.open({
            checkoutUrl: createData.checkoutUrl,
            onEvent: (event: { type: string }) => {
              if (event.type === 'checkout.completed') {
                verifyPayment(createData.reference);
              }
              if (event.type === 'checkout.closed' || event.type === 'checkout.expired') {
                setExportState('idle');
              }
            },
          });
        } else {
          // Fallback: full-page redirect to the hosted checkout
          window.location.href = createData.checkoutUrl;
        }
      } else {
        setError('Bachs checkout is not available. Please try again later.');
        setExportState('error');
      }
    } catch {
      setError('Export initialization failed. Please try again.');
      setExportState('error');
    }
  };

  const verifyPayment = async (reference: string) => {
    try {
      const res = await fetch('/api/export/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Payment verification failed.');
        setExportState('error');
        return;
      }

      if (data.status === 'paid') {
        if (data.downloadUrl) {
          setDownloadUrl(data.downloadUrl);
        }
        if (data.inline && data.data) {
          setExportData(data.data);
        }
        setExportState('done');
      } else {
        setError('Payment not confirmed. Export is still locked.');
        setExportState('error');
      }
    } catch {
      setError('Verification failed. Please contact support.');
      setExportState('error');
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
    if (exportData) {
      const blob = new Blob([exportData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brain-${userType}-research-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const entityLabel = userType === 'owner' ? 'Brand' : 'Prospect';
  // 9 base columns + mode premium column = 11 columns.
  const displayedColumns = 11;
  const premiumKey = userType === 'owner' ? 'priorityChanges' : 'angleOfPitch';
  const premiumHead =
    userType === 'owner' ? 'Priority Changes' : 'Angle of Pitch';

  return (
    <div className={`rw rw-${userType}`}>
      {/* Navigation */}
      <header className="nav" role="banner">
        <nav className="nav-inner" aria-label="Research navigation">
          <Link href="/" className="nav-logo" aria-label="BRAIN home">
            <span className="nav-logo-mark" aria-hidden="true">B</span>
            <span className="nav-logo-text">BRAIN</span>
          </Link>
          <Link href="/" className="nav-cta" style={{ fontSize: '0.8rem' }}>
            ← Back to Home
          </Link>
        </nav>
      </header>

      <main className="rw-main">
        <div className="container">
          {/* Header */}
          <div className="rw-header">
            <div className="rw-mode-badge" aria-label={`Research mode: ${mode.label}`}>
              <span className="rw-mode-dot" aria-hidden="true"></span>
              {mode.label}
            </div>
            <h1 className="section-headline">{mode.headline}</h1>
            <p className="section-copy" style={{ margin: '0 auto' }}>
              {mode.intro}
            </p>
          </div>

          {/* Input Area */}
          <div className="rw-input-area">
            <div className="rw-input-column-heads" aria-hidden="true">
              <span>{mode.inputHeads[0]}</span>
              <span>{mode.inputHeads[1]}</span>
              <span>{mode.inputHeads[2]}</span>
              <span></span>
            </div>

            <div className="rw-input-list">
              {inputs.map((input, index) => (
                <div key={index} className="rw-input-row rw-input-row-3col">
                  <label className="rw-input-label rw-input-label-name" htmlFor={`brand-${index}-${userType}`}>{mode.inputHeads[0]}</label>
                  <input
                    id={`brand-${index}-${userType}`}
                    type="text"
                    className="rw-input"
                    placeholder={mode.placeholders[0]}
                    aria-label={`${mode.ariaLabels[0]} ${index + 1}`}
                    maxLength={120}
                    value={input.brandName}
                    onChange={(e) => updateInput(index, 'brandName', e.target.value)}
                  />
                  <label className="rw-input-label rw-input-label-url" htmlFor={`url-${index}-${userType}`}>{mode.inputHeads[1]}</label>
                  <input
                    id={`url-${index}-${userType}`}
                    type="text"
                    className="rw-input"
                    placeholder={mode.placeholders[1]}
                    aria-label={`${mode.ariaLabels[1]} ${index + 1}`}
                    value={input.url}
                    onChange={(e) => updateInput(index, 'url', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && index === inputs.length - 1 && inputs.length < 10) {
                        addInput();
                      }
                    }}
                  />
                  <label className="rw-input-label rw-input-label-solution" htmlFor={`solution-${index}-${userType}`}>{mode.inputHeads[2]}</label>
                  <input
                    id={`solution-${index}-${userType}`}
                    type="text"
                    className="rw-input"
                    placeholder={mode.placeholders[2]}
                    aria-label={`${mode.ariaLabels[2]} ${index + 1}`}
                    maxLength={1000}
                    value={input.proposedSolution}
                    onChange={(e) => updateInput(index, 'proposedSolution', e.target.value)}
                  />
                  {inputs.length > 1 && (
                    <button
                      className="rw-input-remove"
                      onClick={() => removeInput(index)}
                      aria-label={`Remove ${entityLabel.toLowerCase()} ${index + 1}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="rw-input-actions">
              {inputs.length < 10 && (
                <button className="rw-btn-secondary" onClick={addInput}>
                  + Add {entityLabel}
                </button>
              )}
              <button
                className="rw-btn-primary"
                onClick={handleResearch}
                disabled={state === 'loading'}
              >
                {state === 'loading' ? (
                  <span className="rw-loading">
                    <span className="rw-spinner" aria-hidden="true"></span>
                    Researching…
                  </span>
                ) : (
                  'Run Research'
                )}
              </button>
            </div>
            <p className="rw-input-note">{mode.helperNote}</p>

            {/* Evidence Guide — compact, collapsible; explains the evidence
                tags used throughout results and exports. */}
            <details className="evidence-guide">
              <summary className="evidence-guide-summary">
                <span aria-hidden="true">ⓘ</span>
                <span className="evidence-guide-title">Evidence Guide</span>
                <span className="evidence-guide-tags">OBS · EST · BMK · ASM · DRV</span>
              </summary>
              <dl className="evidence-guide-list">
                <div className="evidence-guide-item">
                  <dt>OBS — Observed</dt>
                  <dd>Directly captured or declared business data.</dd>
                </div>
                <div className="evidence-guide-item">
                  <dt>EST — Estimated</dt>
                  <dd>Externally estimated data, such as SimilarWeb traffic.</dd>
                </div>
                <div className="evidence-guide-item">
                  <dt>BMK — Benchmark</dt>
                  <dd>Validated external industry/reference data.</dd>
                </div>
                <div className="evidence-guide-item">
                  <dt>ASM — Assumption</dt>
                  <dd>An explicit modelling assumption used where appropriate.</dd>
                </div>
                <div className="evidence-guide-item">
                  <dt>DRV — Derived</dt>
                  <dd>Calculated from other evidence.</dd>
                </div>
                <div className="evidence-guide-item">
                  <dt>INSUFFICIENT DATA</dt>
                  <dd>BRAIN does not have enough defensible evidence to calculate the metric.</dd>
                </div>
              </dl>
              <p className="evidence-guide-docs-link">
                Benchmark references and source methodology →{' '}
                <Link href="/docs">Documentation</Link>
              </p>
            </details>
          </div>

          {/* Error */}
          {error && (
            <div className="rw-error" role="alert">
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="rw-results" ref={resultsRef}>
              <div className="rw-results-header">
                <h2 className="section-headline" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '8px' }}>
                  Research Complete
                </h2>
                <p className="rw-results-meta">
                  {results.length} {entityLabel.toLowerCase()}
                  {results.length !== 1 ? 's' : ''} analyzed · Session {sessionToken?.slice(0, 8)}…
                </p>
              </div>

              <div className="spreadsheet-wrap">
                <div className="spreadsheet-topbar">
                  <span className="spreadsheet-topbar-title">
                    {entityLabel} Research — Results
                  </span>
                  <span className="spreadsheet-topbar-meta">
                    {results.length} {entityLabel.toLowerCase()}
                    {results.length !== 1 ? 's' : ''} · {displayedColumns} fields
                  </span>
                </div>
                <div className="spreadsheet-scroll">
                  <table className="spreadsheet" role="table">
                    <thead>
                      <tr>
                        <th scope="col">{entityLabel}</th>
                        <th scope="col">Status</th>
                        <th scope="col">Monthly Traffic</th>
                        <th scope="col">Products</th>
                        <th scope="col">Reviews</th>
                        <th scope="col">On-site Data Collection</th>
                        <th scope="col">Potential Revenue Lift</th>
                        <th scope="col">Revenue Calculation</th>
                        <th scope="col">Growth Assessment</th>
                        <th scope="col">Solution Impact</th>
                        <th scope="col">{premiumHead}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i}>
                          <td className="td-bold">
                            {r.brandName || r.displayName}
                            {r.proposedSolution && (
                              <span className="rw-cell-solution" title={r.proposedSolution}>
                                {r.proposedSolution}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`status-badge ${r.status === 'partial' ? 'status-badge-partial' : ''}`}>
                              <span className={`status-dot ${r.status === 'partial' ? 'status-dot-partial' : ''}`}></span>
                              {r.status === 'complete' ? 'Complete' : 'Partial'}
                            </span>
                          </td>
                          <td>{r.monthlyTraffic}</td>
                          <td>{r.products}</td>
                          <td>{r.reviews}</td>
                          <td>{r.quiz}</td>
                          <td className="td-bold">
                            {r.revenueOpportunity === 'Unavailable' ? (
                              <span className="rw-cell-unavailable">
                                Unavailable
                                <span className="rw-cell-unavailable-note">
                                  Insufficient business evidence
                                </span>
                              </span>
                            ) : (
                              <span title="Modeled opportunity estimate — not guaranteed revenue">
                                {r.revenueOpportunity}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="rw-cell-calc" title="Deterministic ACR calculation — see Documentation for provenance">
                              {r.revenueCalculation || '—'}
                            </span>
                          </td>
                          <td>{r.growthAssessment}</td>
                          <td>
                            <span className="rw-cell-fit" title={r.analysis?.solutionImpact ?? ''}>
                              {r.analysis?.solutionImpact ?? '—'}
                            </span>
                          </td>
                          <td>
                            {i < 2 ? (
                              <span
                                className="rw-cell-fit"
                                title={
                                  premiumKey === 'priorityChanges'
                                    ? (r.analysis?.priorityChanges ?? []).join('\n')
                                    : r.analysis?.angleOfPitch ?? ''
                                }
                              >
                                {premiumKey === 'priorityChanges'
                                  ? (r.analysis?.priorityChanges ?? []).join(' · ') || '—'
                                  : r.analysis?.angleOfPitch ?? '—'}
                              </span>
                            ) : (
                              <span className="rw-cell-locked" aria-label="Premium — locked">
                                <span className="rw-cell-locked-blur" aria-hidden="true">
                                  ██████&nbsp;██████████
                                </span>
                                <span className="rw-cell-lock-note">🔒 Unlock with export</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Export Section */}
              {exportState !== 'done' ? (
                <div className="rw-export">
                  <div className="rw-export-card">
                    <h3 className="rw-export-title">Export Research Data</h3>
                    <p className="rw-export-desc">
                      Download the full structured CSV export — every row, including the{' '}
                      <strong>Solution Impact</strong> and{' '}
                      <strong>{premiumHead}</strong> columns for all{' '}
                      {results.length} {entityLabel.toLowerCase()}
                      {results.length !== 1 ? 's' : ''}. The free preview shows those
                      premium columns for the first two rows only; the export unlocks
                      all of them. The $1.50 one-time export helps fund better research
                      infrastructure and higher usage limits.
                    </p>
                    <div className="rw-export-price">
                      <span className="rw-export-amount">$1.50</span>
                      <span className="rw-export-label">One-time export</span>
                    </div>
                    <div className="rw-export-form">
                      <input
                        type="email"
                        className="rw-input rw-export-email"
                        placeholder="your@email.com (for receipt)"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <button
                        className="rw-btn-primary"
                        onClick={handleExport}
                        disabled={exportState === 'paying'}
                      >
                        {exportState === 'paying' ? (
                          <span className="rw-loading">
                            <span className="rw-spinner" aria-hidden="true"></span>
                            Processing…
                          </span>
                        ) : (
                          'Pay & Export — $1.50'
                        )}
                      </button>
                    </div>
                    <p className="rw-export-note">
                      Payment is processed securely via Bachs. Your export will be
                      available for download immediately after payment.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rw-export rw-export-done">
                  <div className="rw-export-card">
                    <div className="rw-export-success">
                      <span className="rw-export-check" aria-hidden="true">✓</span>
                      <h3 className="rw-export-title">Export Ready</h3>
                      <p className="rw-export-desc">
                        Your structured research export is ready for download.
                      </p>
                      <button className="rw-btn-primary" onClick={handleDownload}>
                        Download Export
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {state === 'idle' && results.length === 0 && (
            <div className="rw-empty">
              <h3 className="rw-empty-title">{mode.emptyTitle}</h3>
              <p className="rw-empty-desc">{mode.emptyCopy}</p>
            </div>
          )}
        </div>
      </main>

      {/* Bachs overlay checkout SDK */}
      <script src="https://checkout.bachs.io/bachs.js" async />
    </div>
  );
}
