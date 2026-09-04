const INTEGER_ID = /^[1-9]\d*$/;

export function resolveInvitationBackendPath(segments, method) {
  const parts = Array.isArray(segments) ? segments : [];
  const normalizedMethod = String(method || '').toUpperCase();

  if (parts.length === 1 && parts[0] === 'preview' && normalizedMethod === 'POST') {
    return { path: 'invitations/preview', requiresAuth: false };
  }
  if (parts.length === 1 && parts[0] === 'accept' && normalizedMethod === 'POST') {
    return { path: 'invitations/accept', requiresAuth: true };
  }
  if (parts.length === 1 && parts[0] === 'workspace' && normalizedMethod === 'GET') {
    return { path: 'tenant-invitations/workspace', requiresAuth: true };
  }
  if (parts.length === 1 && parts[0] === 'manage' && ['GET', 'POST'].includes(normalizedMethod)) {
    return { path: 'tenant-invitations', requiresAuth: true };
  }
  if (
    parts.length === 3
    && parts[0] === 'manage'
    && INTEGER_ID.test(parts[1])
    && ['resend', 'revoke'].includes(parts[2])
    && normalizedMethod === 'POST'
  ) {
    return { path: `tenant-invitations/${parts[1]}/${parts[2]}`, requiresAuth: true };
  }
  return null;
}

export function hasUsableInvitationSession(session, now = Date.now()) {
  const token = session?.user?.accessToken;
  const expiresAt = session?.user?.accessTokenExpires;
  return Boolean(
    typeof token === 'string'
    && token.length > 0
    && (!expiresAt || (typeof expiresAt === 'number' && expiresAt > now)),
  );
}
