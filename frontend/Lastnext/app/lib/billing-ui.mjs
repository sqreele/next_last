const STRIPE_HOST_SUFFIX = '.stripe.com';

export function rows(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.results) ? payload.results : [];
}

export function billingStatusLabel(status) {
  const labels = {
    trialing: 'Trialing',
    active: 'Active',
    past_due: 'Past due',
    cancelled: 'Cancelled',
    suspended: 'Suspended',
    missing: 'Not configured',
  };
  return labels[status] || 'Unavailable';
}

export function formatBillingDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export function isSafeStripeHostedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      url.hostname === 'stripe.com' || url.hostname.endsWith(STRIPE_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
}

export function redirectToStripe(value, locationObject = globalThis.location) {
  if (!isSafeStripeHostedUrl(value)) throw new Error('Billing provider returned an invalid URL.');
  locationObject.assign(value);
}
