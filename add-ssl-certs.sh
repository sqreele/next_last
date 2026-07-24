#!/bin/bash
# 🔐 SSL Certificate Installation Script

set -e

echo "🔐 SSL Certificate Installation for hotelcarepro.com"
echo "============================================="

SSL_DIR="./nginx/ssl"
CONF_DIR="./nginx/conf.d"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo ""
echo "Choose your certificate type:"
echo "1) Cloudflare Origin Certificate"
echo "2) Regular SSL Certificate (from any CA)"
echo ""
read -p "Enter your choice (1 or 2): " choice

case $choice in
    1)
        echo ""
        echo "📋 Cloudflare Origin Certificate Setup:"
        echo "1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server"
        echo "2. Click 'Create Certificate'"
        echo "3. Configure: RSA 2048, hostnames: hotelcarepro.com, www.hotelcarepro.com"
        echo "4. Copy the certificate and private key"
        echo ""
        
        echo "📝 Paste your CERTIFICATE (including -----BEGIN CERTIFICATE----- and -----END CERTIFICATE-----):"
        echo "Press Ctrl+D when done"
        cat > "$SSL_DIR/origin.crt"
        
        echo ""
        echo "📝 Paste your PRIVATE KEY (including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----):"
        echo "Press Ctrl+D when done"
        cat > "$SSL_DIR/origin.key"
        
        # Set proper permissions
        chmod 644 "$SSL_DIR/origin.crt"
        chmod 600 "$SSL_DIR/origin.key"
        
        print_status "Cloudflare Origin certificates saved"
        
        # Enable SSL configuration
        if [ -f "$CONF_DIR/hotelcarepro.com.ssl.conf.disabled" ]; then
            cp "$CONF_DIR/hotelcarepro.com.ssl.conf.disabled" "$CONF_DIR/hotelcarepro.com.ssl.conf"
            print_status "SSL configuration enabled"
        fi
        
        # Disable HTTP-only configuration
        if [ -f "$CONF_DIR/hotelcarepro.com.cloudflare.conf" ]; then
            mv "$CONF_DIR/hotelcarepro.com.cloudflare.conf" "$CONF_DIR/hotelcarepro.com.cloudflare.conf.disabled"
            print_status "HTTP-only configuration disabled"
        fi
        
        echo ""
        print_warning "Remember to set Cloudflare SSL mode to 'Full (strict)'"
        ;;
        
    2)
        echo ""
        echo "📋 Regular SSL Certificate Setup:"
        echo ""
        
        echo "📝 Paste your CERTIFICATE (including -----BEGIN CERTIFICATE----- and -----END CERTIFICATE-----):"
        echo "Press Ctrl+D when done"
        cat > "$SSL_DIR/server.crt"
        
        echo ""
        echo "📝 Paste your PRIVATE KEY (including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----):"
        echo "Press Ctrl+D when done"
        cat > "$SSL_DIR/server.key"
        
        # Set proper permissions
        chmod 644 "$SSL_DIR/server.crt"
        chmod 600 "$SSL_DIR/server.key"
        
        print_status "SSL certificates saved"
        
        # Create custom SSL configuration for regular certificates
        cat > "$CONF_DIR/hotelcarepro.com.ssl.conf" << 'EOF'
# HTTPS server for regular SSL certificates

upstream frontend {
    server nextjs-frontend:3000;
}

upstream backend {
    server django-backend:8000;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name hotelcarepro.com www.hotelcarepro.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name hotelcarepro.com www.hotelcarepro.com;

    # SSL certificates
    ssl_certificate     /etc/nginx/ssl/server.crt;
    ssl_certificate_key /etc/nginx/ssl/server.key;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 10M;

    # Your existing location blocks would go here...
    # Copy from hotelcarepro.com.cloudflare.conf and adjust headers
    
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $server_name;
        proxy_set_header X-Forwarded-Port 443;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /api/v1/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $server_name;
        proxy_set_header X-Forwarded-Port 443;
    }
}
EOF
        
        print_status "Custom SSL configuration created"
        
        # Disable HTTP-only configuration
        if [ -f "$CONF_DIR/hotelcarepro.com.cloudflare.conf" ]; then
            mv "$CONF_DIR/hotelcarepro.com.cloudflare.conf" "$CONF_DIR/hotelcarepro.com.cloudflare.conf.disabled"
            print_status "HTTP-only configuration disabled"
        fi
        ;;
        
    *)
        print_error "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "🧪 Testing nginx configuration..."
if docker compose exec nginx nginx -t; then
    print_status "Nginx configuration test passed"
    
    echo ""
    echo "🔄 Restarting nginx..."
    docker compose restart nginx
    
    echo ""
    print_status "SSL certificates installed successfully!"
    echo ""
    echo "🔗 Test your HTTPS site:"
    echo "   https://hotelcarepro.com"
    echo ""
    echo "🧪 Verify SSL:"
    echo "   openssl s_client -connect hotelcarepro.com:443 -servername hotelcarepro.com"
    echo "   curl -Ik https://hotelcarepro.com"
    
else
    print_error "Nginx configuration test failed!"
    echo "Please check your certificates and try again."
    exit 1
fi
