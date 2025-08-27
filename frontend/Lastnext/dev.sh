#!/bin/bash

# Development environment setup script
echo "🚀 Setting up development environment..."

# Set required environment variables
export AUTH0_SECRET="dev-secret-change-me"
export AUTH0_BASE_URL="http://localhost:3000"
export NEXT_PUBLIC_API_URL="http://localhost:8000"
export NODE_ENV="development"

# Verify environment variables are set
echo "✅ Environment variables set:"
echo "   AUTH0_BASE_URL: $AUTH0_BASE_URL"
echo "   NEXT_PUBLIC_API_URL: $NEXT_PUBLIC_API_URL"
echo "   NODE_ENV: $NODE_ENV"

# Start the development server
echo "🚀 Starting Next.js development server..."
npm run dev
