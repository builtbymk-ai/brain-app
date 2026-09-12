/**
 * Hosted-checkout opening behavior for the $1.50 export (V1).
 *
 * Per the official Bachs documentation (docs.bachs.io → "Accept a payment with
 * Checkout"), the documented way to present a hosted checkout session is to
 * send the customer to the `checkout_url` returned by POST /v1/checkout-sessions:
 * "Redirect the customer — Send the customer to the checkout_url from the
 * response. Bachs renders the hosted page, collects payment, and handles
 * currency conversion."
 *
 * The bachs.js overlay SDK is an optional alternative ("Overlay or hosted
 * page?" — hosted page: "A plain redirect to checkout_url, zero JS. The
 * simplest possible integration"), so BRAIN V1 navigates directly and carries
 * no browser SDK dependency. Bachs redirects back to /research/return, where
 * the payment is verified server-side; fulfilment is never granted by the
 * navigation or the redirect itself (webhook + server verification are the
 * source of truth).
 */

/** Checkout-create response fragment as returned by POST /api/export/create. */
export interface CheckoutCreateResponse {
  checkoutUrl?: unknown;
  reference?: string;
  checkoutId?: string;
  amount?: string;
  currency?: string;
}

export type CheckoutOpenAction =
  | { type: 'navigate'; url: string }
  | { type: 'error'; message: string };

/** Message shown when a checkout cannot be opened. */
export const CHECKOUT_UNAVAILABLE_MESSAGE = 'Bachs checkout is not available. Please try again later.';

/**
 * Decide how to present a freshly created hosted checkout.
 * Deterministic: the same input always yields the same action.
 */
export function resolveCheckoutOpenAction(
  response: CheckoutCreateResponse | null | undefined
): CheckoutOpenAction {
  const url = response?.checkoutUrl;

  if (typeof url !== 'string') {
    return { type: 'error', message: CHECKOUT_UNAVAILABLE_MESSAGE };
  }

  const trimmed = url.trim();
  // Only http(s) URLs are valid checkout destinations. Anything else — empty,
  // relative paths, javascript:, data: — is rejected instead of navigated to.
  if (trimmed === '' || !/^https?:\/\//i.test(trimmed)) {
    return { type: 'error', message: CHECKOUT_UNAVAILABLE_MESSAGE };
  }

  return { type: 'navigate', url: trimmed };
}

/**
 * Perform the hosted-checkout navigation. The sink is injectable so tests can
 * assert that a successful creation response results in a navigation without a
 * real browser.
 */
export function navigateToCheckout(
  url: string,
  navigate: (href: string) => void = (href) => window.location.assign(href)
): void {
  navigate(url);
}
