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

# Start server
CRON_ENV="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nPYTHONPATH=/app\nDJANGO_SETTINGS_MODULE=myLubd.settings\nTZ=${TZ:-Asia/Bangkok}"
echo -e "$CRON_ENV" > /etc/cron.d/env

# Register cron job: run daily at 23:00 Asia/Bangkok
echo "0 23 * * * cd /app/src && /usr/local/bin/python manage.py send_daily_summary >> /var/log/cron.log 2>&1" > /etc/cron.d/daily_summary
chmod 0644 /etc/cron.d/daily_summary

# Apply cron files
crontab /etc/cron.d/daily_summary

# Start cron in background
touch /var/log/cron.log
service cron start

python manage.py runserver 0.0.0.0:8000 &

tail -F /var/log/cron.log &

exec "$@"
