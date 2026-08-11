"""Safely audit or migrate the JobImage media library."""

from pathlib import PurePosixPath
from uuid import uuid4

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from PIL import Image

from myappLubd.job_image_processing import optimize_job_image
from myappLubd.models import JobImage


class Command(BaseCommand):
    help = "Audit JobImage files (dry-run by default) or create verified canonical JPEGs"

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write optimized files and update rows')
        parser.add_argument(
            '--delete-originals', action='store_true',
            help='After applying and updating a row, delete superseded unreferenced files',
        )
        parser.add_argument('--find-orphans', action='store_true', help='Report unreferenced files; never deletes them')
        parser.add_argument(
            '--delete-orphans', action='store_true',
            help='Explicitly delete unreferenced files under maintenance_job_images only',
        )

    def handle(self, *args, **options):
        if options['delete_originals'] and not options['apply']:
            raise CommandError('--delete-originals requires --apply')
        orphan_mode = options['find_orphans'] or options['delete_orphans']
        if orphan_mode and (options['apply'] or options['delete_originals']):
            raise CommandError('orphan modes cannot be combined with --apply or --delete-originals')
        if orphan_mode:
            if options['delete_orphans']:
                self.stdout.write(self.style.WARNING(
                    'DESTRUCTIVE orphan deletion: confirm an external media/database backup exists '
                    'and pause JobImage uploads for the duration of this command.'
                ))
            self._find_orphans(delete=options['delete_orphans'])
            return
        if options['apply']:
            self.stdout.write(self.style.WARNING(
                'Apply mode: confirm an external media/database backup exists. '
                'Superseded files are preserved unless --delete-originals is also supplied.'
            ))

        stats = dict(scanned=0, found=0, missing=0, corrupt=0, optimized=0, already=0,
                     current=0, estimated=0, deleted=0)
        counted_paths = set()
        for row in JobImage.objects.iterator(chunk_size=100):
            stats['scanned'] += 1
            if not row.image or not row.image.name:
                stats['missing'] += 1
                self.stderr.write(f'JobImage {row.pk}: no image reference')
                continue
            storage = row.image.storage
            old_image = row.image.name
            if not storage.exists(old_image):
                stats['missing'] += 1
                self.stderr.write(f'JobImage {row.pk}: missing {old_image}')
                continue

            stats['found'] += 1
            for referenced in (old_image, row.jpeg_path):
                if referenced and referenced not in counted_paths:
                    try:
                        stats['current'] += storage.size(referenced)
                        counted_paths.add(referenced)
                    except (OSError, NotImplementedError):
                        pass
            try:
                with storage.open(old_image, 'rb') as source:
                    with Image.open(source) as probe:
                        image_format = probe.format
                        original_size = probe.size
                    source.seek(0)
                    encoded = optimize_job_image(source)
                encoded_size = encoded.getbuffer().nbytes
            except Exception as exc:
                stats['corrupt'] += 1
                self.stderr.write(f'JobImage {row.pk}: corrupt/unprocessable {old_image}: {exc}')
                continue

            canonical = (
                image_format == 'JPEG'
                and max(original_size) <= JobImage.MAX_SIZE[0]
                and row.jpeg_path == old_image
            )
            self.stdout.write(
                f'JobImage {row.pk}: {old_image} {original_size[0]}x{original_size[1]} '
                f'{storage.size(old_image)} bytes'
            )
            if canonical:
                stats['already'] += 1
                stats['estimated'] += storage.size(old_image)
                continue

            stats['optimized'] += 1
            stats['estimated'] += encoded_size
            if not options['apply']:
                continue

            parent = PurePosixPath(old_image).parent
            target = str(parent / f'{PurePosixPath(old_image).stem}-optimized-{uuid4().hex}.jpg')
            new_name = storage.save(target, ContentFile(encoded.getvalue()))
            try:
                with storage.open(new_name, 'rb') as check_file:
                    with Image.open(check_file) as check:
                        check.verify()
                        if check.format != 'JPEG':
                            raise ValueError('verified output is not JPEG')
                with transaction.atomic():
                    locked = JobImage.objects.select_for_update().get(pk=row.pk)
                    if locked.image.name != old_image:
                        raise RuntimeError('image reference changed concurrently')
                    locked.image.name = new_name
                    locked.jpeg_path = new_name
                    locked.save(update_fields=['image', 'jpeg_path'])
            except Exception:
                # This only removes the newly-created, unreferenced staging file.
                storage.delete(new_name)
                raise

            if options['delete_originals']:
                for old_name in {old_image, row.jpeg_path} - {new_name, None, ''}:
                    if not self._is_referenced(old_name) and storage.exists(old_name):
                        storage.delete(old_name)
                        stats['deleted'] += 1

        self._summary(stats, apply=options['apply'])

    @staticmethod
    def _is_referenced(name):
        return JobImage.objects.filter(image=name).exists() or JobImage.objects.filter(jpeg_path=name).exists()

    def _find_orphans(self, *, delete=False):
        storage = JobImage._meta.get_field('image').storage
        prefix = 'maintenance_job_images'
        referenced = set(JobImage.objects.exclude(image='').values_list('image', flat=True))
        referenced.update(JobImage.objects.exclude(jpeg_path__isnull=True).exclude(jpeg_path='').values_list('jpeg_path', flat=True))
        try:
            files = list(self._walk(storage, prefix))
        except (NotImplementedError, OSError) as exc:
            raise CommandError(f'storage does not support orphan enumeration: {exc}') from exc
        orphans = [name for name in files if name not in referenced]
        total = sum(storage.size(name) for name in orphans)
        self.stdout.write(f'Orphan files: {len(orphans)}')
        self.stdout.write(f'Orphan size: {self._size(total)}')
        if not delete:
            self.stdout.write('Dry run: no orphan files were deleted.')
            return

        deleted = 0
        deleted_size = 0
        skipped = 0
        errors = 0
        for name in orphans:
            # Re-query immediately before every deletion. This protects files
            # referenced after the initial snapshot; uploads must still be
            # paused to avoid the storage-write/DB-insert race window.
            if self._is_referenced(name):
                skipped += 1
                continue
            try:
                size = storage.size(name)
                storage.delete(name)
                if storage.exists(name):
                    raise OSError('storage reports the file still exists after deletion')
                deleted += 1
                deleted_size += size
            except Exception as exc:
                errors += 1
                self.stderr.write(f'Failed to delete orphan {name}: {exc}')

        self.stdout.write(f'Orphan files deleted: {deleted}')
        self.stdout.write(f'Orphan bytes reclaimed: {self._size(deleted_size)}')
        self.stdout.write(f'Orphans skipped after reference recheck: {skipped}')
        self.stdout.write(f'Orphan deletion errors: {errors}')

    def _walk(self, storage, directory):
        directories, files = storage.listdir(directory)
        for filename in files:
            yield f'{directory}/{filename}'
        for child in directories:
            yield from self._walk(storage, f'{directory}/{child}')

    def _summary(self, stats, *, apply):
        label = 'Optimized' if apply else 'Would optimize'
        savings = max(0, stats['current'] - stats['estimated'])
        for text in (
            f"JobImage records scanned: {stats['scanned']}",
            f"Files found: {stats['found']}",
            f"Missing files: {stats['missing']}",
            f"Corrupt files: {stats['corrupt']}",
            f"Already optimized: {stats['already']}",
            f"{label}: {stats['optimized']}",
            f"Current referenced size: {self._size(stats['current'])}",
            f"Estimated optimized size: {self._size(stats['estimated'])}",
            f"Estimated savings: {self._size(savings)}",
            f"Superseded files deleted: {stats['deleted']}",
        ):
            self.stdout.write(text)

    @staticmethod
    def _size(value):
        size = float(value)
        for unit in ('B', 'KiB', 'MiB', 'GiB', 'TiB'):
            if size < 1024 or unit == 'TiB':
                return f'{size:.1f} {unit}'
            size /= 1024
