import os
import tempfile
from io import BytesIO, StringIO

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from PIL import Image

from .models import Job, JobImage


class JobImageTestMixin:
    def setUp(self):
        super().setUp()
        self.media = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        user = get_user_model().objects.create_user(username='image-test')
        self.job = Job.objects.create(user=user, updated_by=user, description='test', remarks='')
        self.user = user

    def tearDown(self):
        self.settings_override.disable()
        self.media.cleanup()
        super().tearDown()

    @staticmethod
    def upload(size, mode='RGB', fmt='PNG', color=None, exif=None, name='evidence.png'):
        color = color or ((10, 20, 30, 0) if mode == 'RGBA' else (10, 20, 30))
        image = Image.new(mode, size, color)
        data = BytesIO()
        image.save(data, fmt, exif=exif)
        return SimpleUploadedFile(name, data.getvalue(), content_type=f'image/{fmt.lower()}')

    def create_image(self, upload):
        return JobImage.objects.create(job=self.job, uploaded_by=self.user, image=upload)


class JobImageUploadTests(JobImageTestMixin, TestCase):
    def assert_stored(self, row, size):
        self.assertTrue(row.image.name.endswith('.jpg'))
        self.assertEqual(row.jpeg_path, row.image.name)
        with row.image.storage.open(row.image.name, 'rb') as stored:
            with Image.open(stored) as image:
                self.assertEqual(image.format, 'JPEG')
                self.assertEqual(image.size, size)
        files = [os.path.join(root, name) for root, _, names in os.walk(self.media.name) for name in names]
        self.assertEqual(files, [row.image.path])

    def test_large_landscape_is_single_optimized_jpeg(self):
        self.assert_stored(self.create_image(self.upload((4032, 3024))), (1600, 1200))

    def test_portrait_preserves_aspect_ratio(self):
        self.assert_stored(self.create_image(self.upload((3024, 4032))), (1200, 1600))

    def test_small_image_is_not_upscaled(self):
        self.assert_stored(self.create_image(self.upload((800, 600))), (800, 600))

    def test_transparency_is_composited_on_white(self):
        row = self.create_image(self.upload((20, 20), mode='RGBA'))
        with Image.open(row.image.path) as image:
            pixel = image.getpixel((10, 10))
        self.assertTrue(all(channel > 245 for channel in pixel))

    def test_exif_orientation_is_normalized(self):
        exif = Image.Exif()
        exif[274] = 6
        row = self.create_image(self.upload((80, 40), fmt='JPEG', exif=exif, name='rotated.jpeg'))
        self.assert_stored(row, (40, 80))

    def test_metadata_save_does_not_rewrite_image(self):
        row = self.create_image(self.upload((100, 50)))
        name, modified = row.image.name, os.path.getmtime(row.image.path)
        row.jpeg_path = row.image.name
        row.save(update_fields=['jpeg_path'])
        self.assertEqual(row.image.name, name)
        self.assertEqual(os.path.getmtime(row.image.path), modified)

    def test_replacement_is_optimized_once(self):
        row = self.create_image(self.upload((100, 50)))
        old_name = row.image.name
        row.image = self.upload((2000, 1000), name='replacement.webp')
        row.save()
        self.assertNotEqual(row.image.name, old_name)
        with Image.open(row.image.path) as image:
            self.assertEqual(image.size, (1600, 800))
        replacement_name = row.image.name
        row.save()
        self.assertEqual(row.image.name, replacement_name)


class OptimizeJobImagesCommandTests(JobImageTestMixin, TestCase):
    def test_dry_run_does_not_modify_row_or_file(self):
        row = self.create_image(self.upload((100, 50)))
        JobImage.objects.filter(pk=row.pk).update(jpeg_path='legacy-copy.jpg')
        before = set(os.listdir(os.path.dirname(row.image.path)))
        call_command('optimize_job_images', stdout=StringIO())
        row.refresh_from_db()
        self.assertEqual(row.jpeg_path, 'legacy-copy.jpg')
        self.assertEqual(set(os.listdir(os.path.dirname(row.image.path))), before)

    def test_apply_writes_verified_file_and_updates_both_references(self):
        row = self.create_image(self.upload((100, 50)))
        JobImage.objects.filter(pk=row.pk).update(jpeg_path='legacy-copy.jpg')
        call_command('optimize_job_images', '--apply', stdout=StringIO())
        row.refresh_from_db()
        self.assertEqual(row.jpeg_path, row.image.name)
        with Image.open(row.image.path) as image:
            self.assertEqual(image.format, 'JPEG')

    def test_missing_and_corrupt_files_are_reported_without_crashing(self):
        missing = self.create_image(self.upload((20, 20)))
        missing.image.storage.delete(missing.image.name)
        corrupt = self.create_image(self.upload((20, 20)))
        with open(corrupt.image.path, 'wb') as output:
            output.write(b'not an image')
        stdout, stderr = StringIO(), StringIO()
        call_command('optimize_job_images', stdout=stdout, stderr=stderr)
        self.assertIn('Missing files: 1', stdout.getvalue())
        self.assertIn('Corrupt files: 1', stdout.getvalue())

    def test_canonical_image_is_skipped(self):
        row = self.create_image(self.upload((20, 20)))
        original = row.image.name
        call_command('optimize_job_images', '--apply', stdout=StringIO())
        row.refresh_from_db()
        self.assertEqual(row.image.name, original)

    def test_find_orphans_is_non_destructive(self):
        row = self.create_image(self.upload((20, 20)))
        orphan = row.image.storage.save(
            'maintenance_job_images/orphan.jpg', ContentFile(b'orphan')
        )
        stdout = StringIO()
        call_command('optimize_job_images', '--find-orphans', stdout=stdout)
        self.assertTrue(row.image.storage.exists(orphan))
        self.assertIn('Orphan files: 1', stdout.getvalue())
        self.assertIn('Dry run: no orphan files were deleted.', stdout.getvalue())

    def test_delete_orphans_requires_explicit_flag_and_preserves_references(self):
        row = self.create_image(self.upload((20, 20)))
        orphan = row.image.storage.save(
            'maintenance_job_images/orphan.jpg', ContentFile(b'orphan')
        )
        stdout = StringIO()
        call_command('optimize_job_images', '--delete-orphans', stdout=stdout)
        self.assertFalse(row.image.storage.exists(orphan))
        self.assertTrue(row.image.storage.exists(row.image.name))
        self.assertIn('Orphan files deleted: 1', stdout.getvalue())
