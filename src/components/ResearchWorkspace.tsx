'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { getModeDefinition, UserType } from '@/lib/analysis/modes';
import {
  resolveCheckoutOpenAction,
  navigateToCheckout,
  CHECKOUT_UNAVAILABLE_MESSAGE,
} from '@/lib/checkout-redirect';

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
  /**
   * V2B.3 — authoritative analytical state carried from the research engine
   * (never inferred in the UI from the revenue display string).
   */
  revenueState?: 'CALCULATED' | 'INSUFFICIENT_DATA' | 'NOT_SUPPORTED';
  revenueExplanation?: {
    statusLine: string;
    reason: string;
    additionalEvidence: string | null;
    why: string | null;
  } | null;
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
  // V2B.1 — Owner-mode first-party economics (raw strings; the API validates
  // and normalizes them. Empty string = not supplied = benchmark fallback).
  aov: string;
  conversionRate: string;
  monthlyBuyers: string;
  repeatPurchaseRate: string;
  // V2D.3 — documented controlled recovery experiment (raw strings; the API
  // validates them as ALL-OR-NOTHING L3 evidence. Any supplied-but-invalid
  // value rejects the research request rather than partially entering the
  // evidence chain. Empty = no experiment = INSUFFICIENT_DATA recovery state.
  recovery: {
    abandonedCheckouts: string;
    treatmentEligible: string;
    controlEligible: string;
    treatmentRecovered: string;
    controlRecovered: string;
    windowDays: string;
    interventionDifference: string;
    recoveryAov: string;
  };
}

type ResearchState = 'idle' | 'loading' | 'done' | 'error';

const EMPTY_RECOVERY: BusinessInput['recovery'] = {
  abandonedCheckouts: '',
  treatmentEligible: '',
  controlEligible: '',
  treatmentRecovered: '',
  controlRecovered: '',
  windowDays: '',
  interventionDifference: '',
  recoveryAov: '',
};

const EMPTY_INPUT: BusinessInput = {
  brandName: '',
  url: '',
  proposedSolution: '',
  aov: '',
  conversionRate: '',
  monthlyBuyers: '',
  repeatPurchaseRate: '',
  recovery: { ...EMPTY_RECOVERY },
};

