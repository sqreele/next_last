import type { JwtPayload } from 'jsonwebtoken';

export const OAUTH_TRANSACTION_COOKIES: readonly string[];
export function randomUrlSafeValue(bytes?: number): string;
export function createPkcePair(): { verifier: string; challenge: string };
export function createAuth0AuthorizationTransaction(options: {
  domain: string;
  clientId: string;
  baseUrl: string;
  audience: string;
  redirectPath?: string;
  screenHint?: string | null;
}): {
  authorizeUrl: URL;
  state: string;
  nonce: string;
  verifier: string;
  redirectPath: string;
};
export function validateOAuthCallbackTransaction(transaction: {
  callbackState: string | null | undefined;
  expectedState: string | null | undefined;
  expectedNonce: string | null | undefined;
  codeVerifier: string | null | undefined;
}): 'invalid_state' | 'invalid_nonce' | 'pkce_required' | null;
export function sanitizeLocalPath(value: unknown, fallback?: string): string;
export function localAppUrl(baseUrl: string, value: unknown, fallback?: string): string;
export function sanitizeLogoutPath(value: unknown, fallback?: string): string;
export function verifyAuth0IdToken(
  idToken: string,
  options: { domain: string; clientId: string; nonce: string },
): Promise<JwtPayload & { sub: string }>;
