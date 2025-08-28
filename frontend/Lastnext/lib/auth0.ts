// lib/auth0.ts

import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Initialize the Auth0 client with explicit configuration and sensible fallbacks
// Prefer AUTH0_ISSUER_BASE_URL; fall back to AUTH0_DOMAIN if provided
const resolvedIssuerBaseURL =
  process.env.AUTH0_ISSUER_BASE_URL ||
  (process.env.AUTH0_DOMAIN ? `https://${process.env.AUTH0_DOMAIN}` : undefined);

const resolvedBaseURL = process.env.AUTH0_BASE_URL || process.env.APP_BASE_URL;

export const auth0 = new Auth0Client({
  issuerBaseURL: resolvedIssuerBaseURL as string,
  baseURL: resolvedBaseURL as string,
  clientID: process.env.AUTH0_CLIENT_ID as string,
  clientSecret: process.env.AUTH0_CLIENT_SECRET as string,
  secret: process.env.AUTH0_SECRET as string,
});
