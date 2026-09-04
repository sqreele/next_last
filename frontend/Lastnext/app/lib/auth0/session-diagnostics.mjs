function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function createSessionDiagnostic(cookieValue, session, options = {}, now = Date.now()) {
  // Backward-compatible third positional `now` for existing focused tests.
  if (typeof options === 'number') { now = options; options = {}; }
  const cookiePresent = typeof cookieValue === 'string' && cookieValue.length > 0;
  const sessionOpened = session !== null && typeof session === 'object';
  const userIdPresent = !!session?.user?.id;
  const accessTokenPresent = !!session?.user?.accessToken;
  const expiresAt = session?.user?.accessTokenExpires;
  const accessTokenExpired = typeof expiresAt === 'number' && now > expiresAt;

  const diagnostic = {
    auth0_session_cookie_present: cookiePresent ? 'yes' : 'no',
    auth0_session_cookie_bytes: cookiePresent ? byteLength(cookieValue) : 0,
    session_open_succeeded: sessionOpened ? 'yes' : 'no',
    required_user_id_present: userIdPresent ? 'yes' : 'no',
    access_token_present: accessTokenPresent ? 'yes' : 'no',
    access_token_expired: accessTokenExpired ? 'yes' : 'no',
  };
  if (options.lookup) diagnostic.server_session_lookup = options.lookup;
  return diagnostic;
}

export function logSessionDiagnostic(cookieValue, session, options) {
  // Temporary metadata-only diagnostic; never log the cookie or session values.
  console.info(
    'auth_session_diagnostic',
    createSessionDiagnostic(cookieValue, session, options),
  );
}
