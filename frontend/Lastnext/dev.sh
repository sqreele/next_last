#!/bin/bash

# Development environment setup script
echo "🚀 Setting up development environment..."

# Set required environment variables
# Auth0 local defaults - Updated for v4
export AUTH0_SECRET=${AUTH0_SECRET:-"dev-secret-change-me"}
export APP_BASE_URL=${APP_BASE_URL:-"http://localhost:3000"}
export AUTH0_BASE_URL=${AUTH0_BASE_URL:-"http://localhost:3000"}
export AUTH0_ISSUER_BASE_URL=${AUTH0_ISSUER_BASE_URL:-"https://pcms.ca.auth0.com"}
export AUTH0_DOMAIN=${AUTH0_DOMAIN:-"pcms.ca.auth0.com"}
export AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID:-"H5QKkdL5wsGPvdY6FEFGVmuBQCKKzSV7"}
export AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET:-"CMxpx4HmEMsTohty_ID6oP9iG9kJEXp8h4lEyeZlcont7hbpQddg1WIAznIhnlfH"}
export AUTH0_AUDIENCE=${AUTH0_AUDIENCE:-"http://localhost:8000"}
export AUTH0_SCOPE=${AUTH0_SCOPE:-"openid profile email offline_access read:data write:data"}
export NEXT_PUBLIC_API_URL="http://localhost:8000"
export NODE_ENV="development"

# Verify environment variables are set
echo "✅ Environment variables set:"
echo "   APP_BASE_URL: $APP_BASE_URL"
echo "   AUTH0_BASE_URL: $AUTH0_BASE_URL"
echo "   AUTH0_ISSUER_BASE_URL: $AUTH0_ISSUER_BASE_URL"
echo "   AUTH0_DOMAIN: $AUTH0_DOMAIN"
echo "   AUTH0_CLIENT_ID: $AUTH0_CLIENT_ID"
echo "   AUTH0_SCOPE: $AUTH0_SCOPE"
echo "   AUTH0_AUDIENCE: $AUTH0_AUDIENCE"
echo "   NEXT_PUBLIC_API_URL: $NEXT_PUBLIC_API_URL"
echo "   NODE_ENV: $NODE_ENV"

# Start the development server
echo "🚀 Starting Next.js development server..."
npm run dev
