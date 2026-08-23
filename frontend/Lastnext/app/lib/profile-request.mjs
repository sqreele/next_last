export function buildProfilePatch(initial, current) {
  const patch = {};
  for (const field of ["first_name", "last_name", "positions"]) {
    const initialValue = initial?.[field] ?? "";
    const currentValue = current?.[field] ?? "";
    if (initialValue !== currentValue) patch[field] = currentValue;
  }
  return patch;
}

export function hasProfileChanges(initial, current) {
  return Object.keys(buildProfilePatch(initial, current)).length > 0;
}

export function profileErrorMessage(
  payload,
  fallback = "Unable to save your profile.",
) {
  if (!payload || typeof payload !== "object") return fallback;
  const detail = payload.detail || payload.error;
  if (typeof detail === "string" && detail.trim()) return detail;
  return fallback;
}

export function profileFieldErrors(payload) {
  if (!payload || typeof payload !== "object") return {};
  const errors = {};
  for (const field of ["first_name", "last_name", "positions"]) {
    const value = payload[field];
    if (Array.isArray(value) && value.length) errors[field] = String(value[0]);
    else if (typeof value === "string") errors[field] = value;
  }
  return errors;
}
