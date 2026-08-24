#!/bin/bash
echo "🔄 Resetting development environment..."
docker-compose --env-file .env.local -f docker-compose.dev.yml down -v
docker system prune -f
docker volume prune -f
echo "✅ Development environment reset complete"
echo "Run './scripts/dev.sh' to start fresh"
