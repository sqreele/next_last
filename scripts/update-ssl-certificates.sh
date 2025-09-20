#!/bin/bash
# 🔄 Cloudflare SSL Certificate Update Script
# This script helps you update Cloudflare Origin Certificates safely

set -e

echo "🔄 Updating Cloudflare SSL Certificates for pcms.live"
echo "===================================================="

# Configuration paths
SSL_DIR="./nginx/ssl"
BACKUP_DIR="$SSL_DIR/backups"
CERT_FILE="$SSL_DIR/origin.crt"
KEY_FILE="$SSL_DIR/origin.key"
CA_FILE="$SSL_DIR/cloudflare_origin_rsa_root.pem"

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

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to backup current certificates
backup_certificates() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_subdir="$BACKUP_DIR/$timestamp"
    
    print_info "Creating backup of current certificates..."
    mkdir -p "$backup_subdir"
    
    if [ -f "$CERT_FILE" ]; then
        cp "$CERT_FILE" "$backup_subdir/origin.crt"
        print_status "Certificate backed up"
    fi
    
    if [ -f "$KEY_FILE" ]; then
        cp "$KEY_FILE" "$backup_subdir/origin.key"
        print_status "Private key backed up"
    fi
    
    if [ -f "$CA_FILE" ]; then
        cp "$CA_FILE" "$backup_subdir/cloudflare_origin_rsa_root.pem"
        print_status "CA root backed up"
    fi
    
    echo "backup_timestamp=$timestamp" > "$backup_subdir/info.txt"
    print_status "Backup created at: $backup_subdir"
}

# Function to validate certificate files
validate_certificates() {
    print_info "Validating new certificate files..."
    
    # Check if certificate is valid
    if ! openssl x509 -in "$CERT_FILE" -text -noout > /dev/null 2>&1; then
        print_error "Invalid certificate file: $CERT_FILE"
        return 1
    fi
    
    # Check if private key is valid
    if ! openssl rsa -in "$KEY_FILE" -check > /dev/null 2>&1; then
        print_error "Invalid private key file: $KEY_FILE"
        return 1
    fi
    
    # Check if certificate and key match
    local cert_hash=$(openssl x509 -noout -modulus -in "$CERT_FILE" | openssl md5)
    local key_hash=$(openssl rsa -noout -modulus -in "$KEY_FILE" | openssl md5)
    
    if [ "$cert_hash" != "$key_hash" ]; then
        print_error "Certificate and private key do not match"
        return 1
    fi
    
    print_status "Certificate validation passed"
    
    # Show certificate details
    print_info "Certificate details:"
    openssl x509 -in "$CERT_FILE" -text -noout | grep -E "(Subject:|DNS:|Not Before|Not After)" | sed 's/^/  /'
    
    return 0
}

# Function to set proper permissions
set_permissions() {
    print_info "Setting proper file permissions..."
    
    # Certificate (public) - readable
    chmod 644 "$CERT_FILE"
    
    # Private key (secret) - readable only by owner
    chmod 600 "$KEY_FILE"
    
    # CA root (public) - readable
    if [ -f "$CA_FILE" ]; then
        chmod 644 "$CA_FILE"
    fi
    
    print_status "File permissions set correctly"
}

# Function to test nginx configuration
test_nginx_config() {
    print_info "Testing nginx configuration with new certificates..."
    
    if docker compose exec nginx nginx -t > /dev/null 2>&1; then
        print_status "Nginx configuration test passed"
        return 0
    else
        print_error "Nginx configuration test failed"
        print_info "Check nginx logs: docker compose logs nginx"
        return 1
    fi
}

# Function to restart nginx
restart_nginx() {
    print_info "Restarting nginx to load new certificates..."
    
    docker compose restart nginx
    
    # Wait for nginx to start
    sleep 3
    
    # Check if nginx is running
    if docker compose ps nginx | grep -q "Up"; then
        print_status "Nginx restarted successfully"
        return 0
    else
        print_error "Nginx failed to start"
        docker compose logs nginx --tail=20
        return 1
    fi
}

# Function to restore from backup
restore_from_backup() {
    local backup_timestamp=$1
    local backup_subdir="$BACKUP_DIR/$backup_timestamp"
    
    if [ ! -d "$backup_subdir" ]; then
        print_error "Backup directory not found: $backup_subdir"
        return 1
    fi
    
    print_warning "Restoring certificates from backup: $backup_timestamp"
    
    if [ -f "$backup_subdir/origin.crt" ]; then
        cp "$backup_subdir/origin.crt" "$CERT_FILE"
    fi
    
    if [ -f "$backup_subdir/origin.key" ]; then
        cp "$backup_subdir/origin.key" "$KEY_FILE"
    fi
    
    if [ -f "$backup_subdir/cloudflare_origin_rsa_root.pem" ]; then
        cp "$backup_subdir/cloudflare_origin_rsa_root.pem" "$CA_FILE"
    fi
    
    set_permissions
    print_status "Certificates restored from backup"
}

