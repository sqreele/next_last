import os
from pathlib import Path
import stat
import subprocess
import tempfile

from django.test import SimpleTestCase


class BackupRecoveryScriptTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project_root = Path(__file__).resolve().parents[4]
        cls.backup_script = cls.project_root / 'scripts' / 'backup.sh'
        cls.restore_script = cls.project_root / 'scripts' / 'restore-backup-disposable.sh'

    def _fake_docker(self, directory):
        executable = Path(directory) / 'docker'
        executable.write_text(
            """#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = compose ]; then printf 'fake-container\\n'; exit 0; fi
if [ "$1" = inspect ]; then printf '%s\\n' "${FAKE_DRILL_LABEL:-true}"; exit 0; fi
shift
if [ "${1:-}" = -i ]; then shift; fi
container=$1
shift
case " $* " in
  *' pg_dump '*) printf 'synthetic-custom-database-archive\\n' ;;
  *' pg_restore --list '*) cat >/dev/null; printf 'TABLE synthetic\\n' ;;
  *' pg_restore '*) cat >/dev/null; printf 'restore-ok\\n' >> "$FAKE_RESTORE_LOG" ;;
  *' psql '*) printf '0\\n' ;;
  *' tar '*) exec tar -C "$FAKE_MEDIA_SOURCE" -czf - . ;;
  *) printf 'unexpected fake docker call: %s\\n' "$*" >&2; exit 2 ;;
esac
"""
        )
        executable.chmod(0o700)

    def _environment(self, bin_dir, media_source, restore_log):
        environment = os.environ.copy()
        environment['PATH'] = f'{bin_dir}:{environment["PATH"]}'
        environment['FAKE_MEDIA_SOURCE'] = str(media_source)
        environment['FAKE_RESTORE_LOG'] = str(restore_log)
        return environment

    def test_backup_requires_explicit_destination(self):
        environment = os.environ.copy()
        environment.pop('BACKUP_DIR', None)
        result = subprocess.run(
            [self.backup_script], env=environment, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('BACKUP_DIR', result.stderr)

    def test_backup_is_valid_nonempty_private_and_contains_no_secret(self):
        with tempfile.TemporaryDirectory() as workspace:
            root = Path(workspace)
            bin_dir = root / 'bin'
            media = root / 'source-media'
            destination = root / 'backups'
            bin_dir.mkdir()
            media.mkdir()
            (media / 'maintenance_job_images').mkdir()
            (media / 'maintenance_job_images' / 'sample.jpg').write_bytes(
                b'representative protected media'
            )
            restore_log = root / 'restore.log'
            self._fake_docker(bin_dir)
            environment = self._environment(bin_dir, media, restore_log)
            environment['BACKUP_DIR'] = str(destination)
            environment['POSTGRES_PASSWORD'] = 'must-not-be-printed'

            result = subprocess.run(
                [self.backup_script], env=environment, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
            )
            self.assertNotIn('must-not-be-printed', result.stdout + result.stderr)
            backup_set = next(destination.glob('hotelcarepro-*'))
            self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(backup_set.stat().st_mode), 0o700)
            for name in ('database.dump', 'media.tar.gz', 'manifest.txt', 'SHA256SUMS'):
                artifact = backup_set / name
                self.assertGreater(artifact.stat().st_size, 0)
                self.assertEqual(stat.S_IMODE(artifact.stat().st_mode), 0o600)
            subprocess.run(
                ['tar', '-tzf', backup_set / 'media.tar.gz'],
                stdout=subprocess.DEVNULL, check=True,
            )
            subprocess.run(
                ['sha256sum', '-c', 'SHA256SUMS'], cwd=backup_set,
                stdout=subprocess.DEVNULL, check=True,
            )

    def test_disposable_restore_requires_confirmation_and_restores_media(self):
        with tempfile.TemporaryDirectory() as workspace:
            root = Path(workspace)
            bin_dir = root / 'bin'
            media = root / 'source-media'
            destination = root / 'backups'
            restored_media = root / 'restored-media'
            bin_dir.mkdir()
            media.mkdir()
            (media / 'maintenance_job_images').mkdir()
            expected = b'media-database-mapping-payload'
            (media / 'maintenance_job_images' / 'job.jpg').write_bytes(expected)
            restore_log = root / 'restore.log'
            self._fake_docker(bin_dir)
            environment = self._environment(bin_dir, media, restore_log)
            environment['BACKUP_DIR'] = str(destination)
            subprocess.run([self.backup_script], env=environment, check=True)
            backup_set = next(destination.glob('hotelcarepro-*'))

            restore_environment = environment | {
                'BACKUP_SET': str(backup_set),
                'RESTORE_DB_CONTAINER': 'labeled-disposable-db',
                'RESTORE_DATABASE': 'restore_test',
                'RESTORE_DATABASE_USER': 'restore_user',
                'RESTORE_MEDIA_ROOT': str(restored_media),
                'CONFIRM_DISPOSABLE_RESTORE': 'RESTORE_DISPOSABLE_ONLY',
            }
            subprocess.run([self.restore_script], env=restore_environment, check=True)
            restored = restored_media / 'maintenance_job_images' / 'job.jpg'
            self.assertEqual(restored.read_bytes(), expected)
            self.assertIn('restore-ok', restore_log.read_text())

            restore_environment['CONFIRM_DISPOSABLE_RESTORE'] = 'no'
            refused = subprocess.run(
                [self.restore_script], env=restore_environment, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn('RESTORE_DISPOSABLE_ONLY', refused.stderr)

            restore_environment['CONFIRM_DISPOSABLE_RESTORE'] = 'RESTORE_DISPOSABLE_ONLY'
            restore_environment['FAKE_DRILL_LABEL'] = 'false'
            label_refused = subprocess.run(
                [self.restore_script], env=restore_environment, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            self.assertNotEqual(label_refused.returncode, 0)
            self.assertIn('recovery-drill=true', label_refused.stderr)
