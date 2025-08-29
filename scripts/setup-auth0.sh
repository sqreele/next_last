#!/bin/bash

# Auth0 Setup Script for PCMS
# This script helps you set up Auth0 authentication correctly

echo "==================================="
echo "Auth0 Setup Script for PCMS"
echo "==================================="
echo ""

echo "Before running this script, please ensure you have:"
echo "1. Created an Auth0 account"
echo "2. Created a Single Page Application in Auth0"
echo "3. Created an API in Auth0"
echo ""

read -p "Press Enter to continue..."

echo ""
echo "Step 1: Auth0 Application Settings"
echo "==================================="
echo ""
echo "In your Auth0 Dashboard, go to Applications > Your App > Settings"
echo ""
echo "Set the following URLs:"
echo ""
echo "Allowed Callback URLs:"
echo "  https://pcms.live/api/auth/callback"
echo "  http://localhost:3000/api/auth/callback"
echo ""
echo "Allowed Logout URLs:"
echo "  https://pcms.live"
echo "  http://localhost:3000"
echo ""
echo "Allowed Web Origins:"
echo "  https://pcms.live"
echo "  http://localhost:3000"
echo ""
echo "Allowed Origins (CORS):"
echo "  https://pcms.live"
echo "  http://localhost:3000"
echo ""

read -p "Have you configured these URLs in Auth0? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please configure the URLs in Auth0 before continuing."
    exit 1
fi

echo ""
echo "Step 2: Auth0 API Settings"
echo "==================================="
echo ""
echo "In your Auth0 Dashboard, go to APIs > Your API"
echo ""
echo "Ensure your API identifier is set to: https://pcms.live/api"
echo ""
echo "Settings to configure:"
echo "- Enable RBAC: Yes"
echo "- Add Permissions in the Access Token: Yes"
echo "- Allow Offline Access: Yes"
echo ""

read -p "Have you configured your API with identifier 'https://pcms.live/api'? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please create/configure the API in Auth0 before continuing."
    exit 1
fi

echo ""
echo "Step 3: Environment Variables"
echo "==================================="
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from env.example..."
    cp frontend/Lastnext/env.example .env
fi

echo "Please update your .env file with the following Auth0 values:"
echo ""
echo "# Auth0 Configuration - Frontend"
echo "NEXT_PUBLIC_AUTH0_BASE_URL=https://pcms.live"
echo "NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL=https://YOUR_AUTH0_DOMAIN"
echo "NEXT_PUBLIC_AUTH0_DOMAIN=YOUR_AUTH0_DOMAIN"
echo "NEXT_PUBLIC_AUTH0_CLIENT_ID=YOUR_CLIENT_ID"
echo "NEXT_PUBLIC_AUTH0_CLIENT_SECRET=YOUR_CLIENT_SECRET"
echo "NEXT_PUBLIC_AUTH0_SECRET=$(openssl rand -hex 32)"
echo ""
echo "# Auth0 Configuration - Backend"
echo "AUTH0_DOMAIN=YOUR_AUTH0_DOMAIN"
echo "AUTH0_ISSUER=https://YOUR_AUTH0_DOMAIN/"
echo "AUTH0_ISSUER_BASE_URL=https://YOUR_AUTH0_DOMAIN"
echo "AUTH0_AUDIENCE=https://pcms.live/api"
echo ""

echo "Replace YOUR_AUTH0_DOMAIN with your actual Auth0 domain (e.g., pcms.ca.auth0.com)"
echo "Replace YOUR_CLIENT_ID with your Auth0 application Client ID"
echo "Replace YOUR_CLIENT_SECRET with your Auth0 application Client Secret"
echo ""

read -p "Have you updated your .env file? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please update your .env file before continuing."
    exit 1
fi

echo ""
echo "Step 4: Restart Services"
echo "==================================="
echo ""
echo "To apply the changes, run:"
echo "docker-compose down"
echo "docker-compose up -d --build"
echo ""
echo "Setup complete!"
echo ""
echo "Important Notes:"
echo "- The Auth0 audience MUST be set to: https://pcms.live/api"
echo "- Ensure there are no spaces in your environment variables"
echo "- Check docker logs if you still see authentication errors"
echo ""