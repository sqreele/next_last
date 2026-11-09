# Central Docker Nginx deployment

The `nginx` Compose service is the only intended public reverse proxy. Its
configuration uses Docker's embedded DNS resolver and variable-based proxy
targets, so a missing or recreated application produces a response-time 502 for
that application rather than preventing Nginx from starting. Do not run the host
systemd Nginx at the same time.

> This repository serves `staymaint.com`. The retired `hotelcarepro.com` origin
> is retained only to redirect legacy traffic to the canonical StayMaint domain.

## First deployment

Run these commands manually on the deployment host. The network command is
idempotent and must not be replaced with network removal/recreation when running
containers are attached.

```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
sudo systemctl mask nginx

systemctl is-active nginx
systemctl is-enabled nginx
sudo ss -ltnp | grep -E ':80 |:443 ' || true

docker network inspect pcms_network >/dev/null 2>&1 || \
  docker network create pcms_network
```

Before Docker Nginx starts, the expected state is: host Nginx `inactive`, host
Nginx `masked`, and host ports 80 and 443 free. Preferred initial order:

1. Create or verify `pcms_network`.
2. Start database, Redis, backend, and frontend.
3. Start the central Docker Nginx.

The order improves the first response, but is not required for Nginx process
health. For example:

```bash
cd /root/next_last
docker compose up -d db redis backend frontend
docker compose up -d nginx
```

## Pre-deployment validation

```bash
cd /root/next_last
docker compose config

docker run --rm --network pcms_network \
  -v /root/next_last/nginx/conf.d:/etc/nginx/conf.d:ro \
  -v /root/next_last/nginx/cloudflare.conf:/etc/nginx/cloudflare.conf:ro \
  -v /root/next_last/nginx/ssl:/etc/nginx/ssl:ro \
  nginx:stable-alpine nginx -t
```

The syntax check requires the certificate paths referenced by the configuration
to contain deploy-time certificates. It does not publish ports.

After applications are running, verify the application aliases:

```bash
docker run --rm --network pcms_network alpine sh -c '
getent hosts frontend
getent hosts backend
getent hosts nextjs-frontend
getent hosts django-backend
'
```

## URI and smoke checks

A variable containing only the scheme, host, and port is intentionally used with
no URI suffix. Thus `/api/example` remains `/api/example`, matching the old
no-trailing-slash `proxy_pass` behavior. Validate actual health endpoints:

```bash
curl -I https://staymaint.com
curl -I https://staymaint.com/api/v1/health/
curl -I https://hotelcarepro.com

docker exec nginx wget -S --spider http://frontend:3000/api/health
docker exec nginx wget -S --spider http://backend:8000/api/v1/health/
```

## Manual resilience checks

These commands intentionally interrupt production traffic and must only be run
in an approved maintenance window.

### Frontend unavailable

```bash
docker stop nextjs-frontend
docker restart nginx
docker ps --filter name=nginx
curl -I https://staymaint.com
docker start nextjs-frontend
```

Nginx stays available; the StayMaint frontend may return 502 and then recovers
after Docker DNS refresh without restarting Nginx.

### Backend unavailable

```bash
docker stop django-backend
docker restart nginx
docker ps --filter name=nginx
curl -I https://staymaint.com
curl -I https://staymaint.com/api/v1/health/
docker start django-backend
```

Nginx and static/frontend routes where possible stay available; API routes may
return 502 and recover after Docker DNS refresh.

## Transactional email with Resend SMTP

Invitation emails and scheduled email summaries use the existing Django SMTP
transport. Verify a sending domain in Resend before configuring the deployment.
See https://resend.com/docs/send-with-smtp for the provider settings.

Set these values in the deployment host's untracked `.env` file. Replace the
password placeholder with a Resend API key and use a sender on the verified
domain. Never commit the API key or `.env` file.

```dotenv
MAILERSEND_API_TOKEN=
EMAIL_HOST=smtp.resend.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_HOST_USER=resend
EMAIL_HOST_PASSWORD=YOUR_RESEND_API_KEY
EMAIL_REQUIRE_AUTH=True
DEFAULT_FROM_EMAIL=notifications@staymaint.com
SERVER_EMAIL=notifications@staymaint.com
```

Leave `MAILERSEND_API_TOKEN` empty so delivery goes directly to SMTP. If
`CONTACT_FROM_EMAIL` is configured separately, it must also use a verified
sending domain.

Apply the environment changes by recreating the backend container; this briefly
interrupts backend requests:

```bash
docker compose up -d --no-deps --force-recreate backend
```

Test SMTP connectivity and authentication without sending an email:

```bash
docker compose exec -T backend python manage.py shell -c 'from django.core.mail import get_connection; connection = get_connection(timeout=15); connection.open(); print("SMTP connection and authentication succeeded"); connection.close()'
```

Then resend an invitation from `/dashboard/settings/users/` and inspect its
status in Resend's Emails dashboard. A successful SMTP submission means the
provider accepted the message; check delivery events to confirm receipt by the
recipient's mail server.

## Rollback

To roll back only repository changes, check out the previous known-good revision
and recreate the Compose services according to the normal release process. Do
not delete `pcms_network` while containers use it.

If intentionally abandoning Docker Nginx and returning public ports to the host
service, first stop Docker Nginx, then manually run:

```bash
cd /root/next_last
docker compose stop nginx
sudo systemctl unmask nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

Never start host Nginx while Docker Nginx owns ports 80/443.
