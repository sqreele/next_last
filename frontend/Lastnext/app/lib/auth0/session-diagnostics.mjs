function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function createSessionDiagnostic(cookieValue, session, options = {}, now = Date.now()) {
  if (typeof options === 'number') {
    now = options;
    options = {};
  }
  const cookiePresent = typeof cookieValue === 'string' && cookieValue.length > 0;
  const sessionOpened = session !== null && typeof session === 'object';
  const expiresAt = session?.user?.accessTokenExpires;
  const diagnostic = {
    auth0_session_cookie_present: cookiePresent ? 'yes' : 'no',
    auth0_session_cookie_bytes: cookiePresent ? byteLength(cookieValue) : 0,
    session_open_succeeded: sessionOpened ? 'yes' : 'no',
    required_user_id_present: session?.user?.id ? 'yes' : 'no',
    access_token_present: session?.user?.accessToken ? 'yes' : 'no',
    access_token_expired:
      typeof expiresAt === 'number' && now > expiresAt ? 'yes' : 'no',
  };
  if (options.lookup) diagnostic.server_session_lookup = options.lookup;
  return diagnostic;
}

export function logSessionDiagnostic(cookieValue, session, options) {
  console.info(
    'auth_session_diagnostic',
    createSessionDiagnostic(cookieValue, session, options),
  );
}
