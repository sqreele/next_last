export function getSubscriptionWarning(entitlement, graceDateLabel) {
  if (!entitlement || entitlement.entitlement_level === "FULL") return null;

  const contact = entitlement.can_manage_billing
    ? "Please contact StayMaint support to update your subscription."
    : "Please contact your administrator.";

  if (entitlement.entitlement_level === "GRACE") {
    const deadline = graceDateLabel || entitlement.grace_ends_at || "the grace deadline";
    return {
      tone: "warning",
      message: `Payment failed. Please update billing by ${deadline} to avoid service interruption.`,
      contact,
    };
  }

  if (entitlement.entitlement_level === "READ_ONLY") {
    return {
      tone: "attention",
      message: entitlement.enforcement_mode === "enforce"
        ? "Your subscription requires attention. StayMaint is currently read-only."
        : "Your subscription requires attention. Access restrictions may apply when the grace period ends.",
      contact,
    };
  }

  return null;
}
