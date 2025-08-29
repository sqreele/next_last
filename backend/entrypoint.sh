#!/bin/bash
set -e

# Wait for PostgreSQL using pg_isready to avoid invalid startup packet logs
DB_HOST="${SQL_HOST:-db}"
DB_PORT="${SQL_PORT:-5432}"
DB_USER="${SQL_USER:-mylubd_user}"
DB_NAME="${SQL_DATABASE:-mylubd_db}"

echo "Waiting for PostgreSQL..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL started"

# Apply database migrations
echo "Applying database migrations..."
python manage.py migrate --noinput --fake-initial

# Create superuser if necessary
echo "Checking if superuser exists..."
python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    print('Creating superuser...')
    User.objects.create_superuser(username='admin', email='admin@example.com', password='sqreele1234')
    print('Superuser created successfully')
else:
    print('Superuser already exists')
"

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

# Start server
echo "Starting server..."
gunicorn myLubd.wsgi:application --bind 0.0.0.0:8000