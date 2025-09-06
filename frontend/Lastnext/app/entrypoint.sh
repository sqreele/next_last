#!/bin/sh
set -e

echo "🚀 Setting up Next.js application..."

# Function to check if database is ready
check_database() {
    echo "🔍 Checking database connectivity..."
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        # Use a simple connection test with timeout
        if timeout 5 node -e "
            const { Pool } = require('pg');
            const pool = new Pool({ connectionString: process.env.DATABASE_URL });
            pool.query('SELECT 1')
                .then(() => { console.log('DB connected'); process.exit(0); })
                .catch(() => process.exit(1));
        " 2>/dev/null; then
            echo "✅ Database is ready!"
            return 0
        fi
        
        echo "⏳ Waiting for database... (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "❌ Database is not ready after $max_attempts attempts"
    return 1
}

# Function to setup database schema
setup_database() {
    echo "📋 Database setup not needed (using direct database connection)..."
}

# Function to run database migrations (alternative to db push)
run_migrations() {
    echo "🔄 Database migrations not needed (using direct database connection)..."
}

# Function to create health check endpoint
create_health_check() {
    echo "🏥 Setting up health check..."
    
    # Create api directory if it doesn't exist
    mkdir -p ./pages/api 2>/dev/null || mkdir -p ./app/api/health 2>/dev/null || true
    
    # Create a simple health check if it doesn't exist
    if [ ! -f "./pages/api/health.js" ] && [ ! -f "./app/api/health/route.js" ]; then
        echo "Creating health check endpoint..."
        if [ -d "./pages/api" ]; then
            cat > ./pages/api/health.js << 'EOF'
export default function handler(req, res) {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
EOF
        elif [ -d "./app/api" ]; then
            mkdir -p ./app/api/health
            cat > ./app/api/health/route.js << 'EOF'
export async function GET() {
    return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}
EOF
        fi
    fi
}

# Main setup process
main() {
    echo "🔧 Starting application setup..."
    
    # Create health check endpoint
    create_health_check
    
    # Check if we should skip database setup
    if [ "$SKIP_DB_SETUP" = "true" ]; then
        echo "⏭️  Skipping database setup (SKIP_DB_SETUP=true)"
    else
        # Wait for database to be ready
        if check_database; then
            # Setup database
            setup_database
        else
            echo "⚠️  Database not ready, but continuing with application startup..."
        fi
    fi
    
    echo "🎉 Setup complete! Starting Next.js application..."
    echo "🌐 Application will be available on port ${PORT:-3000}"
    
    # Start the Next.js application
    # Check if we have a standalone build (this should exist now)
    if [ -f "./server.js" ]; then
        echo "🚀 Starting standalone server..."
        exec node server.js
    elif [ -f "./node_modules/.bin/next" ]; then
        echo "🚀 Starting with Next.js CLI..."
        exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
    else
        echo "🚀 Starting with npm..."
        exec npm run start -- -H 0.0.0.0 -p "${PORT:-3000}"
    fi
}

# Handle signals gracefully
cleanup() {
    echo "🛑 Received signal, shutting down gracefully..."
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    exit 0
}

trap cleanup TERM INT QUIT

# Run main function
main "$@"