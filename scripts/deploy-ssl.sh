#!/bin/bash
# 🔐 Cloudflare SSL Production Deployment Script
# This script switches your nginx configuration to use Cloudflare SSL certificates

set -e

echo "🔐 Deploying Cloudflare SSL Configuration for pcms.live"
echo "======================================================="

# Configuration paths
NGINX_CONF_DIR="./nginx/conf.d"
SSL_DIR="./nginx/ssl"
PROD_CONF="pmcs.site.conf.production"
DEV_CONF="pmcs.site.dev.conf"
CURRENT_CONF="pmcs.site.conf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if running in the correct directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run this script from the project root."
    exit 1
fi

print_info "Checking Cloudflare SSL certificates..."

# Check if SSL certificates exist
if [ ! -f "$SSL_DIR/origin.crt" ]; then
    print_error "Missing Cloudflare Origin Certificate: $SSL_DIR/origin.crt"
    echo ""
    echo "📋 To create Cloudflare Origin Certificates:"
    echo "1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server"
    echo "2. Click 'Create Certificate'"
    echo "3. Select RSA 2048, add hostnames: pcms.live, www.pcms.live"
    echo "4. Save certificate as: $SSL_DIR/origin.crt"
    echo "5. Save private key as: $SSL_DIR/origin.key"
    echo "6. Run: sudo $SSL_DIR/setup_cloudflare_ssl.sh"
    exit 1
fi

if [ ! -f "$SSL_DIR/origin.key" ]; then
    print_error "Missing Cloudflare Origin Private Key: $SSL_DIR/origin.key"
    exit 1
fi

print_status "SSL certificates found"

# Check if production configuration exists
if [ ! -f "$NGINX_CONF_DIR/$PROD_CONF" ]; then
    print_error "Production configuration not found: $NGINX_CONF_DIR/$PROD_CONF"
    exit 1
fi

print_status "Production configuration found"

# Backup current configuration if it exists
if [ -f "$NGINX_CONF_DIR/$CURRENT_CONF" ]; then
    print_info "Backing up current configuration..."
    cp "$NGINX_CONF_DIR/$CURRENT_CONF" "$NGINX_CONF_DIR/${CURRENT_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
    print_status "Current configuration backed up"
fi

# Switch to production configuration
print_info "Switching to production SSL configuration..."
cp "$NGINX_CONF_DIR/$PROD_CONF" "$NGINX_CONF_DIR/$CURRENT_CONF"
print_status "Production configuration activated"

# Test nginx configuration
print_info "Testing nginx configuration..."
if docker compose exec nginx nginx -t > /dev/null 2>&1; then
    print_status "Nginx configuration test passed"
else
    print_error "Nginx configuration test failed"
    print_info "Reverting to previous configuration..."
    
    # Try to restore backup
    BACKUP_FILE=$(ls -t "$NGINX_CONF_DIR/${CURRENT_CONF}.backup."* 2>/dev/null | head -1)
    if [ -n "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$NGINX_CONF_DIR/$CURRENT_CONF"
        print_warning "Reverted to backup configuration"
    else
        # Fall back to dev configuration
        if [ -f "$NGINX_CONF_DIR/$DEV_CONF" ]; then
            cp "$NGINX_CONF_DIR/$DEV_CONF" "$NGINX_CONF_DIR/$CURRENT_CONF"
            print_warning "Reverted to development configuration"
        fi
    fi
    
    exit 1
fi

# Restart nginx to apply changes
print_info "Restarting nginx with SSL configuration..."
docker compose restart nginx

# Wait for nginx to start
sleep 3

# Check if nginx is running
if docker compose ps nginx | grep -q "Up"; then
    print_status "Nginx restarted successfully with SSL"
else
    print_error "Nginx failed to start"
    docker compose logs nginx --tail=20
    exit 1
fi

# Test SSL connection
print_info "Testing SSL connection..."
if timeout 10 openssl s_client -connect pcms.live:443 -servername pcms.live </dev/null >/dev/null 2>&1; then
    print_status "SSL connection test passed"
else
    print_warning "SSL connection test failed (this might be normal if DNS isn't pointing to your server yet)"
fi

echo ""
echo "🎉 Cloudflare SSL deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Ensure your domain DNS is pointing to Cloudflare"
echo "2. Set Cloudflare SSL mode to 'Full (strict)'"
echo "3. Enable 'Always Use HTTPS' in Cloudflare"
echo "4. Test your site: https://pcms.live"
echo ""
echo "🔗 Useful commands:"
echo "   Check SSL: openssl s_client -connect pcms.live:443 -servername pcms.live"
echo "   Test site: curl -Ik https://pcms.live"
echo "   View logs: docker compose logs nginx"
echo ""
