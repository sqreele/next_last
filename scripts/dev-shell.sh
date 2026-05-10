#!/bin/bash
# Access shell in containers
case "$1" in
    frontend|fe)
        echo "🖥️ Accessing frontend shell..."
        docker-compose -f docker-compose.dev.yml exec frontend sh
        ;;
    backend|be)
        echo "🖥️ Accessing backend shell..."
        docker-compose -f docker-compose.dev.yml exec backend bash
        ;;
    db|database)
        echo "🗄️ Accessing database shell..."
        docker-compose -f docker-compose.dev.yml exec db psql -U "${POSTGRES_USER:-mylubd_user}" -d "${POSTGRES_DB:-mylubd_db}"
        ;;
    *)
        echo "Usage: $0 [frontend|backend|db]"
        echo "Examples:"
        echo "  $0 frontend    # Access frontend container shell"
        echo "  $0 backend     # Access backend container shell"
        echo "  $0 db          # Access database shell"
        ;;
esac
