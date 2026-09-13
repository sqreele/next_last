import { randomBytes } from 'node:crypto';

export const OPAQUE_SESSION_REFERENCE = /^v2\.[A-Za-z0-9_-]{43}$/;

export function createSessionReference() {
  return `v2.${randomBytes(32).toString('base64url')}`;
}

export function parseSessionReference(value) {
  return value && OPAQUE_SESSION_REFERENCE.test(value) ? value : null;
}
