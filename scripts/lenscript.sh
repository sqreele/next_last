#!/usr/bin/env bash
set -euo pipefail

# Simple Let's Encrypt bootstrap script for pcms.live
# - Creates ACME webroot
# - Generates a temporary self-signed cert if missing so nginx can start
# - Starts docker compose stack
# - Requests real certs with certbot (webroot challenge)
# - Reloads nginx to pick up new certs

DOMAIN="${LE_DOMAIN:-pcms.live}"
ALT_DOMAIN="${LE_DOMAIN_WWW:-www.${DOMAIN}}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@pcms.live}"

LE_DIR="./nginx/letsencrypt"
LIVE_DIR="${LE_DIR}/live/${DOMAIN}"
WEBROOT="./nginx/certbot"

# Optional: set LE_STAGING=1 to use Let's Encrypt staging (avoid rate limits)
CERTBOT_EXTRA_ARGS=()
if [ "${LE_STAGING:-0}" = "1" ]; then
	CERTBOT_EXTRA_ARGS+=(--staging)
fi

printf "\n➡️  Preparing directories...\n"
mkdir -p "${WEBROOT}/.well-known/acme-challenge"
chmod -R 755 "${WEBROOT}"
mkdir -p "${LIVE_DIR}"

# If missing, create a short-lived self-signed cert so nginx can start
if [ ! -f "${LIVE_DIR}/fullchain.pem" ] || [ ! -f "${LIVE_DIR}/privkey.pem" ]; then
	printf "\n🔏 Creating temporary self-signed certificate for %s...\n" "${DOMAIN}"
	docker run --rm \
		-v "$(pwd)/nginx/letsencrypt:/etc/letsencrypt" alpine:3.20 \
		sh -c "apk add --no-cache openssl >/dev/null && \
		mkdir -p /etc/letsencrypt/live/${DOMAIN} && \
		openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
		-keyout /etc/letsencrypt/live/${DOMAIN}/privkey.pem \
		-out /etc/letsencrypt/live/${DOMAIN}/fullchain.pem \
		-subj '/CN=${DOMAIN}' && \
		cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /etc/letsencrypt/live/${DOMAIN}/chain.pem"
fi

printf "\n🚀 Starting containers (this may build images on first run)...\n"
docker compose up -d

printf "\n🔐 Requesting Let's Encrypt certificate for %s, %s...\n" "${DOMAIN}" "${ALT_DOMAIN}"
# Issue/renew certs (idempotent). If cert is valid already, certbot exits successfully and does nothing.
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
	-d "${DOMAIN}" -d "${ALT_DOMAIN}" \
	--agree-tos -m "${EMAIL}" --non-interactive --rsa-key-size 2048 \
	"${CERTBOT_EXTRA_ARGS[@]}" || true

printf "\n🔁 Reloading nginx to pick up any new certificates...\n"
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload || true

printf "\n✅ Done. If you're behind Cloudflare, ensure a page rule or cache bypass for /.well-known/acme-challenge/ during issuance.\n\n"