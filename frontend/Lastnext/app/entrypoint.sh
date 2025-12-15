#!/bin/sh
set -e

echo "🚀 Setting up Next.js application..."

# Fail-fast if a known bad process/binary is present.
# If you ever see this triggered, treat it as a potential compromise and rebuild the image with --no-cache
# and rotate any secrets available to this container.
security_guard() {
    # Look for the suspicious process names (seen as children of next-server in the wild).
    if ps 2>/dev/null | grep -E '(linuxsys|ssl_client)' >/dev/null 2>&1; then
        echo "❌ SECURITY ALERT: suspicious process detected (linuxsys/ssl_client). Refusing to start." >&2
        ps 2>/dev/null | grep -E '(linuxsys|ssl_client)' >&2 || true
        # Best effort cleanup
        pkill -9 linuxsys 2>/dev/null || true
        pkill -9 ssl_client 2>/dev/null || true
        rm -f ./linuxsys ./ssl_client /app/linuxsys /app/ssl_client 2>/dev/null || true
        exit 1
    fi

    # Look for the suspicious binaries in the working dir (the process is often launched as ./linuxsys).
    if [ -f "./linuxsys" ] || [ -f "/app/linuxsys" ]; then
        echo "❌ SECURITY ALERT: suspicious binary found at ./linuxsys or /app/linuxsys. Refusing to start." >&2
        ls -la ./linuxsys /app/linuxsys 2>/dev/null >&2 || true
        rm -f ./linuxsys /app/linuxsys 2>/dev/null || true
        exit 1
    fi
}

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

# Main setup process
main() {
    echo "🔧 Starting application setup..."

    # Fail fast if we detect known suspicious binaries/processes.
    security_guard
    
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