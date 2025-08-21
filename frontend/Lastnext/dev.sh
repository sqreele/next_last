#!/bin/bash

# Development environment setup script
echo "🚀 Setting up development environment..."

# Set required environment variables
export NEXTAUTH_SECRET="K/QdN0nOS9Sep9RDp8YCEsxDhGTmRWVW/7wR/0C8kuA="
export NEXTAUTH_URL="http://localhost:3000"
export NEXT_PUBLIC_API_URL="http://localhost:8000"
export NODE_ENV="development"

# Verify environment variables are set
echo "✅ Environment variables set:"
echo "   NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:0:10}..."
echo "   NEXTAUTH_URL: $NEXTAUTH_URL"
echo "   NEXT_PUBLIC_API_URL: $NEXT_PUBLIC_API_URL"
echo "   NODE_ENV: $NODE_ENV"

# Start the development server
echo "🚀 Starting Next.js development server..."
npm run dev
