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

# Align PostgreSQL sequences with MAX(id) so post_migrate create_permissions does not
# hit duplicate-key errors (common after DB restore or manual data changes).
echo "Syncing PostgreSQL sequences..."
SEQFIX=$(python manage.py sqlsequencereset auth admin contenttypes sessions myappLubd 2>/dev/null || true)
if [ -n "$SEQFIX" ]; then
    echo "$SEQFIX" | python manage.py dbshell >/dev/null 2>&1 || true
fi

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

# Cron starts jobs with a minimal environment. Keep the values needed by Django
# in a root-only file, rather than embedding credentials in the world-readable
# /etc/cron.d definition. shlex.quote preserves values without logging them.
CRON_ENV_FILE=/run/staymaint-daily-summary.env
python - "$CRON_ENV_FILE" <<'PY'
import os
import shlex
import sys

names = (
    'DJANGO_SETTINGS_MODULE',
    'PYTHONPATH',
    'TZ',
    'DJANGO_SECRET_KEY',
    'DEBUG',
    'SQL_ENGINE',
    'SQL_DATABASE',
    'SQL_USER',
    'SQL_PASSWORD',
    'SQL_HOST',
    'SQL_PORT',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USE_TLS',
    'EMAIL_USE_SSL',
    'EMAIL_HOST_USER',
    'EMAIL_HOST_PASSWORD',
    'DEFAULT_FROM_EMAIL',
    'SERVER_EMAIL',
    'EMAIL_REQUIRE_AUTH',
    'DAILY_SUMMARY_RECIPIENTS',
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
    'FRONTEND_BASE_URL',
)

flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
if hasattr(os, 'O_NOFOLLOW'):
    flags |= os.O_NOFOLLOW
fd = os.open(sys.argv[1], flags, 0o600)
os.fchown(fd, 0, 0)
os.fchmod(fd, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as env_file:
    for name in names:
        value = os.environ.get(name, '')
        env_file.write(f'export {name}={shlex.quote(value)}\n')
PY

{
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    # Schedule: run daily at 23:00 Asia/Bangkok (includes the /etc/cron.d user column)
    echo "0 23 * * * root . $CRON_ENV_FILE && cd /app && /usr/local/bin/python manage.py send_daily_summary >> /var/log/cron.log 2>&1"
} > /etc/cron.d/daily_summary
chmod 0644 /etc/cron.d/daily_summary

# Start cron service
service cron start

# Tail cron log in background for visibility
touch /var/log/cron.log
( tail -F /var/log/cron.log & )

# Start Gunicorn in the foreground as PID 1
exec gunicorn myLubd.wsgi:application --bind 0.0.0.0:8000 --workers 3
