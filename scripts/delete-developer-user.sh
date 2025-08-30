#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if development environment is running
check_dev_environment() {
    if ! docker-compose -f docker-compose.dev.yml ps | grep -q "django-backend-dev"; then
        print_error "Development environment is not running!"
        print_status "Please start the development environment first with: ./scripts/dev.sh"
        exit 1
    fi
}

# Main function
main() {
    echo "🗑️  Development User Deletion Script"
    echo "======================================"
    
    # Check if development environment is running
    check_dev_environment
    
    print_status "Development environment is running. Proceeding with user deletion..."
    
    # Run the Python script inside the backend container
    if docker-compose -f docker-compose.dev.yml exec -T backend python /app/delete_developer_user.py; then
        print_success "Development user deletion completed!"
    else
        print_error "Failed to delete development user!"
        exit 1
    fi
}

# Run main function
main "$@"
