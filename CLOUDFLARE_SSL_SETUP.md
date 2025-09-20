# 🔐 Cloudflare SSL Setup Guide for pcms.live

This guide will help you set up Cloudflare SSL with Origin Certificates for your maintenance management system.

## 🎯 Overview

Your project is already configured to support Cloudflare SSL with:
- ✅ Cloudflare IP ranges configured
- ✅ Real IP detection from Cloudflare
- ✅ Nginx configuration ready for Origin Certificates
- ✅ Automated setup script

## 📋 Prerequisites

1. **Domain**: pcms.live (already configured)
2. **Cloudflare Account**: With pcms.live added as a zone
3. **Docker Environment**: Running with nginx service

## 🚀 Step-by-Step Setup

### Step 1: Create Cloudflare Origin Certificate

1. **Go to Cloudflare Dashboard**
   - Navigate to: `SSL/TLS` → `Origin Server`
   - Click `Create Certificate`

2. **Configure Certificate**
   - **Key Type**: RSA 2048
   - **Hostnames**: 
     - `pcms.live`
     - `www.pcms.live`
   - **Validity**: 15 years (recommended)

3. **Download Certificate Files**
   - **Certificate**: Copy the certificate content
   - **Private Key**: Copy the private key content

### Step 2: Install Certificate Files

1. **Save Certificate**:
   ```bash
   # Create the certificate file
   cat > nginx/ssl/origin.crt << 'EOF'
   -----BEGIN CERTIFICATE-----
   [Paste your certificate content here]
   -----END CERTIFICATE-----
   EOF
   ```

2. **Save Private Key**:
   ```bash
   # Create the private key file
   cat > nginx/ssl/origin.key << 'EOF'
   -----BEGIN PRIVATE KEY-----
   [Paste your private key content here]
   -----END PRIVATE KEY-----
   EOF
   ```

3. **Run Setup Script**:
   ```bash
   sudo nginx/ssl/setup_cloudflare_ssl.sh
   ```

### Step 3: Configure Cloudflare Settings

1. **SSL/TLS Mode**:
   - Go to `SSL/TLS` → `Overview`
   - Set to **"Full (strict)"**

2. **Always Use HTTPS**:
   - Go to `SSL/TLS` → `Edge Certificates`
   - Enable **"Always Use HTTPS"**

3. **HTTP Strict Transport Security (HSTS)**:
   - Enable HSTS with these settings:
     - **Max Age**: 12 months
     - **Include Subdomains**: Yes
     - **Preload**: Yes

4. **Minimum TLS Version**:
   - Set to **TLS 1.2** or higher

### Step 4: Restart Services

```bash
# Restart nginx to load new certificates
docker compose restart nginx

# Check nginx status
docker compose ps nginx
```

## 🧪 Testing Your SSL Setup

### 1. Test SSL Certificate:
```bash
openssl s_client -connect pcms.live:443 -servername pcms.live -showcerts
```

### 2. Test HTTP Headers:
```bash
curl -Ik https://pcms.live
```

### 3. Test SSL Rating:
- Visit: https://www.ssllabs.com/ssltest/analyze.html?d=pcms.live

## 📁 File Structure

```
nginx/
├── ssl/
│   ├── origin.crt                    # Cloudflare Origin Certificate
│   ├── origin.key                    # Private Key (chmod 600)
│   ├── cloudflare_origin_rsa_root.pem # CA Root (auto-downloaded)
│   ├── setup_cloudflare_ssl.sh       # Setup script
│   └── README.txt                    # Documentation
├── cloudflare.conf                   # Cloudflare IP ranges
└── conf.d/
    └── pmcs.site.conf                # Main nginx config
```

## ⚙️ Current Configuration Features

Your nginx configuration already includes:

### ✅ Cloudflare Integration:
- **Real IP Detection**: Gets actual visitor IPs from Cloudflare
- **IP Ranges**: All current Cloudflare IP ranges configured
- **Headers**: Proper forwarding of Cloudflare headers

### ✅ Security Headers:
- **HSTS**: HTTP Strict Transport Security
- **CSP**: Content Security Policy
- **XSS Protection**: Cross-site scripting protection
- **Frame Options**: Clickjacking protection

### ✅ Performance:
- **HTTP/2**: Enabled for faster loading
- **Gzip Compression**: Reduces bandwidth usage
- **Caching**: Proper cache headers for static assets

## 🔧 Troubleshooting

### Certificate Issues:
```bash
# Check certificate validity
openssl x509 -in nginx/ssl/origin.crt -text -noout

# Check private key
openssl rsa -in nginx/ssl/origin.key -check

# Verify certificate and key match
openssl x509 -noout -modulus -in nginx/ssl/origin.crt | openssl md5
openssl rsa -noout -modulus -in nginx/ssl/origin.key | openssl md5
```

### Nginx Issues:
```bash
# Test configuration
docker compose exec nginx nginx -t

# Check nginx logs
docker compose logs nginx

# Restart nginx
docker compose restart nginx
```

### Cloudflare Issues:
- Ensure SSL mode is "Full (strict)"
- Check that your domain is active in Cloudflare
- Verify DNS records are pointing to Cloudflare

## 🎯 Expected Results

After successful setup:

1. **HTTPS**: https://pcms.live loads with valid SSL
2. **Security**: A+ rating on SSL Labs
3. **Performance**: Fast loading with HTTP/2
4. **Headers**: All security headers present
5. **Cloudflare**: Real visitor IPs logged correctly

## 📞 Support

If you encounter issues:
1. Run the setup script for diagnostics
2. Check nginx logs: `docker compose logs nginx`
3. Verify Cloudflare settings match this guide
4. Test certificates with the provided commands

---

🔐 **Security Note**: Keep your `origin.key` file secure and never share it. The certificate is public, but the private key must remain confidential.
