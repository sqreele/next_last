#!/bin/bash
echo "🛑 Stopping development environment..."
docker-compose --env-file .env.local -f docker-compose.dev.yml down
echo "✅ Development environment stopped"
