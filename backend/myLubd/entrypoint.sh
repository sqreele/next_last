#!/bin/sh

# Wait for PostgreSQL using pg_isready to avoid invalid startup packet logs
DB_HOST="${SQL_HOST:-db}"
DB_PORT="${SQL_PORT:-5432}"
DB_USER="${SQL_USER:-mylubd_user}"
DB_NAME="${SQL_DATABASE:-mylubd_db}"

until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
    echo "Waiting for postgres..."
    sleep 1
done

echo "PostgreSQL started"

cd src

# Create and set permissions for media and static directories
mkdir -p /app/media/maintenance_job_images
mkdir -p /app/media/maintenance_pm_images/$(date +%Y)/$(date +%m)
mkdir -p /app/media/profile_images
mkdir -p /app/static

# Set permissions
chown -R www-data:www-data /app/media
chown -R www-data:www-data /app/static
chmod -R 755 /app/media
chmod -R 755 /app/static

# Run migrations (use --fake-initial to align with existing DB schemas)
python manage.py migrate --no-input --fake-initial

# Collect static files
python manage.py collectstatic --no-input

# Register cron job with required environment variables so Gmail API/SMTP work under cron
{
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    echo "PYTHONPATH=/app"
    echo "DJANGO_SETTINGS_MODULE=myLubd.settings"
    echo "TZ=${TZ:-Asia/Bangkok}"
    # Email/SMTP settings
    echo "EMAIL_HOST=${EMAIL_HOST}"
    echo "EMAIL_PORT=${EMAIL_PORT}"
    echo "EMAIL_USE_TLS=${EMAIL_USE_TLS}"
    echo "EMAIL_USE_SSL=${EMAIL_USE_SSL}"
    echo "EMAIL_HOST_USER=${EMAIL_HOST_USER}"
    echo "EMAIL_HOST_PASSWORD=${EMAIL_HOST_PASSWORD}"
    echo "DEFAULT_FROM_EMAIL=${DEFAULT_FROM_EMAIL}"
    echo "SERVER_EMAIL=${SERVER_EMAIL}"
    echo "EMAIL_REQUIRE_AUTH=${EMAIL_REQUIRE_AUTH}"
    # Gmail API OAuth2 credentials (optional)
    echo "GMAIL_CLIENT_ID=${GMAIL_CLIENT_ID}"
    echo "GMAIL_CLIENT_SECRET=${GMAIL_CLIENT_SECRET}"
    echo "GMAIL_REFRESH_TOKEN=${GMAIL_REFRESH_TOKEN}"
    # Schedule: run daily at 23:00 Asia/Bangkok (must include user column for /etc/cron.d)
    echo "0 23 * * * root cd /app/src && /usr/local/bin/python manage.py send_daily_summary >> /var/log/cron.log 2>&1"
} > /etc/cron.d/daily_summary
chmod 0644 /etc/cron.d/daily_summary

# Install cron file for root
crontab /etc/cron.d/daily_summary

# Start cron service
service cron start

# Tail cron log in background for visibility
touch /var/log/cron.log
( tail -F /var/log/cron.log & )

# Start Gunicorn in the foreground as PID 1
exec gunicorn myLubd.wsgi:application --bind 0.0.0.0:8000 --workers 3
