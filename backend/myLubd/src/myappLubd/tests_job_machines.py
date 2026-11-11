"""Production machine work orders and authenticated PDF downloads."""
import json
import tempfile
from io import BytesIO
from datetime import datetime, timezone as datetime_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from .models import Job, JobDocument, Machine, MaintenanceProcedure, PMMasterPlan, PreventiveMaintenance, Property, Room, Tenant, TenantMembership
from .tenancy import get_tenant_storage_usage_bytes
from .test_plan_helpers import use_canonical_plan


class JobMachineTests(APITestCase):
    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.media.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.tenant = Tenant.objects.create(name='Machine work tenant')
        use_canonical_plan(self.tenant, 'pro')
        self.property = Property.objects.create(name='Machine hotel', tenant=self.tenant)
        self.other = Property.objects.create(name='Other hotel', tenant=self.tenant)
        self.user = get_user_model().objects.create_user(username='machine-operator')
        self.viewer = get_user_model().objects.create_user(username='machine-viewer')
        for user, role in ((self.user, 'supervisor'), (self.viewer, 'viewer')):
            membership = TenantMembership.objects.create(tenant=self.tenant, user=user, role=role)
            membership.properties.add(self.property)
        self.machine = Machine.objects.create(property=self.property, name='Water Pump', machine_id='PUMP-001')
        self.foreign_machine = Machine.objects.create(property=self.other, name='Foreign pump', machine_id='OTHER-001')
        self.client.force_authenticate(self.user)

    @staticmethod
    def pdf(name='inspection.pdf', content=b'%PDF-1.7\ninspection\n%%EOF'):
        return SimpleUploadedFile(name, content, content_type='application/pdf')

    def create_job(self, category='Repair', **overrides):
        image = BytesIO()
        Image.new('RGB', (2, 2), 'white').save(image, format='PNG')
        payload = {
            'property_id': self.property.property_id,
            'machine_id': self.machine.machine_id,
            'description': 'Inspect water pump', 'remarks': '',
            'status': 'pending', 'priority': 'medium',
            'topic_data': json.dumps({'title': category, 'description': ''}),
            'before_images': SimpleUploadedFile('before.png', image.getvalue(), content_type='image/png'),
            **overrides,
        }
        return self.client.post('/api/v1/jobs/', payload, format='multipart')

    def test_create_and_read_machine_job_with_private_documents(self):
        response = self.create_job(documents=[self.pdf()])
        self.assertEqual(response.status_code, 201, response.data)
        job = Job.objects.get(job_id=response.data['job_id'])
        self.assertEqual(job.machine, self.machine)
        self.assertFalse(job.rooms.exists())
        self.assertIsNone(job.area)
        self.assertTrue(job.is_defective)
        self.assertFalse(job.is_preventivemaintenance)
        self.assertEqual(response.data['machine']['machine_id'], self.machine.machine_id)
        document = job.documents.get()
        self.assertEqual(response.data['documents'][0]['name'], 'inspection.pdf')
        self.assertNotIn('/media/', response.data['documents'][0]['url'])
        download = self.client.get(f'/api/v1/jobs/{job.job_id}/documents/{document.pk}/')
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b''.join(download.streaming_content), b'%PDF-1.7\ninspection\n%%EOF')
        # Consuming streaming_content closes the response through Django's
        # test-client iterator. Closing it again would close the connection
        # inside APITestCase's transaction.
        self.assertGreaterEqual(get_tenant_storage_usage_bytes(self.tenant), document.size)
        dashboard = self.client.get('/api/v1/jobs/dashboard/', {'property_id': self.property.property_id})
        self.assertEqual(dashboard.status_code, 200, dashboard.data)
        self.assertEqual(dashboard.data['results'][0]['machine']['name'], 'Water Pump')

    @override_settings(DEBUG=True)
    def test_pdf_cannot_be_downloaded_as_public_media(self):
        response = self.create_job(documents=[self.pdf()])
        self.assertEqual(response.status_code, 201, response.data)
        document = JobDocument.objects.get()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/media/' + document.file.name).status_code, 404)

    def test_patch_preserves_machine_and_documents(self):
        response = self.create_job(documents=[self.pdf()])
        self.assertEqual(response.status_code, 201, response.data)
        update = self.client.patch(f"/api/v1/jobs/{response.data['job_id']}/", {'remarks': 'Checked pump'}, format='json')
        self.assertEqual(update.status_code, 200, update.data)
        self.assertEqual(update.data['machine']['machine_id'], self.machine.machine_id)
        self.assertEqual(len(update.data['documents']), 1)
        self.assertTrue(update.data['is_defective'])

    def test_search_matches_machine_name_and_id(self):
        response = self.create_job()
        self.assertEqual(response.status_code, 201, response.data)
        for term in ('Water Pump', 'PUMP-001'):
            result = self.client.get('/api/v1/jobs/dashboard/', {'property_id': self.property.property_id, 'search': term})
            self.assertEqual(result.status_code, 200, result.data)
            self.assertEqual(result.data['count'], 1)

    def test_rejects_foreign_and_unknown_machines(self):
        for machine_id in (self.foreign_machine.machine_id, 'missing'):
            response = self.create_job(machine_id=machine_id)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Job.objects.exists())

    def test_rejects_machine_with_room_or_area(self):
        room = Room.objects.create(property=self.property, name='101', room_type='Standard')
        response = self.create_job(room_id=room.room_id)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Job.objects.exists())

    def test_rejects_invalid_machine_work_category(self):
        response = self.create_job(category='PMMs Rooms')
        self.assertEqual(response.status_code, 400, response.data)

    def test_pm_category_controls_flags(self):
        response = self.create_job(category='Preventive Monthly', is_defective='true', is_preventivemaintenance='false')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['is_preventivemaintenance'])
        self.assertFalse(response.data['is_defective'])

    def test_pm_template_requires_linked_machine_and_pm_category(self):
        template = MaintenanceProcedure.objects.create(name='Pump PM', description='Inspect pump')
        template.machines.add(self.machine)
        other_machine = Machine.objects.create(
            property=self.property, name='Second pump', machine_id='PUMP-002',
        )
        room = Room.objects.create(property=self.property, name='102', room_type='Standard')
        for overrides in (
            {'category': 'Repair'},
            {'category': 'PM', 'machine_id': other_machine.machine_id},
            {'category': 'Electrical', 'machine_id': '', 'room_id': room.room_id},
        ):
            response = self.create_job(procedure_template=template.pk, **overrides)
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('procedure_template', response.data)
        self.assertFalse(Job.objects.exists())

        response = self.create_job(category='PM', procedure_template=template.pk)
        self.assertEqual(response.status_code, 201, response.data)
        job = Job.objects.get(job_id=response.data['job_id'])
        self.assertEqual(job.procedure_template, template)
        url = f'/api/v1/jobs/{job.job_id}/'
        update = self.client.patch(url, {'remarks': 'Inspected'}, format='json')
        self.assertEqual(update.status_code, 200, update.data)
        self.assertEqual(update.data['procedure_template'], template.pk)
        update = self.client.patch(url, {'machine_id': other_machine.machine_id}, format='json')
        self.assertEqual(update.status_code, 400, update.data)
        update = self.client.patch(url, {
            'topic_data': {'title': 'Repair', 'description': ''},
        }, format='json')
        self.assertEqual(update.status_code, 400, update.data)
        update = self.client.patch(url, {
            'topic_data': {'title': 'Repair', 'description': ''},
            'procedure_template': None,
        }, format='json')
        self.assertEqual(update.status_code, 200, update.data)
        self.assertIsNone(update.data['procedure_template'])

    def test_validates_pdf_signature_size_extension_and_count_before_saving(self):
        cases = [
            [self.pdf(content=b'not a PDF')],
            [self.pdf(name='inspection.exe')],
            [self.pdf(content=b'%PDF-' + b'x' * (2 * 1024 * 1024))],
            [self.pdf(f'{i}.pdf') for i in range(4)],
        ]
        for documents in cases:
            response = self.create_job(documents=documents)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(JobDocument.objects.exists())
        self.assertFalse(Job.objects.exists())

    def test_accepts_three_pdfs(self):
        response = self.create_job(documents=[self.pdf(f'{i}.pdf') for i in range(3)])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data['documents']), 3)

    def test_room_jobs_cannot_attach_machine_documents(self):
        room = Room.objects.create(property=self.property, name='101', room_type='Standard')
        response = self.create_job(category='Electrical', machine_id='', room_id=room.room_id, documents=[self.pdf()])
        self.assertEqual(response.status_code, 400, response.data)

    def test_viewer_cannot_create(self):
        self.client.force_authenticate(self.viewer)
        response = self.create_job()
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(Job.objects.exists())

    def test_document_download_requires_job_access_and_matches_job(self):
        response = self.create_job(documents=[self.pdf()])
        self.assertEqual(response.status_code, 201, response.data)
        job_id = response.data['job_id']
        document_id = response.data['documents'][0]['id']
        url = f'/api/v1/jobs/{job_id}/documents/{document_id}/'
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(url).status_code, (401, 403))
        outsider = get_user_model().objects.create_user(username='outsider')
        member = TenantMembership.objects.create(user=outsider, tenant=self.tenant, role='supervisor')
        member.properties.add(self.other)
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(url, {'property_id': self.other.property_id}).status_code, 404)
        second = self.create_job()
        self.assertEqual(self.client.get(f"/api/v1/jobs/{second.data['job_id']}/documents/{document_id}/").status_code, 404)

    def test_completed_pm_with_documents_and_photos_calculates_next_date(self):
        template = MaintenanceProcedure.objects.create(
            name='Monthly pump inspection', description='Check pump', frequency='monthly',
        )
        template.machines.add(self.machine)
        response = self.create_job(category='PM', procedure_template=template.pk, documents=[self.pdf()])
        self.assertEqual(response.status_code, 201, response.data)
        job = Job.objects.get(job_id=response.data['job_id'])
        self.assertEqual(job.documents.count(), 1)
        self.assertEqual(job.job_images.count(), 1)
        self.assertIsNone(self.machine.get_next_maintenance_date())
        completed_at = datetime(2028, 1, 31, 10, tzinfo=datetime_timezone.utc)
        Job.objects.filter(pk=job.pk).update(status='completed', completed_at=completed_at)
        expected = datetime(2028, 2, 29, 10, tzinfo=datetime_timezone.utc)
        self.assertEqual(self.machine.get_next_maintenance_date(), expected)
        # A later edit and a later repair do not shift this PM's due date.
        update = self.client.patch(f'/api/v1/jobs/{job.job_id}/', {'remarks': 'Updated notes'}, format='json')
        self.assertEqual(update.status_code, 200, update.data)
        repair = self.create_job(status='completed')
        self.assertEqual(repair.status_code, 201, repair.data)
        self.assertEqual(self.machine.get_next_maintenance_date(), expected)
        # Retain overdue dates, and advance only after a newer PM completion.
        second = self.create_job(category='PM', procedure_template=template.pk)
        self.assertEqual(second.status_code, 201, second.data)
        Job.objects.filter(job_id=second.data['job_id']).update(
            status='completed', completed_at=datetime(2028, 2, 29, 10, tzinfo=datetime_timezone.utc),
        )
        self.assertEqual(self.machine.get_next_maintenance_date(), datetime(2028, 3, 29, 10, tzinfo=datetime_timezone.utc))

    def test_machine_pm_dates_are_tracked_per_template(self):
        for name, frequency, completed_at in (
            ('Annual inspection', 'annual', datetime(2028, 1, 31, tzinfo=datetime_timezone.utc)),
            ('Weekly check', 'weekly', datetime(2028, 2, 1, tzinfo=datetime_timezone.utc)),
        ):
            template = MaintenanceProcedure.objects.create(name=name, description=name, frequency=frequency)
            template.machines.add(self.machine)
            response = self.create_job(category='PM', procedure_template=template.pk)
            self.assertEqual(response.status_code, 201, response.data)
            Job.objects.filter(job_id=response.data['job_id']).update(status='completed', completed_at=completed_at)
        self.assertEqual(self.machine.get_next_maintenance_date(), datetime(2028, 2, 8, tzinfo=datetime_timezone.utc))

    def test_legacy_machine_date_and_linked_template_produce_next_pm(self):
        self.machine.last_maintenance_date = datetime(2028, 1, 31, tzinfo=datetime_timezone.utc)
        self.machine.save(update_fields=['last_maintenance_date'])
        template = MaintenanceProcedure.objects.create(name='Legacy monthly', description='Inspect', frequency='monthly')
        template.machines.add(self.machine)
        self.assertEqual(self.machine.get_next_maintenance_date(), datetime(2028, 2, 29, tzinfo=datetime_timezone.utc))

    def test_active_master_plan_is_visible_before_work_is_generated(self):
        due = timezone.now() + timezone.timedelta(days=7)
        plan = PMMasterPlan.objects.create(title='Planned inspection', created_by=self.user, start_date=due)
        plan.machines.add(self.machine)
        self.assertEqual(self.machine.get_next_maintenance_date(), due)
        plan.active = False
        plan.save(update_fields=['active'])
        self.assertIsNone(self.machine.get_next_maintenance_date())

    def test_pending_pm_without_next_due_keeps_its_overdue_schedule(self):
        due = timezone.now() - timezone.timedelta(days=1)
        pm = PreventiveMaintenance.objects.create(pmtitle='Due inspection', created_by=self.user, scheduled_date=due)
        pm.machines.add(self.machine)
        self.assertEqual(self.machine.get_next_maintenance_date(), due)
        pm.status = 'cancelled'
        pm.save(update_fields=['status'])
        self.assertIsNone(self.machine.get_next_maintenance_date())

    def test_old_completed_pm_does_not_shadow_an_active_plan(self):
        old = PreventiveMaintenance.objects.create(
            pmtitle='Old completed inspection', created_by=self.user,
            scheduled_date=timezone.now() - timezone.timedelta(days=10),
            completed_date=timezone.now() - timezone.timedelta(days=9),
            status='completed', frequency='weekly',
        )
        old.machines.add(self.machine)
        due = timezone.now() + timezone.timedelta(days=1)
        plan = PMMasterPlan.objects.create(title='Next inspection', created_by=self.user, start_date=due)
        plan.machines.add(self.machine)
        self.assertEqual(self.machine.get_next_maintenance_date(), due)

    def test_completing_job_updates_machine_date(self):
        response = self.create_job()
        completed = self.client.patch(f"/api/v1/jobs/{response.data['job_id']}/update_status/", {'status': 'completed'}, format='json')
        self.assertEqual(completed.status_code, 200, completed.data)
        job = Job.objects.get(job_id=response.data['job_id'])
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.last_maintenance_date, job.completed_at)

    def test_completed_job_does_not_move_maintenance_date_backwards(self):
        future = timezone.now() + timezone.timedelta(days=1)
        Machine.objects.filter(pk=self.machine.pk).update(last_maintenance_date=future)
        response = self.create_job(status='completed')
        self.assertEqual(response.status_code, 201, response.data)
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.last_maintenance_date, future)

    def test_cleans_stored_pdfs_on_creation_failure(self):
        with patch.object(JobDocument, 'save', side_effect=RuntimeError('storage metadata failed')):
            response = self.create_job(documents=[self.pdf()])
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Job.objects.exists())
        from pathlib import Path
        self.assertFalse(list(Path(self.media.name).glob('job_documents/**/*.pdf')))
