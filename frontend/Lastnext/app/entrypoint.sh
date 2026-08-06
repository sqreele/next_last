#!/bin/sh
set -e

echo "🚀 Setting up Next.js application..."

# Main setup process
main() {
    echo "🔧 Starting application setup..."

    # Database readiness is owned by the backend. Blocking here can keep the
    # HTTP server down long enough for Docker to mark this container unhealthy.
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
