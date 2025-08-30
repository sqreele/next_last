#!/bin/bash

# Local Development Startup Script (Modified for local use)
echo "🚀 Starting Next.js application in LOCAL DEVELOPMENT mode..."

# Set local development environment
export NODE_ENV=development
export NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
export NEXT_PUBLIC_AUTH0_BASE_URL=http://localhost:3000
export NEXT_PUBLIC_AUTH0_DOMAIN=pcms.ca.auth0.com
export NEXT_PUBLIC_AUTH0_CLIENT_ID=H5QKkdL5wsGPvdY6FEFGVmuBQCKKzSV7

# Build the application
echo "📦 Building the application..."
npm run build

# Start the development server (more suitable for local testing)
echo "🌐 Starting development server..."
npm run dev
