// lib/auth0.ts

import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Initialize the Auth0 client with environment-driven configuration
export const auth0 = new Auth0Client({
  baseURL: process.env.AUTH0_BASE_URL,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  secret: process.env.AUTH0_SECRET,
});
