"""Phase A5 regressions for private, tenant-scoped customer media."""

import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Inventory,
    Job,
    JobImage,
    Machine,
    MaintenanceProcedure,
    MaintenanceTaskImage,
    PreventiveMaintenance,
    PreventiveMaintenanceImage,
    Property,
    Tenant,
    TenantMembership,
    WorkspaceReport,
)
from .serializers import (
    InventorySerializer,
    JobImageSerializer,
    MachineSerializer,
    MaintenanceTaskImageSerializer,
    PreventiveMaintenanceDetailSerializer,
    UserProfileSerializer,
)


User = get_user_model()


class ProtectedMediaAuthorizationTests(APITestCase):
    def setUp(self):
        self.media_dir = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(
            MEDIA_ROOT=self.media_dir.name,
            PROTECTED_MEDIA_USE_X_ACCEL=False,
        )
        self.settings_override.enable()

        self.owner_a = User.objects.create_user(username='owner-a')
        self.supervisor_a1 = User.objects.create_user(username='supervisor-a1')
        self.viewer_a1 = User.objects.create_user(username='viewer-a1')
        self.user_b = User.objects.create_user(username='user-b')
        self.staff_only = User.objects.create_user(username='staff-only', is_staff=True)
        self.superuser = User.objects.create_superuser(username='platform-root', email='root@example.com', password='pw')

        self.tenant_a = Tenant.objects.create(name='Media Tenant A')
        self.tenant_b = Tenant.objects.create(name='Media Tenant B')
        self.property_a1 = Property.objects.create(name='Media A1', tenant=self.tenant_a)
        self.property_a2 = Property.objects.create(name='Media A2', tenant=self.tenant_a)
        self.property_b1 = Property.objects.create(name='Media B1', tenant=self.tenant_b)
        TenantMembership.objects.create(user=self.owner_a, tenant=self.tenant_a, role='owner')
        for user, role in ((self.supervisor_a1, 'supervisor'), (self.viewer_a1, 'viewer')):
            membership = TenantMembership.objects.create(user=user, tenant=self.tenant_a, role=role)
            membership.properties.add(self.property_a1)
        membership_b = TenantMembership.objects.create(user=self.user_b, tenant=self.tenant_b, role='viewer')
        membership_b.properties.add(self.property_b1)

        self.job = Job.objects.create(
            user=self.owner_a,
            property=self.property_a1,
            description='media job',
            remarks='',
        )
        self.job_image = JobImage.objects.create(job=self.job, uploaded_by=self.owner_a, image='maintenance_job_images/job.jpg')
        self.machine = Machine.objects.create(name='media machine', property=self.property_a1, image='machine_images/machine.jpg')
        self.pm = PreventiveMaintenance.objects.create(
            pmtitle='media pm', scheduled_date=timezone.now(), created_by=self.owner_a,
            before_image='maintenance_pm_images/before.jpg',
        )
        self.pm.machines.add(self.machine)
        self.pm_image = PreventiveMaintenanceImage.objects.create(
            preventive_maintenance=self.pm,
            image_type='after',
            image='maintenance_pm_images/related.jpg',
            uploaded_by=self.owner_a,
            checksum='a' * 64,
        )
        self.procedure = MaintenanceProcedure.objects.create(name='procedure', description='steps')
        self.procedure.machines.add(self.machine)
        self.task_image = MaintenanceTaskImage.objects.bulk_create([MaintenanceTaskImage(
            task=self.procedure,
            image_type='before',
            image_url='maintenance_task_images/task.jpg',
            uploaded_by=self.owner_a,
        )])[0]
        self.inventory = Inventory.objects.create(
            name='media stock', property=self.property_a1, image='inventory_images/item.jpg'
        )
        self.report = WorkspaceReport.objects.create(
            title='media report', description='report', property=self.property_a1,
            image_1='workspace_reports/report.jpg', created_by=self.owner_a,
        )
        type(self.owner_a.userprofile).objects.filter(pk=self.owner_a.userprofile.pk).update(
            profile_image='profile_images/owner.jpg'
        )
        self.owner_a.userprofile.refresh_from_db()

        self.urls = [
            self.media_url('job-image', self.job_image.pk),
            self.media_url('pm', self.pm.pk, 'before'),
            self.media_url('pm-image', self.pm_image.pk),
            self.media_url('machine', self.machine.pk),
            self.media_url('task-image', self.task_image.pk),
            self.media_url('inventory', self.inventory.pk),
            self.media_url('workspace-report', self.report.pk, 'image-1'),
        ]
        for name in (
            'maintenance_job_images/job.jpg', 'maintenance_pm_images/before.jpg',
            'maintenance_pm_images/related.jpg', 'machine_images/machine.jpg',
            'maintenance_task_images/task.jpg', 'inventory_images/item.jpg',
            'workspace_reports/report.jpg', 'profile_images/owner.jpg',
        ):
            path = Path(self.media_dir.name, name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'private-image')

    def tearDown(self):
        self.settings_override.disable()
        self.media_dir.cleanup()
        super().tearDown()

    @staticmethod
    def media_url(media_type, object_id, variant='image'):
        return reverse('myappLubd:protected-media', kwargs={
            'media_type': media_type,
            'object_id': object_id,
            'variant': variant,
        })

    def assert_all_status(self, user, expected):
        self.client.force_authenticate(user=user)
        for url in self.urls:
            with self.subTest(user=getattr(user, 'username', None), url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, expected)

    def test_authorized_same_property_user_can_read_every_property_media_type(self):
        self.assert_all_status(self.viewer_a1, status.HTTP_200_OK)

    def test_same_tenant_restricted_user_without_property_grant_is_hidden(self):
        membership = TenantMembership.objects.get(user=self.supervisor_a1, tenant=self.tenant_a)
        membership.properties.set([self.property_a2])
        self.assert_all_status(self.supervisor_a1, status.HTTP_404_NOT_FOUND)

    def test_cross_tenant_id_enumeration_is_hidden_for_every_media_type(self):
        self.assert_all_status(self.user_b, status.HTTP_404_NOT_FOUND)

    def test_anonymous_is_denied_for_every_media_type(self):
        self.assert_all_status(None, status.HTTP_403_FORBIDDEN)

    def test_is_staff_without_membership_has_no_bypass(self):
        self.assert_all_status(self.staff_only, status.HTTP_404_NOT_FOUND)

    def test_superuser_break_glass_can_read_every_property_media_type(self):
        self.assert_all_status(self.superuser, status.HTTP_200_OK)

    def test_profile_visibility_is_self_or_shared_property_only(self):
        url = self.media_url('profile', self.owner_a.userprofile.pk)
        for user, expected in (
            (self.owner_a, 200), (self.viewer_a1, 200), (self.user_b, 404),
            (self.staff_only, 404), (self.superuser, 200),
        ):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user=user)
                self.assertEqual(self.client.get(url).status_code, expected)

    def test_missing_record_and_missing_file_are_controlled_404s(self):
        self.client.force_authenticate(self.viewer_a1)
        self.assertEqual(self.client.get(self.media_url('job-image', 999999)).status_code, 404)
        Path(self.media_dir.name, self.job_image.image.name).unlink()
        response = self.client.get(self.media_url('job-image', self.job_image.pk))
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(self.media_dir.name.encode(), response.content)

    def test_path_traversal_and_symlink_escape_are_rejected(self):
        outside = Path(self.media_dir.name).parent / 'a5-outside.jpg'
        outside.write_bytes(b'outside')
        self.addCleanup(lambda: outside.unlink(missing_ok=True))
        JobImage.objects.filter(pk=self.job_image.pk).update(image='../a5-outside.jpg')
        self.client.force_authenticate(self.viewer_a1)
        self.assertEqual(self.client.get(self.media_url('job-image', self.job_image.pk)).status_code, 404)

        link = Path(self.media_dir.name, 'machine_images/escape.jpg')
        link.symlink_to(outside)
        Machine.objects.filter(pk=self.machine.pk).update(image='machine_images/escape.jpg')
        self.assertEqual(self.client.get(self.media_url('machine', self.machine.pk)).status_code, 404)

    def test_tenantless_and_ambiguous_ownership_fail_closed(self):
        tenantless = Inventory.objects.create(name='legacy tenantless', image='inventory_images/item.jpg')
        legacy_property = Property.objects.create(name='legacy property without tenant')
        tenantless_machine = Machine.objects.create(
            name='legacy tenantless machine', property=legacy_property, image='machine_images/machine.jpg'
        )
        other_machine = Machine.objects.create(name='other machine', property=self.property_a2)
        self.pm.machines.add(other_machine)
        self.procedure.machines.add(other_machine)
        self.client.force_authenticate(self.superuser)
        for url in (
            self.media_url('inventory', tenantless.pk),
            self.media_url('machine', tenantless_machine.pk),
            self.media_url('pm', self.pm.pk, 'before'),
            self.media_url('task-image', self.task_image.pk),
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    @override_settings(PROTECTED_MEDIA_USE_X_ACCEL=True)
    def test_production_response_uses_private_internal_acceleration(self):
        self.client.force_authenticate(self.viewer_a1)
        response = self.client.get(self.media_url('job-image', self.job_image.pk))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['X-Accel-Redirect'], '/_protected_media/maintenance_job_images/job.jpg')
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertNotIn('Access-Control-Allow-Origin', response)

    def test_serializers_emit_only_protected_application_urls(self):
        payloads = (
            JobImageSerializer(self.job_image).data,
            MachineSerializer(self.machine).data,
            PreventiveMaintenanceDetailSerializer(self.pm).data,
            MaintenanceTaskImageSerializer(self.task_image).data,
            InventorySerializer(self.inventory).data,
            UserProfileSerializer(self.owner_a.userprofile).data,
        )
        for payload in payloads:
            with self.subTest(payload=payload):
                rendered = str(payload)
                self.assertIn('/api/protected-media/', rendered)
                self.assertNotIn('/media/', rendered.replace('/api/protected-media/', ''))

    def test_legacy_django_static_media_path_is_closed(self):
        self.assertEqual(self.client.get('/media/maintenance_job_images/job.jpg').status_code, 404)
