#!/bin/bash
# Show logs for all services or specific service
if [ -z "$1" ]; then
    echo "📋 Showing logs for all services..."
    docker-compose -f docker-compose.dev.yml logs -f
else
    echo "📋 Showing logs for $1..."
    docker-compose -f docker-compose.dev.yml logs -f "$1"
fi