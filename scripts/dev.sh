#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if docker-compose.dev.yml exists
check_dev_compose() {
    if [ ! -f "docker-compose.dev.yml" ]; then
        print_error "docker-compose.dev.yml not found!"
        print_status "Please create docker-compose.dev.yml file first."
        exit 1
    fi
}

# Function to clean up existing containers
cleanup() {
    print_status "Cleaning up existing development containers..."
    docker-compose -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true
    
    # Remove any dangling containers with dev names
    docker rm -f nextjs-frontend-dev django-backend-dev db-dev 2>/dev/null || true
}

# Function to wait for database
wait_for_db() {
    print_status "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f docker-compose.dev.yml exec -T db pg_isready -U mylubd_user -d mylubd_db >/dev/null 2>&1; then
            print_success "Database is ready!"
            return 0
        fi
        
        print_status "Database not ready yet... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    print_error "Database failed to start within expected time"
    return 1
}

# Function to run migrations
run_migrations() {
    print_status "Running database migrations..."
    if docker-compose -f docker-compose.dev.yml exec -T backend python manage.py migrate; then
        print_success "Migrations completed successfully!"
    else
        print_warning "Migrations failed, but continuing..."
    fi
}

# Function to create superuser
create_superuser() {
    print_status "Checking if superuser exists..."
    docker-compose -f docker-compose.dev.yml exec -T backend python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    print('Creating superuser...')
    User.objects.create_superuser(username='admin', email='admin@example.com', password='sqreele1234')
    print('Superuser created: admin/sqreele1234')
else:
    print('Superuser already exists')
" 2>/dev/null || true
}

# Function to check service health
check_services() {
    print_status "Checking service health..."
    
    # Check database
    if docker-compose -f docker-compose.dev.yml ps | grep -q "db-dev.*Up"; then
        print_success "✓ Database is running"
    else
        print_warning "✗ Database might not be running properly"
    fi
    
    # Check backend
    if docker-compose -f docker-compose.dev.yml ps | grep -q "django-backend-dev.*Up"; then
        print_success "✓ Backend is running"
    else
        print_warning "✗ Backend might not be running properly"
    fi
    
    # Check frontend
    if docker-compose -f docker-compose.dev.yml ps | grep -q "nextjs-frontend-dev.*Up"; then
        print_success "✓ Frontend is running"
    else
        print_warning "✗ Frontend might not be running properly"
    fi
}

# Function to show service URLs
show_urls() {
    echo ""
    print_success "🎉 Development environment is ready!"
    echo ""
    echo -e "${GREEN}📱 Frontend:${NC}     http://localhost:3000"
    echo -e "${GREEN}🚀 Backend API:${NC}  http://localhost:8000/api/v1/"
    echo -e "${GREEN}⚙️  Admin Panel:${NC}  http://localhost:8000/admin"
    echo -e "${GREEN}🗄️  Database:${NC}    localhost:5432"
    echo ""
    echo -e "${BLUE}Default admin credentials:${NC}"
    echo -e "Username: admin"
    echo -e "Password: sqreele1234"
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo -e "  View logs:     docker-compose -f docker-compose.dev.yml logs -f"
    echo -e "  Stop:          docker-compose -f docker-compose.dev.yml down"
    echo -e "  Restart:       ./scripts/dev.sh"
    echo ""
}

# Function to handle script interruption
cleanup_on_exit() {
    echo ""
    print_warning "Received interrupt signal. Stopping services..."
    docker-compose -f docker-compose.dev.yml down
    exit 0
}

# Main execution
main() {
    print_status "🚀 Starting development environment..."
    
    # Check if we're in the right directory
    if [ ! -f "docker-compose.yml" ]; then
        print_error "Please run this script from the project root directory"
        exit 1
    fi
    
    # Check if docker-compose.dev.yml exists
    check_dev_compose
    
    # Set up signal handlers
    trap cleanup_on_exit SIGINT SIGTERM
    
    # Parse command line arguments
    DETACHED=false
    REBUILD=false
    CLEAN=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--detached)
                DETACHED=true
                shift
                ;;
            -r|--rebuild)
                REBUILD=true
                shift
                ;;
            -c|--clean)
                CLEAN=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  -d, --detached    Run in detached mode"
                echo "  -r, --rebuild     Force rebuild containers"
                echo "  -c, --clean       Clean up everything before starting"
                echo "  -h, --help        Show this help message"
                exit 0
                ;;
            *)
                print_warning "Unknown option: $1"
                shift
                ;;
        esac
    done
    
    # Clean up if requested
    if [ "$CLEAN" = true ]; then
        print_status "🧹 Performing deep cleanup..."
        cleanup
        docker system prune -f
        docker volume prune -f
    else
        cleanup
    fi
    
    # Build containers
    if [ "$REBUILD" = true ]; then
        print_status "🔨 Force rebuilding containers..."
        docker-compose -f docker-compose.dev.yml build --no-cache
    else
        print_status "📦 Building containers..."
        docker-compose -f docker-compose.dev.yml build
    fi
    
    # Start database first
    print_status "🗄️ Starting database..."
    docker-compose -f docker-compose.dev.yml up -d db
    
    # Wait for database to be ready
    if wait_for_db; then
        # Start backend
        print_status "🚀 Starting backend..."
        docker-compose -f docker-compose.dev.yml up -d backend
        
        # Wait a bit for backend to initialize
        sleep 5
        
        # Run migrations
        run_migrations
        
        # Create superuser
        create_superuser
        
        # Start frontend
        print_status "📱 Starting frontend..."
        docker-compose -f docker-compose.dev.yml up -d frontend
        
        # Wait for services to be ready
        sleep 10
        
        # Check service health
        check_services
        
        # Show URLs and info
        show_urls
        
        # Run in foreground or detached mode
        if [ "$DETACHED" = true ]; then
            print_success "Services running in detached mode"
            print_status "Use 'docker-compose -f docker-compose.dev.yml logs -f' to view logs"
        else
            print_status "Following logs... (Press Ctrl+C to stop)"
            docker-compose -f docker-compose.dev.yml logs -f
        fi
    else
        print_error "Failed to start database. Stopping..."
        docker-compose -f docker-compose.dev.yml down
        exit 1
    fi
}

# Run main function
main "$@"