# HotelCarePro backup and recovery runbook

This runbook covers PostgreSQL and customer-uploaded media. It does not make a
live-production backup claim, and it does not authorize a production restore.

## Data and recovery scope

| Dataset | Authority | Backup / restore contract |
| --- | --- | --- |
| PostgreSQL volume `pcms_postgres_data_v17` | Authoritative tenant, property, membership, job, PM, media metadata, and durable application/session data | Daily native custom-format logical backup; restore to fresh PostgreSQL and validate relationships |
| Media volume `pcms_media_volume` at `/app/media` | Authoritative customer uploads and generated JPEG variants referenced by PostgreSQL | Back up with relative paths and restore beside the matching database backup |
| Deployment `.env`, Auth0, SMTP, database, Redis, and provider credentials | Authoritative configuration, not application data | Recover from an access-controlled password manager/provider secret store; never place real values in repository backups |
| Redis volume `pcms_redis_data` | Rebuildable cache, session-cache acceleration, and rate-limit counters; durable sessions remain in PostgreSQL | **NO BACKUP REQUIRED**; start empty after recovery |
| Static files and frontend/backend images | Rebuildable from source/container images | No data backup required |
| Container/application logs | Operational evidence, not application authority | Ship/retain off-host according to operational incident needs; not part of this backup set |

The old `django-dbbackup` filesystem location and `pcms_backup_volume` are
same-host-only and database-only. They are not sufficient disaster recovery.

## Create and validate a backup

Run from the repository root on the application host. `BACKUP_DIR` must be an
absolute path. Prefer a mounted, encrypted off-host destination or copy the
completed immutable set off-host immediately afterward.

```sh
BACKUP_DIR=/mnt/encrypted-offhost/hotelcarepro ./scripts/backup.sh
```

The script uses the database container's existing environment without printing
credentials. It sets `umask 077`, creates directories as `0700` and files as
`0600`, writes timestamped temporary output, validates `pg_restore --list` and
the media tar index, records SHA-256 checksums, then atomically publishes the
set. A failed run leaves no completed-looking backup.

The database dump and media archive are sequential. They are only best-effort
consistent if uploads/writes continue. For an application-consistent set,
announce a short maintenance window, stop new uploads and application writes,
let in-flight requests finish, run the backup, then resume traffic. Do not claim
distributed snapshot consistency without storage-provider evidence.

## Off-host copy, encryption, and retention

Keep at least one copy outside the application host and its local Docker
volumes. Use provider-managed encrypted object storage or an encrypted remote
volume, TLS for transport, versioning/object lock where available, and a
separate credential from the application runtime. Do not build custom crypto.

Recommended operational policy (not a legal requirement or contractual SLA):

- daily application-consistent backup sets, retained for 14 days;
- one weekly set retained for 8 weeks;
- one monthly set retained for 12 months;
- quarterly disposable restore drill, plus a drill after material infrastructure changes;
- monitor job completion, checksum validation, off-host copy completion, age,
  and destination capacity.

Retention deletion should run only after the off-host copy is confirmed. The
repository script intentionally does not delete old backups or upload to an
unconfigured provider.

Schedule the command with the host's service manager only after the encrypted
destination is mounted and monitored. Store `BACKUP_DIR` in a root-owned `0600`
environment file; keep the service definition credential-free. A scheduler is
not added by this repository change because the live host and off-host target
are not available for verification.

## Disposable restore drill

Never restore first into production. Create a fresh PostgreSQL container with
the required safety label and an empty media directory. Example placeholders:

```sh
docker run -d --name hotelcarepro-restore-drill \
  --label hotelcarepro.recovery-drill=true \
  -e POSTGRES_DB=hotelcarepro_restore \
  -e POSTGRES_USER=restore_user \
  -e POSTGRES_PASSWORD='generated-test-only-secret' postgres:17-alpine

BACKUP_SET=/absolute/path/to/hotelcarepro-YYYYMMDDTHHMMSSZ \
RESTORE_DB_CONTAINER=hotelcarepro-restore-drill \
RESTORE_DATABASE=hotelcarepro_restore \
RESTORE_DATABASE_USER=restore_user \
RESTORE_MEDIA_ROOT=/absolute/path/to/empty-media \
CONFIRM_DISPOSABLE_RESTORE=RESTORE_DISPOSABLE_ONLY \
./scripts/restore-backup-disposable.sh
```

The restore helper requires the explicit confirmation, a container carrying
`hotelcarepro.recovery-drill=true`, an empty database schema, and an empty media
target. It never drops or cleans a database. It verifies checksums and archive
structure before restoring.

Point a disposable backend at the restored database and media directory. Run:

```sh
python manage.py check
python manage.py migrate --check
```

Then compare source/target table counts and explicitly verify Tenant → Property,
TenantMembership → Property grants, Property → Room/Job, Job → JobImage, and PM
relationships. For representative media, confirm the database field resolves
below `MEDIA_ROOT`, the file hash matches, an authorized protected-media request
succeeds, and an unauthorized request is denied.

## Production recovery approval boundary

A production recovery is a reviewed incident procedure, not an invocation of
the disposable helper. Before recovery: identify the incident timestamp, select
and checksum a backup set, preserve the damaged database/media for forensics,
stop writes/uploads, provision a fresh target, restore and validate there, and
obtain operator approval before switching traffic. Never run an automatic
`DROP DATABASE` or extract media over a populated production directory.

| Scenario | Required backup | Recovery path | Remaining operational gap |
| --- | --- | --- | --- |
| Accidental DB deletion | PostgreSQL dump | Restore fresh DB, validate, then controlled cutover | Point-in-time recovery depends on provider/WAL configuration not evidenced here |
| Corrupted DB | Known-good dump | Preserve corrupt DB, restore fresh target, compare and cut over | Data after selected backup may be lost |
| Server loss | Off-host DB + media set and secrets | Rebuild host, restore both, configure secrets/DNS, validate | Off-host destination and live snapshots are not repository-verifiable |
| Media deletion | Matching media archive and DB dump | Restore to empty media target, validate hashes/mappings, cut over | Writes between DB/media copies require maintenance window |
| Bad deployment | Source/container release plus data backup | Roll back application; restore data only if data was mutated and reviewed | Release artifact retention is operational |
| Credential loss | Password manager/provider recovery records | Recover/rotate provider credentials, update secret store, restart and validate | Actual escrow and access testing require operators/providers |

Recommended targets, not contractual guarantees: daily backups give an RPO of
24 hours; target a 4-hour RTO for single-database/media recovery and 8 hours for
full server loss. Provider snapshots or WAL archiving could improve these later,
but are not assumed by this runbook.
