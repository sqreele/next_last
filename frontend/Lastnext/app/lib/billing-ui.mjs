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

export function formatBillingDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function getBillingLifecycleMessage(billing) {
  if (!billing) return null;

  const periodEnd = formatBillingDate(billing.current_period_end);
  const trialEnd = formatBillingDateTime(billing.trial_ends_at);
  const graceEnd = formatBillingDateTime(billing.grace_period_ends_at);

  if (billing.status === 'active') {
    if (billing.reason_code === 'active_period_expired') {
      return { tone: 'attention', message: `Paid period expired after ${periodEnd}. StayMaint is read-only when enforcement is enabled.` };
    }
    if (billing.reason_code === 'active_missing_period_end') {
      return { tone: 'attention', message: 'Paid period end is unavailable. Billing requires attention.' };
    }
    if (billing.reason_code === 'active_invalid_tenant_timezone') {
      return { tone: 'attention', message: 'Paid period could not be validated. Billing requires attention.' };
    }
    if (billing.cancel_at_period_end) {
      return { tone: 'warning', message: `Access until ${periodEnd}` };
    }
    return { tone: 'neutral', message: `Renews on ${periodEnd}` };
  }

  if (billing.status === 'trialing') {
    if (billing.reason_code === 'trial_end_missing') {
      return { tone: 'attention', message: 'Trial end is unavailable. Billing requires attention.' };
    }
    if (billing.reason_code === 'trial_end_invalid') {
      return { tone: 'attention', message: 'Trial end could not be validated. Billing requires attention.' };
    }
    if (billing.reason_code === 'trial_expired') {
      return { tone: 'attention', message: `Trial ended ${trialEnd}. StayMaint is read-only when enforcement is enabled.` };
    }
    return { tone: 'neutral', message: `Trial ends ${trialEnd}` };
  }

  if (billing.status === 'past_due') {
    if (billing.grace_period_ends_at) {
      return { tone: 'warning', message: `Payment failed — update billing by ${graceEnd}` };
    }
    return { tone: 'attention', message: 'Payment failed and no grace deadline is available.' };
  }

  if (billing.status === 'cancelled') {
    if (!billing.current_period_end) {
      return { tone: 'attention', message: 'Subscription cancelled. No access-end date is available.' };
    }
    if (billing.reason_code === 'cancelled_period_ended') {
      return { tone: 'attention', message: `Access ended after ${periodEnd}` };
    }
    return { tone: 'warning', message: `Access until ${periodEnd}` };
  }

  if (billing.entitlement_level === 'READ_ONLY') {
    return { tone: 'attention', message: 'Subscription requires attention.' };
  }
  return null;
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
