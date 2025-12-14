# Docker Firewall Security Guide

## ⚠️ Important: Docker Bypasses UFW

Docker modifies `iptables` directly, which means it can bypass UFW (Uncomplicated Firewall) rules. This can lead to **unintended exposure of services** to the public internet.

## Security Fixes Applied

The following changes were made to `docker-compose.yml` to prevent Docker from bypassing your firewall:

### 1. PostgreSQL (Port 5432) - CRITICAL FIX
```yaml
# BEFORE (INSECURE - Exposed to internet):
ports:
  - "5432:5432"

# AFTER (SECURE - Internal only):
expose:
  - "5432"
```

### 2. Redis (Port 6379) - CRITICAL FIX
```yaml
# BEFORE (INSECURE - Exposed to internet):
ports:
  - "6379:6379"

# AFTER (SECURE - Internal only):
expose:
  - "6379"
```

### 3. Frontend/Next.js (Port 3000) - MEDIUM FIX
```yaml
# BEFORE (Exposed directly, bypassing Nginx):
ports:
  - "3000:3000"

# AFTER (Traffic flows through Nginx only):
expose:
  - "3000"
```

## Understanding `ports` vs `expose`

| Directive | Behavior |
|-----------|----------|
| `ports: "5432:5432"` | Maps container port to **host network** - accessible from outside, bypasses UFW |
| `expose: "5432"` | Only accessible within **Docker network** - respects network isolation |

## Current Architecture (After Fix)

```
Internet
    │
    ▼
┌─────────────────────────────────────┐
│  DigitalOcean Cloud Firewall        │  ← First line of defense
│  (Allow: 80, 443, 22 only)          │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  UFW Firewall                        │  ← Host-level firewall
│  (Allow: 80, 443, 22)               │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Nginx Container (ports 80, 443)    │  ← Only public entry point
└─────────────────────────────────────┘
    │
    ▼ (Docker internal network only)
┌─────────────────────────────────────┐
│  Docker Network (pcms_network)      │
│  ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │Frontend │ │ Backend │ │  DB   │ │
│  │ :3000   │ │ :8000   │ │ :5432 │ │
│  └─────────┘ └─────────┘ └───────┘ │
│                          ┌───────┐ │
│                          │ Redis │ │
│                          │ :6379 │ │
│                          └───────┘ │
└─────────────────────────────────────┘
```

## Additional Recommendations

### 1. Use DigitalOcean Cloud Firewall (Highly Recommended)

The Cloud Firewall operates at the **network level** before traffic reaches your droplet, making it immune to Docker's iptables manipulation.

**Recommended rules:**
- Allow TCP 22 (SSH) from your IP only
- Allow TCP 80 (HTTP) from anywhere
- Allow TCP 443 (HTTPS) from anywhere
- Deny all other inbound traffic

### 2. Alternative: Configure Docker to NOT Modify iptables

Create/edit `/etc/docker/daemon.json`:
```json
{
  "iptables": false
}
```

⚠️ **Warning**: This requires manual iptables configuration for Docker networking. Only use if you're comfortable with iptables.

### 3. Alternative: Bind to localhost Only

If you need to expose a port for local debugging:
```yaml
ports:
  - "127.0.0.1:5432:5432"  # Only accessible from the host
```

### 4. Verify No Exposed Ports

Run this command to check what ports are publicly accessible:
```bash
# Check listening ports
sudo netstat -tlnp | grep -E ':(3000|5432|6379|8000)'

# Or using ss
sudo ss -tlnp | grep -E ':(3000|5432|6379|8000)'

# Check Docker port mappings
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

After the fix, only nginx should show `0.0.0.0:80` and `0.0.0.0:443`.

### 5. Scan for Open Ports (External Check)

From another machine, scan your server:
```bash
nmap -p 22,80,443,3000,5432,6379,8000 your-server-ip
```

Only ports 22, 80, and 443 should be open.

## Accessing Internal Services

### Database Access
```bash
# Via docker exec (recommended)
docker exec -it db psql -U mylubd_user -d mylubd_db

# Or create a temporary tunnel
ssh -L 5432:localhost:5432 user@your-server
# Then connect locally: psql -h localhost -U mylubd_user -d mylubd_db
```

### Redis Access
```bash
docker exec -it redis-cache redis-cli
```

## Deployment After Changes

After making these security fixes, restart your containers:
```bash
docker-compose down
docker-compose up -d
```

Verify the changes:
```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Expected output:
```
NAMES              PORTS
nginx              0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
nextjs-frontend    3000/tcp
django-backend     8000/tcp
db                 5432/tcp
redis-cache        6379/tcp
```

Note: Only nginx should show `0.0.0.0:` prefix (publicly accessible).

## References

- [Docker and iptables](https://docs.docker.com/network/iptables/)
- [DigitalOcean Cloud Firewalls](https://docs.digitalocean.com/products/networking/firewalls/)
- [UFW with Docker](https://github.com/chaifeng/ufw-docker)
