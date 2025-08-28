// lib/auth0.ts

// Basic Auth0 utility functions
// This file provides fallback functions when Auth0 is not fully configured

export const auth0 = {
  // Basic session getter (returns null when not configured)
  getSession: async () => {
    console.log('🔧 Auth0 getSession called but not fully configured');
    return null;
  },
  
  // Basic access token getter (returns null when not configured)
  getAccessToken: async () => {
    console.log('🔧 Auth0 getAccessToken called but not fully configured');
    return null;
  },
  
  // Basic middleware (passes through requests)
  middleware: async (request: any) => {
    console.log('🔧 Auth0 middleware called but not fully configured');
    return request;
  },
};
