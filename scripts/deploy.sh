#!/bin/bash
set -e

echo "🚀 Starting deployment process..."

# Pull the latest changes
git pull origin main

# Build images
docker compose -f docker-compose.yml build

# Ensure ACME challenge directory exists (served by nginx, written by certbot)
mkdir -p ./nginx/certbot/.well-known/acme-challenge
chmod -R 755 ./nginx/certbot

# Create dummy cert if missing to allow nginx to start
if [ ! -f ./nginx/letsencrypt/live/pcms.live/fullchain.pem ]; then
	mkdir -p ./nginx/letsencrypt/live/pcms.live
	echo "🔏 Creating temporary self-signed certificate to bootstrap nginx..."
	docker run --rm -v "$(pwd)/nginx/letsencrypt:/etc/letsencrypt" alpine:3.20 sh -c "apk add --no-cache openssl >/dev/null && mkdir -p /etc/letsencrypt/live/pcms.live && openssl req -x509 -nodes -newkey rsa:2048 -days 1 -keyout /etc/letsencrypt/live/pcms.live/privkey.pem -out /etc/letsencrypt/live/pcms.live/fullchain.pem -subj '/CN=pcms.live' && cp /etc/letsencrypt/live/pcms.live/fullchain.pem /etc/letsencrypt/live/pcms.live/chain.pem"
fi

# Start containers
docker compose -f docker-compose.yml up -d

# Always attempt Let's Encrypt issuance once nginx is serving HTTP-01
# If a valid cert already exists, certbot will skip without error

echo "🔐 Attempting Let's Encrypt certificate issuance (pcms.live, www.pcms.live)..."
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
	-d pcms.live -d www.pcms.live \
	--agree-tos -m "${LETSENCRYPT_EMAIL:-admin@pcms.live}" --non-interactive --rsa-key-size 2048 || true

# Reload nginx to pick up new certs (if issued)
docker compose exec nginx nginx -s reload || true

echo "✅ Deployment completed successfully!"
