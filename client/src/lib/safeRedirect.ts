// Where the browser may be sent after the server creates a Stripe Checkout
// session. The URL comes back from our own server (Stripe's session.url), but
// it is still data arriving over the network, so it is validated before the
// page navigates to it instead of being assigned to window.location blindly.
//
// Stripe-hosted Checkout always lives on https://checkout.stripe.com. If this
// app ever moves to a custom Stripe Checkout domain, add that hostname here.
const ALLOWED_CHECKOUT_HOSTS = new Set(["checkout.stripe.com"]);

// Returns the URL if it is safe to navigate to, otherwise null.
export function getSafeCheckoutUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let parsed: URL;
  try {
    // No base URL on purpose: Stripe always returns an absolute URL, so a
    // relative one (or "javascript:", "data:", etc.) is rejected below.
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "443") return null;
  if (!ALLOWED_CHECKOUT_HOSTS.has(parsed.hostname)) return null;
  return parsed.toString();
}

// Navigates to the checkout page if the URL passes validation.
// Returns true if navigation started, false if the URL was rejected.
export function redirectToCheckout(raw: unknown): boolean {
  const safeUrl = getSafeCheckoutUrl(raw);
  if (!safeUrl) return false;
  window.location.assign(safeUrl);
  return true;
}
