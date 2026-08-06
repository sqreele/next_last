# Central Docker Nginx deployment

The `nginx` Compose service is the only intended public reverse proxy. Its
configuration uses Docker's embedded DNS resolver and variable-based proxy
targets, so a missing or recreated application produces a response-time 502 for
that application rather than preventing Nginx from starting. Do not run the host
systemd Nginx at the same time.

> This repository currently configures `pcms.live`. If the production checkout
> has additional `hotelcarepro.com` or `pickora.hotelcarepro.com` files, apply the
> same variable-based pattern to every service-name `proxy_pass`; do not replace
> or invent those domain, TLS, redirect, caching, or header settings.

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
3. Start Pickora from its own Compose project.
4. Start the central Docker Nginx.

The order improves the first response, but is not required for Nginx process
health. For example:

```bash
cd /root/next_last
docker compose up -d db redis backend frontend
cd /root/pickora
docker compose up -d
cd /root/next_last
docker compose up -d nginx
```

## Pre-deployment validation

```bash
cd /root/next_last
docker compose config
cd /root/pickora
docker compose config

docker run --rm --network pcms_network \
  -v /root/next_last/nginx/conf.d:/etc/nginx/conf.d:ro \
  -v /root/next_last/nginx/cloudflare.conf:/etc/nginx/cloudflare.conf:ro \
  -v /root/next_last/nginx/ssl:/etc/nginx/ssl:ro \
  nginx:stable-alpine nginx -t
```

The syntax check requires the certificate paths referenced by the configuration
to contain deploy-time certificates. It does not publish ports.

After applications are running, verify both stable and retained legacy aliases:

```bash
docker run --rm --network pcms_network alpine sh -c '
getent hosts frontend
getent hosts backend
getent hosts pickora-web
getent hosts nextjs-frontend
getent hosts django-backend
'
```

The Pickora Compose project must attach its web service to both its default
network and external `pcms_network`, with the explicit `pickora-web` alias. This
preserves private access to its analytics API without exposing that API publicly.

## URI and smoke checks

A variable containing only the scheme, host, and port is intentionally used with
no URI suffix. Thus `/api/example` remains `/api/example`, matching the old
no-trailing-slash `proxy_pass` behavior. Validate actual health endpoints:

```bash
curl -I https://hotelcarepro.com
curl -I https://hotelcarepro.com/api/v1/health/
curl -I https://pickora.hotelcarepro.com

docker exec nginx wget -S --spider http://frontend:3000/api/health
docker exec nginx wget -S --spider http://backend:8000/api/v1/health/
docker exec nginx wget -S --spider http://pickora-web:80/health
```

## Manual resilience checks

These commands intentionally interrupt production traffic and must only be run
in an approved maintenance window.

### Pickora unavailable

```bash
docker stop pickora-web
docker restart nginx
docker ps --filter name=nginx
curl -I https://hotelcarepro.com
curl -I https://pickora.hotelcarepro.com
docker start pickora-web
```

Nginx stays Up, HotelCarePro stays available, and Pickora may return 502. Pickora
recovers after the DNS cache (at most approximately 10 seconds) without an Nginx
restart.

### Frontend unavailable

```bash
docker stop nextjs-frontend
docker restart nginx
docker ps --filter name=nginx
curl -I https://pickora.hotelcarepro.com
curl -I https://hotelcarepro.com
docker start nextjs-frontend
```

Nginx and Pickora stay available; the HotelCarePro frontend may return 502 and
then recovers after Docker DNS refresh without restarting Nginx.

### Backend unavailable

```bash
docker stop django-backend
docker restart nginx
docker ps --filter name=nginx
curl -I https://hotelcarepro.com
curl -I https://hotelcarepro.com/api/v1/health/
curl -I https://pickora.hotelcarepro.com
docker start django-backend
```

Nginx, static/frontend routes where possible, and Pickora stay available; API
routes may return 502 and recover after DNS refresh.

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
