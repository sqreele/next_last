export function getProtectedMediaPath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\\/g, '/');
  const index = normalized.indexOf('/api/protected-media/');
  return index >= 0 ? normalized.slice(index) : null;
}
