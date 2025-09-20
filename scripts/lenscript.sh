#!/usr/bin/env bash
set -euo pipefail

# Cloudflare SSL deployment script for pcms.live
# This script deploys the application with Cloudflare Origin Certificates

DOMAIN="${DOMAIN:-pcms.live}"

printf "\n🚀 Starting Cloudflare SSL deployment for %s...\n" "${DOMAIN}"

# Check if Cloudflare Origin Certificates exist
if [ ! -f "./nginx/ssl/origin.crt" ] || [ ! -f "./nginx/ssl/origin.key" ]; then
    printf "\n❌ Cloudflare Origin Certificates not found!\n"
    printf "   Please set up certificates first:\n"
    printf "   1. Follow CLOUDFLARE_SSL_SETUP.md\n"
    printf "   2. Run: sudo nginx/ssl/setup_cloudflare_ssl.sh\n\n"
    exit 1
fi

printf "\n✅ Cloudflare Origin Certificates found\n"

printf "\n🔨 Building and starting containers...\n"
docker compose up -d

printf "\n🧪 Testing nginx configuration...\n"
if docker compose exec nginx nginx -t; then
    printf "✅ Nginx configuration is valid\n"
else
    printf "❌ Nginx configuration test failed\n"
    exit 1
fi

printf "\n🔁 Reloading nginx...\n"
docker compose exec nginx nginx -s reload || true

printf "\n✅ Cloudflare SSL deployment completed successfully!\n"
printf "\n🔗 Your application is available at:\n"
printf "   - https://%s\n" "${DOMAIN}"
printf "   - https://www.%s\n" "${DOMAIN}"
printf "\n📋 Make sure Cloudflare settings are:\n"
printf "   - SSL Mode: Full (strict)\n"
printf "   - Always Use HTTPS: Enabled\n"
printf "   - HSTS: Enabled\n\n"