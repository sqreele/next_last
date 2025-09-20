#!/bin/bash
# 🔐 Update SSL Certificates Script for pcms.live

set -e

echo "🔐 Update SSL Certificates for nginx"
echo "====================================="

SSL_DIR="./nginx/ssl"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
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

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo ""
print_info "Current certificate files:"
ls -la "$SSL_DIR/"

echo ""
print_info "To get your Cloudflare Origin Certificate:"
echo "1. Go to: https://dash.cloudflare.com/"
echo "2. Select your domain: pcms.live"
echo "3. Navigate to: SSL/TLS → Origin Server"
echo "4. Click: Create Certificate"
echo "5. Configure:"
echo "   - Key Type: RSA (2048)"
echo "   - Hostnames: pcms.live, www.pcms.live"
echo "   - Validity: 15 years"
echo "6. Copy both the certificate and private key"

echo ""
echo "Choose how to update certificates:"
echo "1) Paste certificate and key interactively"
echo "2) Edit files manually with nano"
echo "3) Show current certificate content"
echo "4) Test nginx configuration"
echo "5) Restart nginx"
echo ""
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo ""
        print_info "📝 Paste your CERTIFICATE (including -----BEGIN CERTIFICATE----- and -----END CERTIFICATE-----):"
        echo "Press Ctrl+D when done"
        cat > "$SSL_DIR/origin.crt"
        
        echo ""
        print_info "📝 Paste your PRIVATE KEY (including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----):"
        echo "Press Ctrl+D when done"
        cat > "$SSL_DIR/origin.key"
        
        # Set proper permissions
        chmod 644 "$SSL_DIR/origin.crt"
        chmod 600 "$SSL_DIR/origin.key"
        
        print_status "Certificates updated successfully!"
        
        # Test configuration
        echo ""
        print_info "Testing nginx configuration..."
        if docker compose exec nginx nginx -t > /dev/null 2>&1; then
            print_status "Nginx configuration test passed"
            
            echo ""
            read -p "Restart nginx to apply changes? (y/N): " restart
            if [[ $restart =~ ^[Yy]$ ]]; then
                docker compose restart nginx
                print_status "Nginx restarted successfully"
            fi
        else
            print_error "Nginx configuration test failed!"
            echo "Please check your certificates."
        fi
        ;;
        
    2)
        echo ""
        print_info "Opening certificate file for editing..."
        nano "$SSL_DIR/origin.crt"
        
        echo ""
        print_info "Opening private key file for editing..."
        nano "$SSL_DIR/origin.key"
        
        # Set proper permissions
        chmod 644 "$SSL_DIR/origin.crt"
        chmod 600 "$SSL_DIR/origin.key"
        
        print_status "Files edited. Don't forget to test and restart nginx!"
        ;;
        
    3)
        echo ""
        print_info "Current certificate content:"
        echo "--- origin.crt ---"
        cat "$SSL_DIR/origin.crt"
        echo ""
        echo "--- origin.key ---"
        cat "$SSL_DIR/origin.key"
        ;;
        
    4)
        echo ""
        print_info "Testing nginx configuration..."
        docker compose exec nginx nginx -t
        ;;
        
    5)
        echo ""
        print_info "Restarting nginx..."
        docker compose restart nginx
        print_status "Nginx restarted"
        ;;
        
    *)
        print_error "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
print_info "Certificate file locations:"
echo "  Certificate: $SSL_DIR/origin.crt"
echo "  Private Key: $SSL_DIR/origin.key"
echo "  CA Root:     $SSL_DIR/cloudflare_origin_rsa_root.pem"

echo ""
print_info "Nginx SSL configuration:"
echo "  ssl_certificate     /etc/nginx/ssl/origin.crt;"
echo "  ssl_certificate_key /etc/nginx/ssl/origin.key;"

echo ""
print_warning "Remember to:"
echo "1. Set Cloudflare SSL mode to 'Full (strict)'"
echo "2. Enable 'Always Use HTTPS' in Cloudflare"
echo "3. Test your site: https://pcms.live"
