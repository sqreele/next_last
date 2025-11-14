#!/bin/bash
set -e

echo "🧪 Starting Production Tests..."
echo "================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Check if .env file exists (warn but continue)
if [ ! -f .env ]; then
    print_info ".env file not found - using environment variables from docker-compose.yml"
    print_info "Make sure required environment variables are set in docker-compose.yml"
fi

# Step 1: Build production images
print_info "Step 1: Building production Docker images..."
docker-compose -f docker-compose.yml build --no-cache 2>&1 | tee /tmp/build.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "Production images built successfully"
else
    print_error "Failed to build production images"
    exit 1
fi

# Step 2: Start services
print_info "Step 2: Starting production services..."
docker-compose -f docker-compose.yml down -v 2>/dev/null || true
docker-compose -f docker-compose.yml up -d

# Wait for services to be ready
print_info "Waiting for services to start..."
sleep 15

# Step 3: Check service health
print_info "Step 3: Checking service health..."

# Check database
if docker exec db pg_isready -U mylubd_user -d mylubd_db > /dev/null 2>&1; then
    print_success "Database is healthy"
else
    print_error "Database health check failed"
fi

# Check backend health
BACKEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/health/ || echo "000")
if [ "$BACKEND_HEALTH" = "200" ]; then
    print_success "Backend health check passed (HTTP $BACKEND_HEALTH)"
else
    print_error "Backend health check failed (HTTP $BACKEND_HEALTH)"
fi

# Check frontend health
FRONTEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || echo "000")
if [ "$FRONTEND_HEALTH" = "200" ]; then
    print_success "Frontend health check passed (HTTP $FRONTEND_HEALTH)"
else
    print_error "Frontend health check failed (HTTP $FRONTEND_HEALTH)"
fi

# Step 4: Test QR code functionality
print_info "Step 4: Testing QR code functionality..."

# Test backend QR code endpoint (if machine exists)
BACKEND_QR_TEST=$(docker exec django-backend-dev python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()
from myappLubd.models import Machine
try:
    machine = Machine.objects.first()
    if machine:
        print('Machine found:', machine.machine_id)
        # Test QR code generation
        import qrcode
        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H)
        qr.add_data('test')
        qr.make(fit=True)
        print('QR code generation: OK')
    else:
        print('No machines found')
except Exception as e:
    print('Error:', str(e))
" 2>&1)

if echo "$BACKEND_QR_TEST" | grep -q "QR code generation: OK"; then
    print_success "Backend QR code generation works"
else
    print_error "Backend QR code test failed: $BACKEND_QR_TEST"
fi

# Step 5: Check container logs for errors
print_info "Step 5: Checking container logs for errors..."

BACKEND_ERRORS=$(docker logs django-backend-dev --tail 50 2>&1 | grep -i "error\|exception\|traceback" | wc -l)
if [ "$BACKEND_ERRORS" -eq 0 ]; then
    print_success "No errors found in backend logs"
else
    print_error "Found $BACKEND_ERRORS potential errors in backend logs"
    docker logs django-backend-dev --tail 50 | grep -i "error\|exception\|traceback" | head -5
fi

FRONTEND_ERRORS=$(docker logs nextjs-frontend --tail 50 2>&1 | grep -i "error\|exception\|failed" | wc -l)
if [ "$FRONTEND_ERRORS" -eq 0 ]; then
    print_success "No errors found in frontend logs"
else
    print_error "Found $FRONTEND_ERRORS potential errors in frontend logs"
    docker logs nextjs-frontend --tail 50 | grep -i "error\|exception\|failed" | head -5
fi

# Step 6: Test API endpoints
print_info "Step 6: Testing API endpoints..."

# Test machines API
MACHINES_API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/machines/ || echo "000")
if [ "$MACHINES_API" = "200" ] || [ "$MACHINES_API" = "401" ]; then
    print_success "Machines API endpoint accessible (HTTP $MACHINES_API)"
else
    print_error "Machines API endpoint failed (HTTP $MACHINES_API)"
fi

# Step 7: Check build output
print_info "Step 7: Checking frontend build output..."

if docker exec nextjs-frontend ls /app/.next > /dev/null 2>&1; then
    print_success "Frontend build output exists"
    
    # Check for standalone build
    if docker exec nextjs-frontend ls /app/.next/standalone > /dev/null 2>&1; then
        print_success "Standalone build found (optimized)"
    else
        print_info "Standalone build not found (using standard build)"
    fi
else
    print_error "Frontend build output not found"
fi

# Summary
echo ""
echo "================================"
echo "📊 Production Test Summary"
echo "================================"

# Count successes and failures
SUCCESS_COUNT=$(grep -c "✅" <<< "$(docker-compose -f docker-compose.yml ps --format json 2>/dev/null || echo '')" || echo "0")
print_info "Services running: $(docker-compose -f docker-compose.yml ps --services --filter 'status=running' | wc -l)"

echo ""
print_info "To view logs: docker-compose -f docker-compose.yml logs -f"
print_info "To stop services: docker-compose -f docker-compose.yml down"
print_info "To test in browser: http://localhost:3000"

echo ""
print_success "Production tests completed!"

