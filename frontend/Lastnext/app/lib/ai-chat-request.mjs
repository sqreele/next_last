export function canStartAiChatRequest({
  message,
  requestInFlight,
  isAuthenticated,
  propertyId,
}) {
  return Boolean(
    String(message ?? "").trim() &&
      !requestInFlight &&
      isAuthenticated &&
      propertyId,
  );
}

export function isCurrentAiChatRequest({
  requestId,
  currentRequestId,
  requestPropertyId,
  currentPropertyId,
}) {
  return (
    requestId === currentRequestId &&
    requestPropertyId === currentPropertyId
  );
}
