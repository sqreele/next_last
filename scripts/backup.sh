#!/usr/bin/env bash
set -euo pipefail

umask 077

die() {
    printf 'Backup failed: %s\n' "$*" >&2
    exit 1
}

: "${BACKUP_DIR:?Set BACKUP_DIR to an absolute, protected backup destination}"
command -v docker >/dev/null 2>&1 || die 'docker is required'

case "$BACKUP_DIR" in
    /*) ;;
    *) die 'BACKUP_DIR must be an absolute path' ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.yml}
MEDIA_ROOT=${BACKUP_MEDIA_ROOT:-/app/media}

case "$MEDIA_ROOT" in
    /*) ;;
    *) die 'BACKUP_MEDIA_ROOT must be an absolute container path' ;;
esac

resolve_container() {
    service=$1
    docker compose -f "$COMPOSE_FILE" ps -q "$service"
}

DB_CONTAINER=${BACKUP_DB_CONTAINER:-$(resolve_container db)}
MEDIA_CONTAINER=${BACKUP_MEDIA_CONTAINER:-$(resolve_container backend)}
[ -n "$DB_CONTAINER" ] || die 'the PostgreSQL container is not running'
[ -n "$MEDIA_CONTAINER" ] || die 'the backend/media container is not running'

install -d -m 0700 -- "$BACKUP_DIR"
chmod 0700 -- "$BACKUP_DIR"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
final_dir=$BACKUP_DIR/hotelcarepro-$timestamp
temp_dir=$BACKUP_DIR/.hotelcarepro-$timestamp.part-$$
[ ! -e "$final_dir" ] || die "backup set already exists: $final_dir"
[ ! -e "$temp_dir" ] || die "temporary backup path already exists: $temp_dir"
install -d -m 0700 -- "$temp_dir"

cleanup() {
    if [ -d "$temp_dir" ]; then
        find "$temp_dir" -type f -exec chmod u+w {} + 2>/dev/null || true
        rm -rf -- "$temp_dir"
    fi
}
trap cleanup EXIT HUP INT TERM

database_archive=$temp_dir/database.dump
media_archive=$temp_dir/media.tar.gz

# Credentials remain inside the database container environment and are never
# copied into process arguments, logs, manifests, or backup filenames.
docker exec "$DB_CONTAINER" sh -eu -c \
    'exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
    > "$database_archive"
[ -s "$database_archive" ] || die 'pg_dump produced an empty archive'
chmod 0600 -- "$database_archive"
docker exec -i "$DB_CONTAINER" pg_restore --list < "$database_archive" >/dev/null

# The database and media copies are sequential and therefore best-effort, not
# a distributed snapshot. The runbook requires pausing uploads for consistency.
docker exec "$MEDIA_CONTAINER" tar -C "$MEDIA_ROOT" -czf - . > "$media_archive"
[ -s "$media_archive" ] || die 'media backup produced an empty archive'
chmod 0600 -- "$media_archive"
tar -tzf "$media_archive" >/dev/null

cat > "$temp_dir/manifest.txt" <<EOF
format_version=1
created_utc=$timestamp
database_format=postgresql-custom
media_format=tar-gzip
consistency=best-effort-sequential
EOF

(
    cd "$temp_dir"
    sha256sum database.dump media.tar.gz manifest.txt > SHA256SUMS
)
chmod 0600 -- "$temp_dir/manifest.txt" "$temp_dir/SHA256SUMS"

mv -- "$temp_dir" "$final_dir"
trap - EXIT HUP INT TERM
printf 'Backup completed: %s\n' "$final_dir"
