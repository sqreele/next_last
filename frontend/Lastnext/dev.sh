#!/bin/bash

# Development environment setup script
echo "🚀 Setting up development environment..."

# Set required environment variables
# Auth0 local defaults
export AUTH0_SECRET=${AUTH0_SECRET:-"dev-secret-change-me"}
export AUTH0_BASE_URL=${AUTH0_BASE_URL:-"http://localhost:3000"}
export AUTH0_ISSUER_BASE_URL=${AUTH0_ISSUER_BASE_URL:-"https://pmcs.au.auth0.com"}
export AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID:-"UdbZN0iJ6NVDHX3kCCeYprrQoC8P2Mbz"}
export AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET:-"changeme-in-prod"}
export NEXT_PUBLIC_API_URL="http://localhost:8000"
export NODE_ENV="development"

# Verify environment variables are set
echo "✅ Environment variables set:"
echo "   AUTH0_BASE_URL: $AUTH0_BASE_URL"
echo "   AUTH0_ISSUER_BASE_URL: $AUTH0_ISSUER_BASE_URL"
echo "   AUTH0_CLIENT_ID: $AUTH0_CLIENT_ID"
echo "   NEXT_PUBLIC_API_URL: $NEXT_PUBLIC_API_URL"
echo "   NODE_ENV: $NODE_ENV"

# Start the development server
echo "🚀 Starting Next.js development server..."
npm run dev
