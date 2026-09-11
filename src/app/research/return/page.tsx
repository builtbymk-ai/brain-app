'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LandingNav } from '@/components/LandingNav';

/**
 * Post-checkout return page for Bachs hosted checkout redirects.
 *
 * Arriving here with ?status=success does NOT mean payment succeeded — the URL
 * is browser-controlled and never grants entitlement. The page asks the server
 * to verify the payment against Bachs; only a server-confirmed `paid` state
 * triggers export generation. Cancelled/abandoned returns show a neutral state.
 */
function ReturnContent() {
  const params = useSearchParams();
  const reference = params.get('ref');
  const statusParam = params.get('status');

  const [state, setState] = useState<'checking' | 'paid' | 'unconfirmed' | 'error'>(
    statusParam === 'cancelled' ? 'unconfirmed' : 'checking'
  );
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (statusParam === 'cancelled') return;
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch('/api/export/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reference ? { reference } : {}),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.status === 'paid') {
          setState('paid');
          if (data.downloadUrl && typeof window !== 'undefined') {
            window.open(data.downloadUrl, '_blank');
          } else if (data.inline && data.data) {
            const blob = new Blob([data.data], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'brain-research-export.csv';
            a.click();
            URL.revokeObjectURL(url);
          }
        } else if (res.status === 402 || res.status === 404) {
          setState('unconfirmed');
          setMessage(
            data.error ||
              'Payment has not been confirmed yet. If you completed the payment, the confirmation may still be processing — refresh this page in a moment.'
          );
        } else {
          setState('error');
          setMessage(data.error || 'We could not verify your payment status. Please try again.');
        }
      } catch {
        setState('error');
        setMessage('Network error while verifying your payment. Please refresh to try again.');
      }
    })();
  }, [reference, statusParam]);

  if (statusParam === 'cancelled') {
    return (
      <div className="return-card">
        <h1 className="return-title">Checkout cancelled</h1>
        <p className="return-copy">
          No charge was made and your export remains locked. You can restart the
          payment from your research workspace at any time.
        </p>
        <div className="return-actions">
          <Link href="/research" className="rw-btn-secondary" style={{ textDecoration: 'none' }}>
            Back to Research
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'checking') {
    return (
      <div className="return-card">
        <span className="rw-spinner" aria-hidden="true"></span>
        <h1 className="return-title">Confirming your payment…</h1>
        <p className="return-copy">
          We are verifying your payment with our payment provider. This page will
          update automatically — you do not need to do anything.
        </p>
      </div>
    );
  }

  if (state === 'paid') {
    return (
      <div className="return-card">
        <span className="rw-export-check" aria-hidden="true">
          ✓
        </span>
        <h1 className="return-title">Payment confirmed</h1>
        <p className="return-copy">
          Your structured research export is ready. If the download did not start
          automatically, reopen your research workspace — the export is unlocked
          there as well.
        </p>
        <div className="return-actions">
          <Link href="/research" className="rw-btn-primary" style={{ textDecoration: 'none' }}>
            Back to Research
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="return-card">
      <h1 className="return-title">
        {state === 'error' ? 'Verification problem' : 'Payment not confirmed yet'}
      </h1>
      <p className="return-copy">{message}</p>
      <div className="return-actions">
        <button className="rw-btn-secondary" onClick={() => window.location.reload()}>
          Check again
        </button>
        <Link href="/research" className="rw-btn-primary" style={{ textDecoration: 'none' }}>
          Back to Research
        </Link>
      </div>
    </div>
  );
}

export default function ResearchReturnPage() {
  return (
    <>
      <LandingNav />
      <main className="rw-main">
        <div className="container">
          <Suspense
            fallback={
              <div className="return-card">
                <span className="rw-spinner" aria-hidden="true"></span>
                <h1 className="return-title">Loading…</h1>
              </div>
            }
          >
            <ReturnContent />
          </Suspense>
        </div>
      </main>
    </>
  );
}
