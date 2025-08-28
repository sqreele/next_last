// lib/auth0.ts

import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Initialize the Auth0 client with environment-driven configuration
export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  appBaseUrl: process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL,
  secret: process.env.AUTH0_SECRET,
});
