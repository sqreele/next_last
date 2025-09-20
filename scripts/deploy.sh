#!/bin/bash
set -e

echo "🚀 Starting deployment process..."

# Pull the latest changes
git pull origin main

# Build images
docker compose -f docker-compose.yml build

# Check if Cloudflare Origin Certificates exist
if [ ! -f ./nginx/ssl/origin.crt ] || [ ! -f ./nginx/ssl/origin.key ]; then
    echo "⚠️  Cloudflare Origin Certificates not found!"
    echo "   Please set up Cloudflare SSL certificates before deployment:"
    echo "   1. Follow the guide in CLOUDFLARE_SSL_SETUP.md"
    echo "   2. Run: sudo nginx/ssl/setup_cloudflare_ssl.sh"
    echo ""
    echo "   Continuing deployment anyway..."
fi

# Start containers
docker compose -f docker-compose.yml up -d

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if docker compose exec nginx nginx -t; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration test failed"
    echo "   Check your SSL certificates and nginx config"
fi

echo "✅ Deployment completed successfully!"
echo ""
echo "🔗 Your application should be available at:"
echo "   - HTTP: http://pcms.live (redirects to HTTPS)"
echo "   - HTTPS: https://pcms.live"
echo ""
echo "📋 Post-deployment checklist:"
echo "   - Verify SSL certificates are working"
echo "   - Check Cloudflare SSL mode is 'Full (strict)'"
echo "   - Test your application functionality"
