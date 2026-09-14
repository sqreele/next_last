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
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export function formatBillingDateTime(value, timeZone) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function hasDisplayDate(value, formatter, timeZone) {
  return Boolean(value) && formatter(value, timeZone) !== '—';
}

function currentOrFuturePeriod(value, now = new Date()) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // current_period_end is date-only: compare at the end of that date, but never display a time.
  const periodEnd = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd >= now;
}

/**
 * Produces the single, non-contradictory lifecycle date shown to platform operators.
 * DateTime deadlines use the tenant timezone; date-only period ends deliberately do not.
 */
export function getLifecycleDisplay(billing, timeZone, now) {
  if (!billing) return { label: 'Expiry date unavailable', date: null, message: 'Expiry date unavailable' };

  const unavailable = { label: 'Expiry date unavailable', date: null, message: 'Expiry date unavailable' };
  const datetime = (label, value) => hasDisplayDate(value, formatBillingDateTime, timeZone)
    ? { label, date: formatBillingDateTime(value, timeZone), message: `${label} ${formatBillingDateTime(value, timeZone)}` }
    : unavailable;
  const date = (label, value) => hasDisplayDate(value, formatBillingDate)
    ? { label, date: formatBillingDate(value), message: `${label} ${formatBillingDate(value)}` }
    : unavailable;

  if (billing.status === 'trialing') return datetime('Trial expires', billing.trial_ends_at);
  if (billing.status === 'active') return date(billing.cancel_at_period_end ? 'Access until' : 'Renews', billing.current_period_end);
  if (billing.status === 'past_due') return datetime('Grace until', billing.grace_period_ends_at);
  if (billing.status === 'cancelled') {
    return date(currentOrFuturePeriod(billing.current_period_end, now) ? 'Access until' : 'Access ended', billing.current_period_end);
  }
  return unavailable;
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
    if (!billing.current_period_end) return { tone: 'attention', message: 'Expiry date unavailable' };
    if (billing.cancel_at_period_end) return { tone: 'warning', message: `Access until ${periodEnd}` };
    return { tone: 'neutral', message: `Renews ${periodEnd}` };
  }

  if (billing.status === 'trialing') {
    if (billing.reason_code === 'trial_end_missing') {
      return { tone: 'attention', message: 'Expiry date unavailable' };
    }
    if (billing.reason_code === 'trial_end_invalid') {
      return { tone: 'attention', message: 'Expiry date unavailable' };
    }
    if (billing.reason_code === 'trial_expired') {
      return { tone: 'attention', message: `Trial ended ${trialEnd}. StayMaint is read-only when enforcement is enabled.` };
    }
    if (!billing.trial_ends_at) return { tone: 'attention', message: 'Expiry date unavailable' };
    return { tone: 'neutral', message: `Trial expires ${trialEnd}` };
  }

  if (billing.status === 'past_due') {
    if (billing.grace_period_ends_at) return { tone: 'warning', message: `Grace until ${graceEnd}` };
    return { tone: 'attention', message: 'Expiry date unavailable' };
  }

  if (billing.status === 'cancelled') {
    if (!billing.current_period_end) {
      return { tone: 'attention', message: 'Expiry date unavailable' };
    }
    if (billing.reason_code === 'cancelled_period_ended') {
      return { tone: 'attention', message: `Access ended ${periodEnd}` };
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
