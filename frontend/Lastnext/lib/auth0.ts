// lib/auth0.ts

import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Initialize the Auth0 client with basic configuration
// Auth0 v4 will use environment variables by default
export const auth0 = new Auth0Client({
  // Basic configuration - Auth0 v4 will read from environment variables
  // AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET
});
