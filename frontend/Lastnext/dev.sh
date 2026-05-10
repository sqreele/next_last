#!/bin/bash

echo "🚀 Setting up development environment..."

export AUTH0_SECRET=${AUTH0_SECRET:-"dev-secret-change-me"}
export APP_BASE_URL=${APP_BASE_URL:-"http://localhost:3000"}
export AUTH0_BASE_URL=${AUTH0_BASE_URL:-"http://localhost:3000"}
export AUTH0_ISSUER_BASE_URL=${AUTH0_ISSUER_BASE_URL:-""}
export AUTH0_DOMAIN=${AUTH0_DOMAIN:-""}
export AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID:-""}
export AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET:-""}
export AUTH0_AUDIENCE=${AUTH0_AUDIENCE:-"http://localhost:8000"}
export AUTH0_SCOPE=${AUTH0_SCOPE:-"openid profile email offline_access read:data write:data"}
export NEXT_PUBLIC_API_URL="http://localhost:8000"
export NODE_ENV="development"

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

echo "🚀 Starting Next.js development server..."
npm run dev
