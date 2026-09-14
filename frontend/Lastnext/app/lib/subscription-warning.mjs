export function getSubscriptionWarning(entitlement, graceDateLabel) {
  if (!entitlement || entitlement.entitlement_level === "FULL") return null;

  const contact = entitlement.can_manage_billing
    ? "Please contact StayMaint support to update your subscription."
    : "Please contact your administrator.";

  if (entitlement.entitlement_level === "GRACE") {
    const deadline = graceDateLabel || entitlement.grace_ends_at || "the grace deadline";
    return {
      tone: "warning",
      message: `Payment failed — update billing by ${deadline} to avoid service interruption.`,
      contact,
    };
  }

  if (entitlement.entitlement_level === "READ_ONLY") {
    const reasonMessages = {
      trial_expired: "Your trial has ended.",
      trial_end_missing: "Your trial end could not be verified.",
      trial_end_invalid: "Your trial end could not be validated.",
      active_period_expired: "Your paid subscription period has ended.",
      active_missing_period_end: "Your paid subscription period could not be verified.",
      active_invalid_tenant_timezone: "Your paid subscription period could not be validated.",
      cancelled_period_ended: "Your cancelled subscription period has ended.",
    };
    const stateMessage = reasonMessages[entitlement.reason_code]
      || "Your subscription requires attention.";
    const modeMessage = entitlement.enforcement_mode === "enforce"
      ? "StayMaint is currently read-only."
      : "Access restrictions are currently in observe mode.";
    return {
      tone: "attention",
      message: `${stateMessage} ${modeMessage}`,
      contact,
    };
  }

  return null;
}
