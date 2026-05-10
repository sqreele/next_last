type NameLikeUser = {
  profile?: {
    full_name?: string | null;
    display_name?: string | null;
  } | null;
  full_name?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  id?: string | number | null;
};

const RAW_AUTH_ID_PATTERN = /^(google-oauth2_|auth0_)/i;
const RAW_AUTH_PIPE_PATTERN = /^auth0\|/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRawUserIdentifier(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  return (
    lower === 'null' ||
    lower === 'undefined' ||
    lower === '[object object]' ||
    RAW_AUTH_ID_PATTERN.test(text) ||
    RAW_AUTH_PIPE_PATTERN.test(text) ||
    UUID_PATTERN.test(text) ||
    /^\d+$/.test(text)
  );
}

function cleanCandidate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || isRawUserIdentifier(text)) return null;
  return text;
}

export function getDisplayName(
  user: NameLikeUser | string | number | null | undefined,
  fallback = 'Unknown Technician'
): string {
  if (user === null || user === undefined) return fallback;

  if (typeof user === 'string' || typeof user === 'number') {
    return cleanCandidate(user) || fallback;
  }

  const fullName = [user.first_name, user.last_name]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');

  const candidates = [
    user.profile?.full_name,
    user.profile?.display_name,
    user.full_name,
    user.display_name,
    fullName,
    user.name,
    user.email,
    user.username,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanCandidate(candidate);
    if (cleaned) return cleaned;
  }

  return fallback;
}

export function getUserEmail(user: unknown): string {
  if (user && typeof user === 'object' && 'email' in user) {
    const email = (user as { email?: string | null }).email;
    return email && !isRawUserIdentifier(email) ? email : '';
  }
  return '';
}
