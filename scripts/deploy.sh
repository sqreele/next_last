#!/bin/bash
set -eu

echo "🚀 Starting deployment process..."

if [ ! -f .env ]; then
    echo "❌ Production environment file .env was not found."
    exit 1
fi

# Fail before building if required variables or Compose syntax are invalid.
docker compose -f docker-compose.yml config --quiet

# Deploy the selected branch without merging another branch into the checkout.
current_branch=$(git symbolic-ref --quiet --short HEAD) || {
    echo "Deployment requires a branch checkout."
    exit 1
}
deploy_branch="${DEPLOY_BRANCH:-$current_branch}"
if [ "$current_branch" != "$deploy_branch" ]; then
    echo "Check out $deploy_branch before deploying (current: $current_branch)."
    exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
    echo "Commit or stash local changes before deploying."
    exit 1
fi
git pull --ff-only origin "$deploy_branch"

# Build images
docker compose -f docker-compose.yml build

# Check if Cloudflare Origin Certificates exist
if [ ! -f ./nginx/ssl/origin.crt ] || [ ! -f ./nginx/ssl/origin.key ]; then
    echo "❌ Cloudflare Origin Certificates not found!"
    echo "   Please set up Cloudflare SSL certificates before deployment:"
    echo "   1. Follow the guide in CLOUDFLARE_SSL_SETUP.md"
    echo "   2. Run: sudo nginx/ssl/setup_cloudflare_ssl.sh"
    exit 1
fi

# Start containers
docker compose -f docker-compose.yml up -d --wait

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if docker compose exec nginx nginx -t; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration test failed"
    echo "   Check your SSL certificates and nginx config"
    exit 1
fi

echo "✅ Deployment completed successfully!"
echo ""
echo "🔗 Your application should be available at:"
echo "   - HTTP: http://${DOMAIN:-staymaint.com} (redirects to HTTPS)"
echo "   - HTTPS: https://${DOMAIN:-staymaint.com}"
echo ""
echo "📋 Post-deployment checklist:"
echo "   - Verify SSL certificates are working"
echo "   - Check Cloudflare SSL mode is 'Full (strict)'"
echo "   - Test your application functionality"
