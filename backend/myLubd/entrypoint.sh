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

# Keep cron credentials in ephemeral, root-only storage.  The separate cron
# definition contains no secrets, and shlex quoting preserves arbitrary values.
CRON_RUNTIME_DIR=/run/hotelcarepro
CRON_ENV_FILE="$CRON_RUNTIME_DIR/cron.env"
install -d -o root -g root -m 0700 "$CRON_RUNTIME_DIR"
/usr/local/bin/python - "$CRON_ENV_FILE" <<'PY'
import os
import re
import shlex
import sys

destination = sys.argv[1]
exact_names = {
    'DEBUG',
    'DEFAULT_FROM_EMAIL',
    'DJANGO_SETTINGS_MODULE',
    'PYTHONPATH',
    'SERVER_EMAIL',
    'TZ',
}
allowed_prefixes = (
    'DAILY_SUMMARY_',
    'DJANGO_',
    'EMAIL_',
    'GMAIL_',
    'POSTGRES_',
    'REDIS_',
    'SQL_',
)
with open(destination, 'w', encoding='utf-8') as env_file:
    for name in sorted(os.environ):
        if not (name in exact_names or name.startswith(allowed_prefixes)):
            continue
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', name):
            continue
        env_file.write(f'export {name}={shlex.quote(os.environ[name])}\n')
os.chmod(destination, 0o600)
PY
chown root:root "$CRON_ENV_FILE"

# Files in /etc/cron.d already use the system-crontab format (including the
# user column), so they must not also be passed to `crontab`.
{
    echo "SHELL=/bin/sh"
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    echo "TZ=Asia/Bangkok"
    echo "0 23 * * * root . $CRON_ENV_FILE && cd /app && /usr/local/bin/python manage.py send_daily_summary >> /var/log/cron.log 2>&1"
} > /etc/cron.d/daily_summary
chown root:root /etc/cron.d/daily_summary
chmod 0600 /etc/cron.d/daily_summary

# Start cron service
service cron start

# Tail cron log in background for visibility without exposing its contents to
# unprivileged container users.
touch /var/log/cron.log
chown root:adm /var/log/cron.log
chmod 0640 /var/log/cron.log
( tail -F /var/log/cron.log & )

# Start Gunicorn in the foreground as PID 1
exec gunicorn myLubd.wsgi:application --bind 0.0.0.0:8000 --workers 3
