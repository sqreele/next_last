// Production Configuration - All Mock Data Disabled
module.exports = {
  // Environment
  NODE_ENV: 'production',
  
  // API Configuration
  API_BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000',
  
  // Authentication - Auth0 Only
  AUTH0_DOMAIN: process.env.NEXT_PUBLIC_AUTH0_DOMAIN,
  AUTH0_CLIENT_ID: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
  AUTH0_AUDIENCE: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
  
  // Feature Flags
  USE_MOCK_DATA: false,
  DEV_MODE: false,
  
  // Logging
  LOG_LEVEL: 'info',
  DEBUG_MODE: false,
  
  // Security - Auth0 Only
  REQUIRE_REAL_AUTH: true,
  
  // Performance
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  API_TIMEOUT: 30000, // 30 seconds
};
