# 🔄 SSL Certificate Update Guide

This guide shows you how to update your Cloudflare Origin Certificates safely.

## 🎯 Quick Update Process

### Method 1: Using the Update Script (Recommended)

1. **Get new certificates from Cloudflare:**
   ```bash
   # Go to: Cloudflare Dashboard → SSL/TLS → Origin Server
   # Click "Create Certificate" or renew existing one
   # Download both certificate and private key
   ```

2. **Place new certificate files:**
   ```bash
   # Save new certificate as:
   nano nginx/ssl/origin.crt.new
   
   # Save new private key as:
   nano nginx/ssl/origin.key.new
   ```

3. **Run the update script:**
   ```bash
   ./scripts/update-ssl-certificates.sh
   ```

The script will automatically:
- ✅ Backup your current certificates
- ✅ Validate the new certificates
- ✅ Test nginx configuration
- ✅ Restart nginx safely
- ✅ Rollback if anything fails

### Method 2: Manual Update

1. **Backup current certificates:**
   ```bash
   mkdir -p nginx/ssl/backups/$(date +%Y%m%d_%H%M%S)
   cp nginx/ssl/origin.* nginx/ssl/backups/$(date +%Y%m%d_%H%M%S)/
   ```

2. **Replace certificate files:**
   ```bash
   # Replace with your new certificate
   nano nginx/ssl/origin.crt
   
   # Replace with your new private key
   nano nginx/ssl/origin.key
   ```

3. **Set proper permissions:**
   ```bash
   chmod 644 nginx/ssl/origin.crt
   chmod 600 nginx/ssl/origin.key
   ```

4. **Test and restart:**
   ```bash
   # Test nginx configuration
   docker compose exec nginx nginx -t
   
   # Restart nginx
   docker compose restart nginx
   ```

## 🔍 Certificate Validation

### Check certificate details:
```bash
openssl x509 -in nginx/ssl/origin.crt -text -noout | grep -E "(Subject:|DNS:|Not Before|Not After)"
```

### Verify certificate and key match:
```bash
openssl x509 -noout -modulus -in nginx/ssl/origin.crt | openssl md5
openssl rsa -noout -modulus -in nginx/ssl/origin.key | openssl md5
# These should output the same hash
```

### Test SSL connection:
```bash
openssl s_client -connect pcms.live:443 -servername pcms.live
```

## 🚨 Troubleshooting

### If nginx fails to start:

1. **Check nginx logs:**
   ```bash
   docker compose logs nginx
   ```

2. **Test configuration:**
   ```bash
   docker compose exec nginx nginx -t
   ```

3. **Restore from backup:**
   ```bash
   ./scripts/update-ssl-certificates.sh restore <backup_timestamp>
   ```

### If SSL test fails:

1. **Check certificate expiry:**
   ```bash
   openssl x509 -in nginx/ssl/origin.crt -noout -dates
   ```

2. **Verify Cloudflare settings:**
   - SSL mode: **Full (strict)**
   - Certificate status: **Active**

## 📅 Certificate Renewal Schedule

Cloudflare Origin Certificates are valid for up to **15 years**, but it's recommended to:

- **Check expiry:** Every 6 months
- **Renew:** 30 days before expiration
- **Test:** After every renewal

### Set up a reminder:
```bash
# Add to crontab for monthly check
crontab -e

# Add this line to check on the 1st of every month
0 0 1 * * /path/to/your/project/scripts/update-ssl-certificates.sh list-backups
```

## 🔧 Script Commands

### Available commands:
```bash
# Update certificates (place .new files first)
./scripts/update-ssl-certificates.sh

# List available backups
./scripts/update-ssl-certificates.sh list-backups

# Restore from specific backup
./scripts/update-ssl-certificates.sh restore <timestamp>

# Show help
./scripts/update-ssl-certificates.sh help
```

## ⚡ Quick Reference

### File locations:
- **Certificate:** `nginx/ssl/origin.crt`
- **Private Key:** `nginx/ssl/origin.key` 
- **CA Root:** `nginx/ssl/cloudflare_origin_rsa_root.pem`
- **Backups:** `nginx/ssl/backups/`

### Cloudflare Dashboard:
1. **Login:** [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Navigate:** SSL/TLS → Origin Server
3. **Action:** Create Certificate
4. **Settings:** RSA 2048, pcms.live + www.pcms.live

### Emergency restore:
```bash
# If everything breaks, restore the latest backup
LATEST=$(ls -t nginx/ssl/backups/ | head -1)
./scripts/update-ssl-certificates.sh restore $LATEST
```

---

💡 **Pro Tip:** Always test certificate updates in a staging environment first if possible!