# Main update process
main() {
    echo ""
    print_info "Starting certificate update process..."
    
    # Check if new certificate files are provided
    if [ ! -f "$CERT_FILE.new" ] && [ ! -f "$KEY_FILE.new" ]; then
        print_info "No new certificate files found (.new extension)"
        echo ""
        echo "📋 To update certificates:"
        echo "1. Download new certificates from Cloudflare Dashboard"
        echo "2. Save certificate as: $CERT_FILE.new"
        echo "3. Save private key as: $KEY_FILE.new"
        echo "4. Run this script again"
        echo ""
        echo "🔗 Cloudflare Dashboard:"
        echo "   SSL/TLS → Origin Server → Create Certificate"
        echo "   Hostnames: pcms.live, www.pcms.live"
        echo ""
        exit 0
    fi
    
    # Backup current certificates
    backup_certificates
    
    # Move new certificates to active location
    if [ -f "$CERT_FILE.new" ]; then
        mv "$CERT_FILE.new" "$CERT_FILE"
        print_status "New certificate installed"
    fi
    
    if [ -f "$KEY_FILE.new" ]; then
        mv "$KEY_FILE.new" "$KEY_FILE"
        print_status "New private key installed"
    fi
    
    # Set proper permissions
    set_permissions
    
    # Validate new certificates
    if ! validate_certificates; then
        print_error "Certificate validation failed"
        
        # Get the latest backup
        local latest_backup=$(ls -t "$BACKUP_DIR" | head -1)
        if [ -n "$latest_backup" ]; then
            restore_from_backup "$latest_backup"
            print_warning "Restored previous certificates"
        fi
        exit 1
    fi
    
    # Test nginx configuration
    if ! test_nginx_config; then
        print_error "Nginx configuration test failed"
        
        # Get the latest backup
        local latest_backup=$(ls -t "$BACKUP_DIR" | head -1)
        if [ -n "$latest_backup" ]; then
            restore_from_backup "$latest_backup"
            print_warning "Restored previous certificates"
            restart_nginx
        fi
        exit 1
    fi
    
    # Restart nginx with new certificates
    if ! restart_nginx; then
        print_error "Failed to restart nginx with new certificates"
        
        # Get the latest backup
        local latest_backup=$(ls -t "$BACKUP_DIR" | head -1)
        if [ -n "$latest_backup" ]; then
            restore_from_backup "$latest_backup"
            print_warning "Restored previous certificates"
            restart_nginx
        fi
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
    echo "🎉 Certificate update completed successfully!"
    echo ""
    echo "📋 Certificate details:"
    openssl x509 -in "$CERT_FILE" -text -noout | grep -E "(Subject:|DNS:|Not Before|Not After)" | sed 's/^/   /'
    echo ""
    echo "🔗 Useful commands:"
    echo "   Test SSL: openssl s_client -connect pcms.live:443 -servername pcms.live"
    echo "   Check site: curl -Ik https://pcms.live"
    echo "   View logs: docker compose logs nginx"
    echo ""
}

# Handle script arguments
case "${1:-}" in
    "restore")
        if [ -z "$2" ]; then
            echo "Available backups:"
            ls -la "$BACKUP_DIR" 2>/dev/null || echo "No backups found"
            echo ""
            echo "Usage: $0 restore <backup_timestamp>"
            exit 1
        fi
        restore_from_backup "$2"
        restart_nginx
        ;;
    "list-backups")
        echo "Available certificate backups:"
        ls -la "$BACKUP_DIR" 2>/dev/null || echo "No backups found"
        ;;
    "help"|"-h"|"--help")
        echo "Cloudflare SSL Certificate Update Script"
        echo ""
        echo "Usage:"
        echo "  $0                    # Update certificates (place .new files first)"
        echo "  $0 restore <timestamp> # Restore from backup"
        echo "  $0 list-backups       # List available backups"
        echo "  $0 help               # Show this help"
        echo ""
        echo "To update certificates:"
        echo "1. Place new certificate as: $CERT_FILE.new"
        echo "2. Place new private key as: $KEY_FILE.new"
        echo "3. Run: $0"
        ;;
    *)
        main
        ;;
esac
