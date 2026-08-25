#!/usr/bin/env bash
set -euo pipefail

umask 077

die() {
    printf 'Restore refused: %s\n' "$*" >&2
    exit 1
}

command -v docker >/dev/null 2>&1 || die 'docker is required'
: "${BACKUP_SET:?Set BACKUP_SET to a verified HotelCarePro backup directory}"
: "${RESTORE_DB_CONTAINER:?Set RESTORE_DB_CONTAINER to a disposable PostgreSQL container}"
: "${RESTORE_DATABASE:?Set RESTORE_DATABASE to a fresh disposable database}"
: "${RESTORE_DATABASE_USER:?Set RESTORE_DATABASE_USER explicitly}"
: "${RESTORE_MEDIA_ROOT:?Set RESTORE_MEDIA_ROOT to an empty disposable directory}"
[ "${CONFIRM_DISPOSABLE_RESTORE:-}" = 'RESTORE_DISPOSABLE_ONLY' ] || \
    die 'set CONFIRM_DISPOSABLE_RESTORE=RESTORE_DISPOSABLE_ONLY'

case "$BACKUP_SET" in /*) ;; *) die 'BACKUP_SET must be absolute' ;; esac
case "$RESTORE_MEDIA_ROOT" in /*) ;; *) die 'RESTORE_MEDIA_ROOT must be absolute' ;; esac
[ -d "$BACKUP_SET" ] || die 'backup set does not exist'
[ -f "$BACKUP_SET/database.dump" ] || die 'database archive is missing'
[ -f "$BACKUP_SET/media.tar.gz" ] || die 'media archive is missing'
[ -f "$BACKUP_SET/SHA256SUMS" ] || die 'checksum manifest is missing'

# A recovery-drill label is a deliberate safety boundary. This script cannot
# target the normal production database container even if its name is supplied.
drill_label=$(docker inspect --format '{{ index .Config.Labels "hotelcarepro.recovery-drill" }}' "$RESTORE_DB_CONTAINER" 2>/dev/null || true)
[ "$drill_label" = 'true' ] || die 'target container lacks hotelcarepro.recovery-drill=true'

(
    cd "$BACKUP_SET"
    sha256sum -c SHA256SUMS >/dev/null
)
docker exec -i "$RESTORE_DB_CONTAINER" pg_restore --list < "$BACKUP_SET/database.dump" >/dev/null

schema_count=$(docker exec "$RESTORE_DB_CONTAINER" psql \
    --username "$RESTORE_DATABASE_USER" --dbname "$RESTORE_DATABASE" \
    --tuples-only --no-align --command \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
[ "$schema_count" = '0' ] || die 'target database public schema is not empty'

if [ -e "$RESTORE_MEDIA_ROOT" ]; then
    [ -d "$RESTORE_MEDIA_ROOT" ] || die 'RESTORE_MEDIA_ROOT is not a directory'
    [ -z "$(find "$RESTORE_MEDIA_ROOT" -mindepth 1 -maxdepth 1 -print -quit)" ] || \
        die 'RESTORE_MEDIA_ROOT must be empty'
else
    install -d -m 0700 -- "$RESTORE_MEDIA_ROOT"
fi
chmod 0700 -- "$RESTORE_MEDIA_ROOT"

# Refuse archives containing absolute paths or parent traversal before extract.
if tar -tzf "$BACKUP_SET/media.tar.gz" | awk \
    '$0 ~ /^\// || $0 ~ /(^|\/)\.\.($|\/)/ { bad=1 } END { exit bad ? 0 : 1 }'; then
    die 'media archive contains an unsafe path'
fi

docker exec -i "$RESTORE_DB_CONTAINER" pg_restore \
    --exit-on-error --no-owner --no-acl \
    --username "$RESTORE_DATABASE_USER" --dbname "$RESTORE_DATABASE" \
    < "$BACKUP_SET/database.dump"
tar -xzf "$BACKUP_SET/media.tar.gz" -C "$RESTORE_MEDIA_ROOT"

printf 'Disposable restore completed. Validate application data before any recovery decision.\n'
