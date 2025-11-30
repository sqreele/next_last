# OWASP ZAP (Zed Attack Proxy) Usage Guide

## 📋 Table of Contents
1. [What is OWASP ZAP?](#what-is-owasp-zap)
2. [Installation](#installation)
3. [Basic Usage](#basic-usage)
4. [Testing Your Application](#testing-your-application)
5. [Docker Integration](#docker-integration)
6. [CI/CD Integration](#cicd-integration)
7. [Best Practices](#best-practices)

---

## What is OWASP ZAP?

OWASP ZAP (Zed Attack Proxy) is a free, open-source security testing tool used to find vulnerabilities in web applications. It acts as a "man-in-the-middle" proxy between your browser and the web application.

**Key Features:**
- Automated vulnerability scanning
- Manual security testing
- API security testing
- CI/CD integration
- Active and passive scanning

---

## Installation

### Option 1: Docker (Recommended)

```bash
# Pull the official ZAP Docker image from GitHub Container Registry
docker pull ghcr.io/zaproxy/zaproxy:stable

# Or use the weekly release (more features)
docker pull ghcr.io/zaproxy/zaproxy:weekly

# Or use the latest release
docker pull ghcr.io/zaproxy/zaproxy:latest
```

**Note:** OWASP ZAP Docker images have moved from Docker Hub to GitHub Container Registry (GHCR).

### Option 2: Desktop Application

**Linux:**
```bash
# Download from https://www.zaproxy.org/download/
# Or install via snap
sudo snap install zaproxy --classic
```

**Windows/Mac:**
- Download installer from: https://www.zaproxy.org/download/
- Follow installation wizard

### Option 3: Command Line (for CI/CD)

```bash
# Using Docker (most common for automation)
docker pull owasp/zap2docker-stable
```

---

## Basic Usage

### 1. Quick Start with Docker

```bash
# Start ZAP in daemon mode (headless, for automation)
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://localhost:8000

# Start ZAP with UI (for manual testing)
docker run -u zap -p 8080:8080 -p 8090:8090 \
  -it ghcr.io/zaproxy/zaproxy:stable zap-webswing.sh
```

Then access ZAP UI at: `http://localhost:8080`

### 2. Desktop Application Usage

1. **Launch ZAP Desktop**
2. **Configure Browser Proxy:**
   - ZAP runs on `localhost:8080` by default
   - Configure your browser to use proxy: `127.0.0.1:8080`
   - Or use ZAP's built-in browser (HUD mode)

3. **Start Testing:**
   - Navigate to your application
   - ZAP will automatically intercept and analyze traffic

---

## Testing Your Application

### For Your Django Backend (http://localhost:8000)

#### Quick Baseline Scan

```bash
# Basic scan
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://localhost:8000 \
  -J zap-report.json \
  -r zap-report.html

# Scan with authentication (if needed)
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://localhost:8000 \
  -I \
  -J zap-report.json \
  -r zap-report.html \
  -z "auth.loginurl=http://localhost:8000/api/auth/login \
      auth.username=testuser \
      auth.password=testpass"
```

#### Full Scan (More Comprehensive)

```bash
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-full-scan.py \
  -t http://localhost:8000 \
  -J zap-report.json \
  -r zap-report.html
```

### For Your Next.js Frontend (http://localhost:3000)

```bash
# Scan frontend
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://localhost:3000 \
  -J frontend-report.json \
  -r frontend-report.html
```

### Testing Production/Staging (pcms.live)

```bash
# Scan production site (be careful - use read-only mode)
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t https://pcms.live \
  -J production-report.json \
  -r production-report.html \
  -I  # Include info level issues
```

**⚠️ Warning:** Only scan sites you own or have permission to test!

---

## Docker Integration

### Create a ZAP Testing Script

Create `scripts/zap-scan.sh`:

```bash
#!/bin/bash

# OWASP ZAP Security Scan Script
# Usage: ./scripts/zap-scan.sh [target-url] [report-name]

TARGET_URL=${1:-http://localhost:8000}
REPORT_NAME=${2:-zap-report}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🔍 Starting OWASP ZAP scan for: $TARGET_URL"
echo "📊 Report will be saved as: ${REPORT_NAME}_${TIMESTAMP}.html"

docker run -t --rm \
  -v $(pwd)/reports:/zap/wrk/:rw \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t "$TARGET_URL" \
  -J "/zap/wrk/${REPORT_NAME}_${TIMESTAMP}.json" \
  -r "/zap/wrk/${REPORT_NAME}_${TIMESTAMP}.html" \
  -I \
  -g gen.conf

echo "✅ Scan complete! Check reports/${REPORT_NAME}_${TIMESTAMP}.html"
```

Make it executable:
```bash
chmod +x scripts/zap-scan.sh
```

### Usage:

```bash
# Scan backend
./scripts/zap-scan.sh http://localhost:8000 backend-scan

# Scan frontend
./scripts/zap-scan.sh http://localhost:3000 frontend-scan

# Scan production (if you have permission)
./scripts/zap-scan.sh https://pcms.live production-scan
```

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/zap-scan.yml`:

```yaml
name: OWASP ZAP Security Scan

on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM
  workflow_dispatch:  # Manual trigger
  push:
    branches: [ main, develop ]

jobs:
  zap_scan:
    runs-on: ubuntu-latest
    name: ZAP Security Scan
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Start application
        run: |
          docker compose up -d
          sleep 30  # Wait for app to be ready
      
      - name: Run ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.10.0
        with:
          target: 'http://localhost:8000'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a'
      
      - name: Upload ZAP results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: zap-results
          path: |
            report_html.html
            report_json.json
```

### GitLab CI Example

Create `.gitlab-ci.yml` section:

```yaml
zap_scan:
  image: owasp/zap2docker-stable
  script:
    - zap-baseline.py -t http://localhost:8000 -J zap-report.json -r zap-report.html
  artifacts:
    when: always
    paths:
      - zap-report.html
      - zap-report.json
    reports:
      sast: zap-report.json
```

---

## Advanced Usage

### Custom Policy Scan

```bash
# Create custom policy
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-cli quick-scan \
  --self-contained \
  --start-options '-config api.disablekey=true' \
  http://localhost:8000
```

### API Testing

For your Django REST Framework APIs:

```bash
# Scan API endpoints
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://localhost:8000/api \
  -J api-report.json \
  -r api-report.html \
  -z "api.format=openapi,api.spec=http://localhost:8000/api/schema/"
```

### Authenticated Scans

```bash
# With session-based auth
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://localhost:8000 \
  -z "auth.loginurl=http://localhost:8000/api/auth/login \
      auth.username=admin \
      auth.password=yourpassword \
      auth.usernamefield=username \
      auth.passwordfield=password"
```

---

## Best Practices

### 1. **Regular Scanning**
- Run scans weekly or before releases
- Include in CI/CD pipeline
- Scan both development and staging environments

### 2. **Review Reports**
- Don't ignore warnings - review all findings
- Prioritize High and Medium severity issues
- False positives are common - verify manually

### 3. **Test Coverage**
- Scan all major endpoints
- Test authenticated and unauthenticated paths
- Include API endpoints separately

### 4. **Environment Safety**
- Never scan production without permission
- Use read-only scans when possible
- Set appropriate scan intensity

### 5. **Integration with Your Stack**

**For Django:**
```bash
# Test CSRF protection
# Test authentication endpoints
# Test API security headers
```

**For Next.js:**
```bash
# Test XSS vulnerabilities
# Test CSP headers
# Test authentication flows
```

---

## Common Vulnerabilities to Check

Based on your project structure, pay attention to:

1. **Authentication & Authorization**
   - Property access control (you have this implemented)
   - Session management
   - JWT token security

2. **API Security**
   - Rate limiting
   - Input validation
   - SQL injection (Django ORM helps, but verify)

3. **Headers & Configuration**
   - CORS settings
   - Security headers (HSTS, CSP, etc.)
   - SSL/TLS configuration

4. **XSS Protection**
   - React auto-escaping (verify)
   - Input sanitization
   - Content Security Policy

---

## Report Interpretation

### Severity Levels:
- **High**: Critical security issues (fix immediately)
- **Medium**: Important security issues (fix soon)
- **Low**: Minor issues (fix when possible)
- **Info**: Informational (review for best practices)

### Common False Positives:
- Missing security headers (if handled by reverse proxy)
- Cookie flags (if set by application server)
- Cache control headers

---

## Troubleshooting

### ZAP can't connect to target:
```bash
# Check if application is running
curl http://localhost:8000

# Check firewall settings
# Ensure ZAP proxy is configured correctly
```

### Authentication issues:
- Verify credentials
- Check if CSRF tokens are required
- Use session-based auth instead of JWT if needed

### Slow scans:
- Reduce scan intensity: `-m 5` (minutes)
- Use baseline scan instead of full scan
- Scan specific endpoints only

---

## Resources

- **Official Docs**: https://www.zaproxy.org/docs/
- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **ZAP API**: https://www.zaproxy.org/docs/api/
- **GitHub Container Registry**: https://github.com/zaproxy/zaproxy/pkgs/container/zaproxy

---

## Quick Reference Commands

```bash
# Quick baseline scan
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t <URL>

# Full scan
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-full-scan.py -t <URL>

# With custom report
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t <URL> -r report.html -J report.json

# Authenticated scan
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t <URL> -z "auth.loginurl=<LOGIN_URL> auth.username=<USER> auth.password=<PASS>"
```

---

**Last Updated**: 2025-01-XX  
**Project**: next_last (Django + Next.js)

