"""Authorization, capacity, optimization, and lifecycle tests for PM evidence."""

from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Job,
    Machine,
    PreventiveMaintenance,
    PreventiveMaintenanceImage,
    Property,
    Tenant,
    TenantMembership,
)


User = get_user_model()


class PreventiveMaintenanceImageTests(APITestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.media.cleanup)

        self.tenant = Tenant.objects.create(name='PM image tenant')
        self.property_a = Property.objects.create(name='PM image property A', tenant=self.tenant)
        self.property_b = Property.objects.create(name='PM image property B', tenant=self.tenant)

        self.operator = User.objects.create_user(username='pm-image-operator', password='pw12345!')
        operator_membership = TenantMembership.objects.create(
            user=self.operator,
            tenant=self.tenant,
            role='technician',
        )
        operator_membership.properties.add(self.property_a)

        self.viewer = User.objects.create_user(username='pm-image-viewer', password='pw12345!')
        viewer_membership = TenantMembership.objects.create(
            user=self.viewer,
            tenant=self.tenant,
            role='viewer',
        )
        viewer_membership.properties.add(self.property_a)

        self.machine_a = Machine.objects.create(
            machine_id='PM-IMAGE-MACHINE-A',
            name='PM image machine A',
            property=self.property_a,
        )
        self.machine_b = Machine.objects.create(
            machine_id='PM-IMAGE-MACHINE-B',
            name='PM image machine B',
            property=self.property_b,
        )
        self.pm = self._make_pm('Image PM', [self.machine_a])
        self.foreign_pm = self._make_pm('Foreign image PM', [self.machine_b])

    def _make_pm(self, title, machines, **overrides):
        values = {
            'pmtitle': title,
            'scheduled_date': timezone.now(),
            'created_by': self.operator,
        }
        values.update(overrides)
        pm = PreventiveMaintenance.objects.create(**values)
        pm.machines.set(machines)
        return pm

    def _image(self, name='image.jpg', size=(80, 40), color=(20, 80, 140), fmt='JPEG'):
        output = BytesIO()
        Image.new('RGB', size, color).save(output, format=fmt)
        content_type = {
            'JPEG': 'image/jpeg',
            'PNG': 'image/png',
            'GIF': 'image/gif',
            'WEBP': 'image/webp',
            'BMP': 'image/bmp',
        }[fmt]
        return SimpleUploadedFile(name, output.getvalue(), content_type=content_type)

    def _detail_url(self, pm=None, property_obj=None):
        pm = pm or self.pm
        property_obj = property_obj or self.property_a
        return f'/api/v1/preventive-maintenance/{pm.pm_id}/?property_id={property_obj.property_id}'

    def _upload_url(self, pm=None, property_obj=None):
        pm = pm or self.pm
        property_obj = property_obj or self.property_a
        return f'/api/v1/preventive-maintenance/{pm.pm_id}/upload-images/?property_id={property_obj.property_id}'

    def _compatibility_upload_url(self, pm=None, property_obj=None):
        pm = pm or self.pm
        property_obj = property_obj or self.property_a
        return f'/api/v1/preventive-maintenance/{pm.pm_id}/upload_images/?property_id={property_obj.property_id}'

    def _upload(self, image_type, images, pm=None, property_obj=None):
        return self.client.post(
            self._upload_url(pm, property_obj),
            {'image_type': image_type, 'images': images},
            format='multipart',
        )

    def _create_evidence(self, image_type='before', color=(20, 80, 140), pm=None):
        return PreventiveMaintenanceImage.objects.create(
            preventive_maintenance=pm or self.pm,
            image_type=image_type,
            image=self._image(color=color),
            uploaded_by=self.operator,
        )

    def test_authorized_detail_returns_canonical_images_and_counts(self):
        image = self._create_evidence()
        self.client.force_authenticate(self.operator)

        response = self.client.get(self._detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['property_id'], self.property_a.property_id)
        self.assertEqual(response.data['images'][0]['id'], image.pk)
        self.assertEqual(response.data['images'][0]['image_type'], 'before')
        self.assertEqual(response.data['image_counts']['total'], 1)
        self.assertTrue(response.data['can_operate'])

    def test_unauthorized_property_cannot_read_images(self):
        self._create_evidence()
        self.client.force_authenticate(self.operator)

        response = self.client.get(self._detail_url(self.pm, self.property_b))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_viewer_can_read_images_with_false_capability(self):
        self._create_evidence()
        self.client.force_authenticate(self.viewer)

        response = self.client.get(self._detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['can_operate'])
        self.assertEqual(response.data['image_counts']['total'], 1)

    def test_viewer_cannot_upload(self):
        self.client.force_authenticate(self.viewer)
        response = self._upload('before', [self._image()])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(PreventiveMaintenanceImage.objects.exists())

    def test_operator_can_upload_before_image(self):
        self.client.force_authenticate(self.operator)
        response = self._upload('before', [self._image()])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data['image_counts']['before'], 1)
        self.assertEqual(PreventiveMaintenanceImage.objects.get().image_type, 'before')

    def test_operator_can_upload_after_image(self):
        self.client.force_authenticate(self.operator)
        response = self._upload('after', [self._image()])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data['image_counts']['after'], 1)

    def test_compatibility_upload_route_uses_canonical_pipeline(self):
        self.client.force_authenticate(self.operator)
        response = self.client.post(
            self._compatibility_upload_url(),
            {'before_image': self._image()},
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data['image_counts']['before'], 1)
        self.assertEqual(PreventiveMaintenanceImage.objects.count(), 1)

    def test_completion_after_image_uses_canonical_optimized_gallery(self):
        self.client.force_authenticate(self.operator)
        response = self.client.post(
            f'/api/v1/preventive-maintenance/{self.pm.pm_id}/complete/',
            {'after_image': self._image(size=(2400, 1200))},
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        evidence = PreventiveMaintenanceImage.objects.get(preventive_maintenance=self.pm)
        self.assertEqual(evidence.image_type, 'after')
        with Image.open(evidence.image.path) as stored:
            self.assertEqual(stored.size, (1600, 800))
        self.pm.refresh_from_db()
        self.assertFalse(self.pm.after_image)
        self.assertIsNotNone(self.pm.completed_date)

    def test_completion_image_cannot_exceed_global_limit(self):
        for index in range(10):
            self._create_evidence(color=(index * 20, 220 - index * 15, 40 + index * 10))
        self.client.force_authenticate(self.operator)
        response = self.client.post(
            f'/api/v1/preventive-maintenance/{self.pm.pm_id}/complete/',
            {'after_image': self._image(color=(200, 100, 50))},
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PreventiveMaintenanceImage.objects.filter(preventive_maintenance=self.pm).count(), 10)
        self.pm.refresh_from_db()
        self.assertIsNone(self.pm.completed_date)

    def test_completion_rejects_malformed_image_before_state_change(self):
        self.client.force_authenticate(self.operator)
        response = self.client.post(
            f'/api/v1/preventive-maintenance/{self.pm.pm_id}/complete/',
            {'after_image': SimpleUploadedFile('broken.jpg', b'broken', content_type='image/jpeg')},
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.pm.refresh_from_db()
        self.assertIsNone(self.pm.completed_date)
        self.assertFalse(PreventiveMaintenanceImage.objects.exists())

    def test_total_of_ten_images_is_allowed(self):
        self.client.force_authenticate(self.operator)
        images = [
            self._image(name=f'{index}.jpg', color=(index * 20, 200 - index * 15, 30 + index * 10))
            for index in range(10)
        ]
        response = self._upload('before', images)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data['image_counts']['total'], 10)
        self.assertEqual(response.data['image_counts']['remaining'], 0)

    def test_eleventh_image_is_rejected(self):
        for index in range(10):
            self._create_evidence(color=(index * 20, 220 - index * 15, 40 + index * 10))
        self.client.force_authenticate(self.operator)
        response = self._upload('after', [self._image(color=(200, 100, 50))])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PreventiveMaintenanceImage.objects.count(), 10)

    def test_batch_that_would_exceed_ten_is_rejected_atomically(self):
        for index in range(9):
            self._create_evidence(color=(index * 20, 210 - index * 15, 50 + index * 10))
        self.client.force_authenticate(self.operator)
        response = self._upload('after', [
            self._image('one.jpg', color=(150, 10, 20)),
            self._image('two.jpg', color=(160, 10, 20)),
        ])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PreventiveMaintenanceImage.objects.count(), 9)

    def test_malformed_image_is_rejected(self):
        self.client.force_authenticate(self.operator)
        malformed = SimpleUploadedFile('broken.jpg', b'not-an-image', content_type='image/jpeg')
        response = self._upload('before', [malformed])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PreventiveMaintenanceImage.objects.exists())

    def test_oversized_dimensions_are_resized(self):
        self.client.force_authenticate(self.operator)
        response = self._upload('before', [self._image(size=(2400, 1200))])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        with Image.open(PreventiveMaintenanceImage.objects.get().image.path) as stored:
            self.assertEqual(stored.size, (1600, 800))
            self.assertEqual(stored.format, 'JPEG')

    def test_small_image_is_not_upscaled(self):
        self.client.force_authenticate(self.operator)
        self._upload('before', [self._image(size=(120, 70))])
        with Image.open(PreventiveMaintenanceImage.objects.get().image.path) as stored:
            self.assertEqual(stored.size, (120, 70))

    def test_resize_preserves_aspect_ratio(self):
        self.client.force_authenticate(self.operator)
        self._upload('after', [self._image(size=(3000, 1000))])
        with Image.open(PreventiveMaintenanceImage.objects.get().image.path) as stored:
            self.assertEqual(stored.size, (1600, 533))

    def test_valid_multi_image_upload_persists_every_image(self):
        self.client.force_authenticate(self.operator)
        response = self._upload('after', [
            self._image('a.jpg', color=(10, 10, 10)),
            self._image('b.jpg', color=(20, 20, 20)),
            self._image('c.jpg', color=(30, 30, 30)),
        ])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(PreventiveMaintenanceImage.objects.count(), 3)
        self.assertEqual(response.data['image_counts']['after'], 3)

    def test_failed_mixed_batch_leaves_no_partial_database_state(self):
        self.client.force_authenticate(self.operator)
        response = self._upload('before', [
            self._image('valid.jpg'),
            SimpleUploadedFile('broken.jpg', b'broken', content_type='image/jpeg'),
        ])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PreventiveMaintenanceImage.objects.exists())

    def test_authorized_operator_can_delete_individual_image(self):
        image = self._create_evidence()
        self.client.force_authenticate(self.operator)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(
                f'/api/v1/preventive-maintenance/{self.pm.pm_id}/images/{image.pk}/'
                f'?property_id={self.property_a.property_id}'
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertFalse(PreventiveMaintenanceImage.objects.filter(pk=image.pk).exists())
        self.assertEqual(response.data['image_counts']['total'], 0)

    def test_viewer_cannot_delete_image(self):
        image = self._create_evidence()
        self.client.force_authenticate(self.viewer)
        response = self.client.delete(
            f'/api/v1/preventive-maintenance/{self.pm.pm_id}/images/{image.pk}/'
            f'?property_id={self.property_a.property_id}'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(PreventiveMaintenanceImage.objects.filter(pk=image.pk).exists())

    def test_property_switch_isolates_detail_and_image_mutations(self):
        image = self._create_evidence(pm=self.foreign_pm)
        self.client.force_authenticate(self.operator)
        detail = self.client.get(self._detail_url(self.foreign_pm, self.property_a))
        deletion = self.client.delete(
            f'/api/v1/preventive-maintenance/{self.foreign_pm.pm_id}/images/{image.pk}/'
            f'?property_id={self.property_a.property_id}'
        )
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(deletion.status_code, status.HTTP_404_NOT_FOUND)

    def test_mixed_property_pm_is_hidden(self):
        mixed = self._make_pm('Mixed PM', [self.machine_a, self.machine_b])
        self.client.force_authenticate(self.operator)
        response = self.client.get(self._detail_url(mixed, self.property_a))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_image_count_remains_correct_after_delete(self):
        before = self._create_evidence('before', (10, 30, 50))
        self._create_evidence('before', (90, 120, 150))
        self._create_evidence('after', (180, 210, 240))
        self.client.force_authenticate(self.operator)
        response = self.client.delete(
            f'/api/v1/preventive-maintenance/{self.pm.pm_id}/images/{before.pk}/'
            f'?property_id={self.property_a.property_id}'
        )
        self.assertEqual(response.data['image_counts'], {
            'before': 1,
            'after': 1,
            'total': 2,
            'remaining': 8,
            'limit': 10,
        })

    def test_duplicate_images_are_rejected(self):
        self.client.force_authenticate(self.operator)
        response = self._upload('before', [
            self._image('first.jpg', color=(99, 88, 77)),
            self._image('second.jpg', color=(99, 88, 77)),
        ])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PreventiveMaintenanceImage.objects.exists())

    def test_upload_byte_limit_is_enforced_before_decoding(self):
        self.client.force_authenticate(self.operator)
        oversized = SimpleUploadedFile(
            'oversized.jpg',
            b'x' * (20 * 1024 * 1024 + 1),
            content_type='image/jpeg',
        )
        response = self._upload('before', [oversized])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PreventiveMaintenanceImage.objects.exists())

    def test_unsafe_pixel_dimensions_are_rejected(self):
        self.client.force_authenticate(self.operator)
        with patch('myappLubd.job_image_processing.Image.MAX_IMAGE_PIXELS', 100):
            response = self._upload('before', [self._image(size=(20, 20))])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PreventiveMaintenanceImage.objects.exists())

    def test_storage_failure_cleans_files_and_rolls_back_rows(self):
        self.client.force_authenticate(self.operator)
        original_save = PreventiveMaintenanceImage.save
        calls = {'count': 0}

        def fail_second_save(instance, *args, **kwargs):
            calls['count'] += 1
            if calls['count'] == 2:
                raise OSError('simulated storage failure')
            return original_save(instance, *args, **kwargs)

        self.client.raise_request_exception = False
        with patch.object(PreventiveMaintenanceImage, 'save', fail_second_save):
            response = self._upload('before', [
                self._image('first.jpg', color=(2, 3, 4)),
                self._image('second.jpg', color=(5, 6, 7)),
            ])

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertFalse(PreventiveMaintenanceImage.objects.exists())
        stored_files = [path for path in Path(self.media.name).rglob('*') if path.is_file()]
        self.assertEqual(stored_files, [])

    def test_job_machine_property_conflict_is_hidden(self):
        job = Job.objects.create(
            user=self.operator,
            updated_by=self.operator,
            property=self.property_a,
            description='Conflicting PM job',
            remarks='',
        )
        conflicting = self._make_pm('Conflicting PM', [self.machine_b], job=job)
        self.client.force_authenticate(self.operator)
        response = self.client.get(self._detail_url(conflicting, self.property_a))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_legacy_images_are_explicit_and_count_toward_limit(self):
        self.pm.before_image = self._image('legacy.jpg')
        self.pm.save(update_fields=['before_image', 'updated_at'])
        self.client.force_authenticate(self.operator)
        response = self.client.get(self._detail_url())
        self.assertEqual(response.data['images'][0]['id'], 'legacy-before')
        self.assertTrue(response.data['images'][0]['is_legacy'])
        self.assertEqual(response.data['image_counts']['total'], 1)