/** True when any recovery-evidence field has a value. */
function hasRecoveryInput(r: BusinessInput['recovery']): boolean {
  return Object.values(r).some((v) => v.trim() !== '');
}

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

  /** V2D.3 — update one nested recovery-evidence field for one business row. */
  const updateRecoveryInput = useCallback(
    (index: number, field: keyof BusinessInput['recovery'], value: string) => {
      setInputs((prev) =>
        prev.map((v, i) =>
          i === index ? { ...v, recovery: { ...v.recovery, [field]: value } } : v
        )
      );
    },
    []
  );

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
      // Owner mode carries first-party economics (raw strings — the API
      // validates and normalizes). Prospect mode never sends them (§9).
      const payloadInputs = filled.map((v) => {
        if (userType !== 'owner') {
          return { brandName: v.brandName, url: v.url, proposedSolution: v.proposedSolution };
        }
        // V2D.3 — send recovery evidence only when the owner actually entered
        // any of it; a wholly empty block means "no experiment" and must not
        // trip the all-or-nothing validation on the server.
        const withRecovery = hasRecoveryInput(v.recovery)
          ? { recovery: v.recovery }
          : {};
        return {
          brandName: v.brandName,
          url: v.url,
          proposedSolution: v.proposedSolution,
          aov: v.aov,
          conversionRate: v.conversionRate,
          monthlyBuyers: v.monthlyBuyers,
          repeatPurchaseRate: v.repeatPurchaseRate,
          ...withRecovery,
        };
      });

      const body: Record<string, unknown> = { inputs: payloadInputs, userType };
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
        const detail = Array.isArray(data.details) && data.details.length > 0
          ? ` ${data.details.join(' ')}`
          : '';
        setError((data.error || 'Research failed. Please try again.') + detail);
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

      // Step 2: Send the customer to the Bachs hosted checkout — the documented
      // hosted-page integration ("a plain redirect to checkout_url"). The
      // redirect itself never grants entitlement: Bachs returns the customer to
      // /research/return, where the server verifies the payment against Bachs
      // and the webhook remains the fulfilment source of truth.
      const action = resolveCheckoutOpenAction(createData);

      if (action.type === 'error') {
        setError(action.message);
        setExportState('error');
        return;
      }

      navigateToCheckout(action.url);
    } catch {
      setError('Export initialization failed. Please try again.');
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

                  {/* V2B.1 — Business Performance Data (Owner mode only),
                      scoped to THIS business. Optional first-party economics
                      the owner supplies from their own analytics/order
                      history. Values are treated as observed [OBS] evidence
                      and take precedence over benchmark fallbacks in the ACR
                      model. No proprietary model internals are exposed. */}
                  {userType === 'owner' && (
                    <details className="rw-performance">
                      <summary>
                        <span aria-hidden="true">◆</span>
                        <span className="rw-performance-title">Business Performance Data</span>
                        <span className="rw-performance-hint">Optional — improves precision</span>
                      </summary>
                      <p className="rw-performance-note">
                        Optional numbers from your own store analytics or order
                        history, for the same recent period (for example, the
                        last 30 days). Anything you leave blank is researched
                        from public sources and industry benchmarks instead.
                      </p>
                      <div className="rw-performance-grid">
                        <div className="rw-performance-field">
                          <label className="rw-performance-label" htmlFor={`fp-aov-${index}`}>
                            Average Order Value <span className="rw-performance-optional">Optional</span>
                          </label>
                          <input
                            id={`fp-aov-${index}`}
                            type="text"
                            inputMode="decimal"
                            className="rw-input rw-performance-input"
                            placeholder="e.g. 54.20 (USD)"
                            aria-label={`Average Order Value in US dollars for ${input.brandName || `business ${index + 1}`}`}
                            value={input.aov}
                            onChange={(e) => updateInput(index, 'aov', e.target.value)}
                          />
                          <span className="rw-performance-help">Average revenue per completed order.</span>
                        </div>
                        <div className="rw-performance-field">
                          <label className="rw-performance-label" htmlFor={`fp-cvr-${index}`}>
                            Store Conversion Rate <span className="rw-performance-optional">Optional</span>
                          </label>
                          <input
                            id={`fp-cvr-${index}`}
                            type="text"
                            inputMode="decimal"
                            className="rw-input rw-performance-input"
                            placeholder="e.g. 2.6 (%)"
                            aria-label={`Store conversion rate percent for ${input.brandName || `business ${index + 1}`}`}
                            value={input.conversionRate}
                            onChange={(e) => updateInput(index, 'conversionRate', e.target.value)}
                          />
                          <span className="rw-performance-help">Completed purchases divided by store sessions, as a percent.</span>
                        </div>
                        <div className="rw-performance-field">
                          <label className="rw-performance-label" htmlFor={`fp-buyers-${index}`}>
                            Monthly Buyers <span className="rw-performance-optional">Optional</span>
                          </label>
                          <input
                            id={`fp-buyers-${index}`}
                            type="text"
                            inputMode="numeric"
                            className="rw-input rw-performance-input"
                            placeholder="e.g. 2400"
                            aria-label={`Monthly buyers for ${input.brandName || `business ${index + 1}`}`}
                            value={input.monthlyBuyers}
                            onChange={(e) => updateInput(index, 'monthlyBuyers', e.target.value)}
                          />
                          <span className="rw-performance-help">Customers who bought during the period — not order count.</span>
                        </div>
                        <div className="rw-performance-field">
                          <label className="rw-performance-label" htmlFor={`fp-rpr-${index}`}>
                            Repeat Purchase Rate <span className="rw-performance-optional">Optional</span>
                          </label>
                          <input
                            id={`fp-rpr-${index}`}
                            type="text"
                            inputMode="decimal"
                            className="rw-input rw-performance-input"
                            placeholder="e.g. 18 (%)"
                            aria-label={`Repeat purchase rate percent for ${input.brandName || `business ${index + 1}`}`}
                            value={input.repeatPurchaseRate}
                            onChange={(e) => updateInput(index, 'repeatPurchaseRate', e.target.value)}
                          />
                          <span className="rw-performance-help">Share of those customers who bought again in the period.</span>
                        </div>
                      </div>

                      {/* V2D.3 — Documented recovery experiment (L3 evidence).
                          All-or-nothing: every field below must be filled for
                          the evidence to be usable; a partially documented
                          experiment cannot establish incrementality and is
                          never partially applied. Attributed recovery numbers
                          ("we recovered 40 orders last month") are NOT this
                          evidence and are deliberately not asked for. */}
                      <details className="rw-performance rw-performance-nested">
                        <summary>
                          <span aria-hidden="true">◆</span>
                          <span className="rw-performance-title">Recovery Experiment Evidence</span>
                          <span className="rw-performance-hint">Optional — enables checkout-recovery lift</span>
                        </summary>
                        <p className="rw-performance-note">
                          For abandoned-checkout recovery solutions only. BRAIN can
                          estimate potential recovery lift only from a documented
                          controlled comparison — two groups of abandoned checkouts
                          over the <strong>same period</strong>: one that received
                          the recovery intervention (treatment) and one that did
                          not (control). Numbers like "recovered orders last
                          month" from your platform's dashboard are{' '}
                          <strong>not</strong> sufficient — they include customers
                          who would have purchased anyway. Enter whole numbers
                          over the same measurement window for both groups.
                        </p>
                        <div className="rw-performance-grid">
                          <div className="rw-performance-field">
                            <label className="rw-performance-label" htmlFor={`rec-abandoned-${index}`}>
                              Monthly Abandoned Checkouts <span className="rw-performance-optional">Required together</span>
                            </label>
                            <input
                              id={`rec-abandoned-${index}`}
                              type="text"
                              inputMode="numeric"
                              className="rw-input rw-performance-input"
                              placeholder="e.g. 1800"
                              aria-label={`Monthly abandoned checkouts for ${input.brandName || `business ${index + 1}`}`}
                              value={input.recovery.abandonedCheckouts}
                              onChange={(e) => updateRecoveryInput(index, 'abandonedCheckouts', e.target.value)}
                            />
                            <span className="rw-performance-help">Shoppers who started checkout but did not complete, per month.</span>
                          </div>
                          <div className="rw-performance-field">
                            <label className="rw-performance-label" htmlFor={`rec-tx-${index}`}>
                              Treatment — Checkouts in Group <span className="rw-performance-optional">Required together</span>
                            </label>
                            <input
                              id={`rec-tx-${index}`}
                              type="text"
                              inputMode="numeric"
                              className="rw-input rw-performance-input"
                              placeholder="e.g. 900"
                              aria-label={`Treatment group abandoned checkouts for ${input.brandName || `business ${index + 1}`}`}
                              value={input.recovery.treatmentEligible}
                              onChange={(e) => updateRecoveryInput(index, 'treatmentEligible', e.target.value)}
                            />
                            <span className="rw-performance-help">Abandoned checkouts that received the recovery intervention.</span>
                          </div>
                          <div className="rw-performance-field">
                            <label className="rw-performance-label" htmlFor={`rec-txr-${index}`}>
                              Treatment — Orders Recovered <span className="rw-performance-optional">Required together</span>
                            </label>
                            <input
                              id={`rec-txr-${index}`}
                              type="text"
                              inputMode="numeric"
                              className="rw-input rw-performance-input"
                              placeholder="e.g. 63"
                              aria-label={`Treatment group recovered orders for ${input.brandName || `business ${index + 1}`}`}
                              value={input.recovery.treatmentRecovered}
                              onChange={(e) => updateRecoveryInput(index, 'treatmentRecovered', e.target.value)}
                            />
                            <span className="rw-performance-help">Completed orders in the treatment group during the window.</span>
                          </div>
                          <div className="rw-performance-field">
                            <label className="rw-performance-label" htmlFor={`rec-ctl-${index}`}>
                              Control — Checkouts in Group <span className="rw-performance-optional">Required together</span>
                            </label>
                            <input
                              id={`rec-ctl-${index}`}
                              type="text"
                              inputMode="numeric"
                              className="rw-input rw-performance-input"
                              placeholder="e.g. 900"
                              aria-label={`Control group abandoned checkouts for ${input.brandName || `business ${index + 1}`}`}
                              value={input.recovery.controlEligible}
                              onChange={(e) => updateRecoveryInput(index, 'controlEligible', e.target.value)}
                            />
                            <span className="rw-performance-help">Abandoned checkouts that did NOT receive the intervention (held back).</span>
                          </div>
                          <div className="rw-performance-field">
                            <label className="rw-performance-label" htmlFor={`rec-ctlr-${index}`}>
                              Control — Orders Recovered <span className="rw-performance-optional">Required together</span>
                            </label>
                            <input
                              id={`rec-ctlr-${index}`}
                              type="text"
                              inputMode="numeric"
                              className="rw-input rw-performance-input"
                              placeholder="e.g. 27"
                              aria-label={`Control group recovered orders for ${input.brandName || `business ${index + 1}`}`}
                              value={input.recovery.controlRecovered}
                              onChange={(e) => updateRecoveryInput(index, 'controlRecovered', e.target.value)}
                            />
                            <span className="rw-performance-help">Completed orders in the control group during the same window.</span>
                          </div>
                          <div className="rw-performance-field">
                            <label className="rw-performance-label" htmlFor={`rec-window-${index}`}>
                              Measurement Window (days) <span className="rw-performance-optional">Required together</span>
                            </label>
                            <input
                              id={`rec-window-${index}`}
                              type="text"
                              inputMode="numeric"
                              className="rw-input rw-performance-input"
                              placeholder="e.g. 30"
                              aria-label={`Measurement window in days for ${input.brandName || `business ${index + 1}`}`}
                              value={input.recovery.windowDays}
                              onChange={(e) => updateRecoveryInput(index, 'windowDays', e.target.value)}
                            />
                            <span className="rw-performance-help">How long both groups were observed — must be identical for both.</span>
                          </div>
                          <div className="rw-performance-field">
                            <label className="rw-performance-label" htmlFor={`rec-diff-${index}`}>
                              What the Treatment Received <span className="rw-performance-optional">Required together</span>
                            </label>
                            <input
                              id={`rec-diff-${index}`}
                              type="text"
                              maxLength={300}
                              className="rw-input rw-performance-input"
                              placeholder="e.g. 3-email recovery sequence vs no emails"
                              aria-label={`Documented intervention difference for ${input.brandName || `business ${index + 1}`}`}
                              value={input.recovery.interventionDifference}
                              onChange={(e) => updateRecoveryInput(index, 'interventionDifference', e.target.value)}
                            />
                            <span className="rw-performance-help">Describe what differed between the two groups.</span>
                          </div>
                          <div className="rw-performance-field">
                            <label className="rw-performance-label" htmlFor={`rec-aov-${index}`}>
                              Recovery Average Order Value <span className="rw-performance-optional">Optional</span>
                            </label>
                            <input
                              id={`rec-aov-${index}`}
                              type="text"
                              inputMode="decimal"
                              className="rw-input rw-performance-input"
                              placeholder="e.g. 168.00 (USD)"
                              aria-label={`Recovery average order value in US dollars for ${input.brandName || `business ${index + 1}`}`}
                              value={input.recovery.recoveryAov}
                              onChange={(e) => updateRecoveryInput(index, 'recoveryAov', e.target.value)}
                            />
                            <span className="rw-performance-help">Average value of recovered orders, if you can observe it. Falls back to your AOV or category benchmarks when blank.</span>
                          </div>
                        </div>
                      </details>
                    </details>
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
                            {/* V2B.3 evidence-boundary states. The authoritative
                                state arrives from the engine via revenueState;
                                legacy sessions without it fall back to the
                                string check. A calculated value (including a
                                genuine $0/mo) renders as-is. */}
                            {r.revenueState === 'INSUFFICIENT_DATA' ? (
                              <span className="rw-cell-unavailable">
                                {r.revenueExplanation?.statusLine ?? 'Unavailable'}
                                <span className="rw-cell-unavailable-note">
                                  {r.revenueExplanation?.reason ??
                                    'Insufficient business evidence'}
                                </span>
                                {r.revenueExplanation?.additionalEvidence && (
                                  <span className="rw-cell-evidence-note">
                                    {r.revenueExplanation.additionalEvidence}
                                  </span>
                                )}
                              </span>
                            ) : r.revenueState === 'NOT_SUPPORTED' ? (
                              <span className="rw-cell-unsupported">
                                {r.revenueExplanation?.statusLine ?? 'Not currently supported'}
                                <span className="rw-cell-unavailable-note">
                                  {r.revenueExplanation?.reason ??
                                    'No validated revenue calculation pathway for this intervention.'}
                                </span>
                              </span>
                            ) : r.revenueState === undefined &&
                              r.revenueOpportunity === 'Unavailable' ? (
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
                            {r.revenueState === 'INSUFFICIENT_DATA' ||
                            r.revenueState === 'NOT_SUPPORTED' ? (
                              <span
                                className={`rw-cell-calc rw-cell-calc-state rw-cell-calc-state-${
                                  r.revenueState === 'INSUFFICIENT_DATA'
                                    ? 'insufficient'
                                    : 'unsupported'
                                }`}
                              >
                                <span className="rw-cell-calc-status">
                                  Status: {r.revenueState === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'NOT_SUPPORTED'}
                                </span>
                                <span className="rw-cell-calc-reason">
                                  {r.revenueState === 'INSUFFICIENT_DATA'
                                    ? 'Reason: Required evidence is not sufficient to establish a defensible revenue lift.'
                                    : 'Reason: No validated revenue calculation pathway currently exists for this intervention.'}
                                </span>
                                {r.revenueState === 'INSUFFICIENT_DATA' &&
                                  r.revenueExplanation?.additionalEvidence && (
                                    <span className="rw-cell-calc-reason">
                                      Additional evidence: {r.revenueExplanation.additionalEvidence}.
                                    </span>
                                  )}
                              </span>
                            ) : (
                              <span className="rw-cell-calc" title="Deterministic ACR calculation — see Documentation for provenance">
                                {r.revenueCalculation || '—'}
                              </span>
                            )}
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
                      >        {exportState === 'paying' ? (
          <span className="rw-loading">
            <span className="rw-spinner" aria-hidden="true"></span>
            Redirecting to secure checkout…
          </span>
        ) : (
          'Pay & Export — $1.50'
        )}
                      </button>
                    </div>
                    <p className="rw-export-note">
                      Payment is processed securely via Bachs. You will be redirected
                      to the secure checkout page and returned here once your export
                      is available for download.
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

    </div>
  );
}
