import type { JwtPayload } from 'jsonwebtoken';

export const OAUTH_TRANSACTION_COOKIES: readonly string[];
export function randomUrlSafeValue(bytes?: number): string;
export function createPkcePair(): { verifier: string; challenge: string };
export function sanitizeLocalPath(value: unknown, fallback?: string): string;
export function resolvePostLoginDestination(
  value: unknown,
  hasPropertyAccess: boolean,
): string;
export function localAppUrl(baseUrl: string, value: unknown, fallback?: string): string;
export function sanitizeLogoutPath(value: unknown, fallback?: string): string;
export function verifyAuth0IdToken(
  idToken: string,
  options: { domain: string; clientId: string; nonce: string },
): Promise<JwtPayload & { sub: string }>;
