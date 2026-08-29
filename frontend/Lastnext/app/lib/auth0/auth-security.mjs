import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

export const OAUTH_TRANSACTION_COOKIES = Object.freeze([
  'auth0_login_state',
  'auth0_login_nonce',
  'auth0_pkce_verifier',
  'auth0_login_redirect',
]);

export function randomUrlSafeValue(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function createPkcePair() {
  const verifier = randomUrlSafeValue(32);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function sanitizeLocalPath(value, fallback = '/') {
  if (typeof value !== 'string' || !value) return fallback;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (
    !decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    decoded.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return fallback;
  }

  return decoded;
}

const INVITATION_ACCEPT_PATH = '/invitations/accept';

export function resolvePostLoginDestination(value, hasPropertyAccess) {
  const requestedRedirect = sanitizeLocalPath(value, '/dashboard');
  const invitationReturn =
    requestedRedirect === INVITATION_ACCEPT_PATH ||
    requestedRedirect === `${INVITATION_ACCEPT_PATH}/`;

  if (invitationReturn) return INVITATION_ACCEPT_PATH;
  return hasPropertyAccess ? requestedRedirect : '/auth/access-pending';
}

export function localAppUrl(baseUrl, value, fallback = '/') {
  const base = new URL(baseUrl);
  return new URL(sanitizeLocalPath(value, fallback), base.origin).toString();
}

export function sanitizeLogoutPath(value, fallback = '/') {
  const path = sanitizeLocalPath(value, fallback);
  return ['/', '/auth/login', '/auth/access-pending'].includes(path) ? path : fallback;
}

function auth0Issuer(domain) {
  const hostname = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://${hostname}/`;
}

export async function verifyAuth0IdToken(idToken, options) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    decoded.header?.alg !== 'RS256' ||
    typeof decoded.header?.kid !== 'string'
  ) {
    throw new Error('invalid_id_token_header');
  }

  const issuer = auth0Issuer(options.domain);
  const jwksResponse = await fetch(`${issuer}.well-known/jwks.json`, {
    cache: 'no-store',
  });
  if (!jwksResponse.ok) throw new Error('jwks_unavailable');

  const jwks = await jwksResponse.json();
  const signingJwk = Array.isArray(jwks?.keys)
    ? jwks.keys.find(
        (key) =>
          key?.kid === decoded.header.kid &&
          key?.kty === 'RSA' &&
          (!key?.use || key.use === 'sig'),
      )
    : undefined;
  if (!signingJwk) throw new Error('signing_key_not_found');

  const signingKey = createPublicKey({ key: signingJwk, format: 'jwk' });
  const claims = jwt.verify(idToken, signingKey, {
    algorithms: ['RS256'],
    issuer,
    audience: options.clientId,
    nonce: options.nonce,
    clockTolerance: 5,
  });

  if (
    typeof claims !== 'object' ||
    typeof claims.sub !== 'string' ||
    typeof claims.exp !== 'number' ||
    typeof claims.iat !== 'number'
  ) {
    throw new Error('invalid_id_token_claims');
  }
  return claims;
}
