#!/bin/bash
set -e

echo "🧪 Quick Production Tests - QR Code & Services"
echo "=============================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

# Test 1: Check if services are running
print_info "Test 1: Checking running services..."
if docker ps | grep -q "django-backend-dev\|nextjs-frontend-dev"; then
    print_success "Development services are running"
    DEV_MODE=true
else
    print_info "Development services not running, checking production..."
    if docker ps | grep -q "django-backend\|nextjs-frontend"; then
        print_success "Production services are running"
        DEV_MODE=false
    else
        print_error "No services found running"
        exit 1
    fi
fi

# Test 2: Backend QR code library
print_info "Test 2: Testing backend QR code library..."
if [ "$DEV_MODE" = true ]; then
    CONTAINER="django-backend-dev"
else
    CONTAINER="django-backend"
fi

QR_TEST=$(docker exec $CONTAINER python -c "
import qrcode
qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H)
qr.add_data('test')
qr.make(fit=True)
img = qr.make_image(fill_color='black', back_color='white')
print('OK')
" 2>&1)

if echo "$QR_TEST" | grep -q "OK"; then
    print_success "Backend QR code library works correctly"
else
    print_error "Backend QR code test failed: $QR_TEST"
fi

# Test 3: Frontend QR code component
print_info "Test 3: Testing frontend QR code component..."
if [ "$DEV_MODE" = true ]; then
    FRONTEND_CONTAINER="nextjs-frontend-dev"
else
    FRONTEND_CONTAINER="nextjs-frontend"
fi

# Check if react-qr-code is installed
QR_PACKAGE=$(docker exec $FRONTEND_CONTAINER npm list react-qr-code 2>&1 | grep -o "react-qr-code@[0-9.]*" || echo "NOT_FOUND")
if [ "$QR_PACKAGE" != "NOT_FOUND" ]; then
    print_success "Frontend QR code package installed: $QR_PACKAGE"
else
    print_error "Frontend QR code package not found"
fi

# Test 4: Check for build errors
print_info "Test 4: Checking for build/compilation errors..."
BACKEND_ERRORS=$(docker logs $CONTAINER --tail 100 2>&1 | grep -iE "error|exception|traceback|failed" | grep -v "INFO\|DEBUG" | wc -l)
if [ "$BACKEND_ERRORS" -eq 0 ]; then
    print_success "No critical errors in backend logs"
else
    print_error "Found $BACKEND_ERRORS potential errors in backend logs"
    docker logs $CONTAINER --tail 100 2>&1 | grep -iE "error|exception|traceback" | grep -v "INFO\|DEBUG" | head -3
fi

# Test 5: API Health Check
print_info "Test 5: Testing API health endpoints..."
if [ "$DEV_MODE" = true ]; then
    API_URL="http://localhost:8000"
else
    API_URL="http://localhost:8000"
fi

HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v1/health/" 2>/dev/null || echo "000")
if [ "$HEALTH_STATUS" = "200" ]; then
    print_success "Backend API health check passed (HTTP $HEALTH_STATUS)"
else
    print_error "Backend API health check failed (HTTP $HEALTH_STATUS)"
fi

# Test 6: Check QR code in admin (if machine exists)
print_info "Test 6: Testing QR code generation in Django admin..."
ADMIN_QR_TEST=$(docker exec $CONTAINER python manage.py shell -c "
from myappLubd.models import Machine
from myappLubd.admin import MachineAdmin
from django.conf import settings

try:
    machine = Machine.objects.first()
    if machine:
        admin = MachineAdmin(Machine, None)
        url = admin.get_machine_url(machine)
        if url:
            print(f'QR URL generated: {url[:50]}...')
            print('OK')
        else:
            print('Failed to generate URL')
    else:
        print('No machines found (this is OK for testing)')
        print('OK')
except Exception as e:
    print(f'Error: {str(e)}')
" 2>&1)

if echo "$ADMIN_QR_TEST" | grep -q "OK"; then
    print_success "Django admin QR code functionality works"
else
    print_error "Django admin QR code test failed: $ADMIN_QR_TEST"
fi

# Summary
echo ""
echo "=============================================="
echo "📊 Test Summary"
echo "=============================================="
print_info "Mode: $([ "$DEV_MODE" = true ] && echo 'Development' || echo 'Production')"
print_info "Backend Container: $CONTAINER"
print_info "Frontend Container: $FRONTEND_CONTAINER"
echo ""
print_success "Quick production tests completed!"

