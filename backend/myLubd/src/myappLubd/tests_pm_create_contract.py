"""Authorization and ownership contract for ordinary PM creation."""

from datetime import datetime
from io import BytesIO
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import (
    Job,
    Machine,
    MaintenanceProcedure,
    PreventiveMaintenance,
    Property,
    Tenant,
    TenantMembership,
    Topic,
)
from .serializers import PreventiveMaintenanceCreateUpdateSerializer


User = get_user_model()


class PreventiveMaintenanceCreateContractTests(APITestCase):
    endpoint = '/api/v1/preventive-maintenance/'

    def setUp(self):
        self.client = APIClient()
        self.operator = User.objects.create_user(username='pm-operator', password='pw12345!')
        self.viewer = User.objects.create_user(username='pm-viewer', password='pw12345!')
        self.billing = User.objects.create_user(username='pm-billing', password='pw12345!')
        self.assignee = User.objects.create_user(username='pm-assignee', password='pw12345!')
        self.other_assignee = User.objects.create_user(username='pm-other-assignee', password='pw12345!')
        self.viewer_assignee = User.objects.create_user(username='pm-viewer-assignee', password='pw12345!')

        self.tenant = Tenant.objects.create(name='PM Create Contract', timezone='Asia/Bangkok')
        self.other_tenant = Tenant.objects.create(name='Other PM Tenant')
        self.property = Property.objects.create(name='Bangkok Hotel', tenant=self.tenant)
        self.other_property = Property.objects.create(name='Other Hotel', tenant=self.other_tenant)

        for user, role, tenant, property_obj in (
            (self.operator, 'technician', self.tenant, self.property),
            (self.viewer, 'viewer', self.tenant, self.property),
            (self.billing, 'billing', self.tenant, self.property),
            (self.assignee, 'supervisor', self.tenant, self.property),
            (self.other_assignee, 'technician', self.other_tenant, self.other_property),
            (self.viewer_assignee, 'viewer', self.tenant, self.property),
        ):
            membership = TenantMembership.objects.create(
                user=user,
                tenant=tenant,
                role=role,
            )
            membership.properties.add(property_obj)

        self.machine = Machine.objects.create(
            machine_id='PM-MACHINE-A', name='Pump A', property=self.property
        )
        self.machine_two = Machine.objects.create(
            machine_id='PM-MACHINE-A2', name='Pump A2', property=self.property
        )
        self.other_machine = Machine.objects.create(
            machine_id='PM-MACHINE-B', name='Pump B', property=self.other_property
        )
        self.topic = Topic.objects.create(title='Electrical')
        self.topic_two = Topic.objects.create(title='Safety')
        self.procedure = MaintenanceProcedure.objects.create(
            name='Inspect pump',
            description='Inspect seals and controls.',
            frequency='monthly',
        )
        self.job = Job.objects.create(
            user=self.operator,
            property=self.property,
            description='Pump issue',
            remarks='',
        )
        self.other_job = Job.objects.create(
            user=self.other_assignee,
            property=self.other_property,
            description='Other issue',
            remarks='',
        )

    def payload(self, **overrides):
        data = {
            'property_id': self.property.property_id,
            'pmtitle': 'Inspect primary pump',
            'scheduled_date': '2026-08-23T09:00',
            'frequency': 'monthly',
            'machine_ids': [self.machine.machine_id],
            'topic_ids': [self.topic.id],
        }
        data.update(overrides)
        return data

    def post(self, user=None, **overrides):
        self.client.force_authenticate(user=user or self.operator)
        return self.client.post(self.endpoint, self.payload(**overrides), format='json')

    def test_authorized_operator_can_create(self):
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_viewer_cannot_create(self):
        response = self.post(self.viewer)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_billing_cannot_create(self):
        response = self.post(self.billing)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_active_property_is_rejected(self):
        response = self.post(property_id=None)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('property_id', response.data)

    def test_invalid_external_property_is_rejected(self):
        response = self.post(property_id='PROP-DOES-NOT-EXIST')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_internal_property_pk_is_not_an_external_identity_fallback(self):
        response = self.post(property_id=str(self.property.pk))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthorized_property_is_rejected(self):
        response = self.post(
            property_id=self.other_property.property_id,
            machine_ids=[self.other_machine.machine_id],
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_machine_from_active_property_is_accepted(self):
        response = self.post(machine_ids=[self.machine.machine_id])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_machine_from_another_property_is_rejected(self):
        response = self.post(machine_ids=[self.other_machine.machine_id])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_multiple_machines_in_active_property_are_accepted(self):
        response = self.post(machine_ids=[self.machine.machine_id, self.machine_two.machine_id])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(response.data['machines']), 2)

    def test_mixed_property_machines_are_rejected(self):
        response = self.post(machine_ids=[self.machine.machine_id, self.other_machine.machine_id])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_machine_ids_are_rejected(self):
        response = self.post(machine_ids=[self.machine.machine_id, self.machine.machine_id])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_machine_ownership_is_rejected(self):
        response = self.post(machine_ids=[])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_same_property_job_is_accepted(self):
        response = self.post(job_id=self.job.job_id)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['job_id'], self.job.job_id)

    def test_job_machine_property_mismatch_is_rejected(self):
        response = self.post(job_id=self.other_job.job_id)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('job_id', response.data)

    def test_invalid_job_id_is_rejected(self):
        response = self.post(job_id='JOB-DOES-NOT-EXIST')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_operable_assignee_is_accepted(self):
        response = self.post(assigned_to=self.assignee.pk)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['assigned_to'], self.assignee.pk)

    def test_assignee_without_property_access_is_rejected(self):
        response = self.post(assigned_to=self.other_assignee.pk)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('assigned_to', response.data)

    def test_viewer_cannot_be_assigned_as_operator(self):
        response = self.post(assigned_to=self.viewer_assignee.pk)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_topic_ids_are_rejected(self):
        response = self.post(topic_ids=[self.topic.pk, self.topic.pk])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_topic_id_is_rejected(self):
        response = self.post(topic_ids=[999999])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_topics_round_trip(self):
        response = self.post(topic_ids=[self.topic.pk, self.topic_two.pk])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual({item['id'] for item in response.data['topics']}, {self.topic.pk, self.topic_two.pk})

    def test_custom_frequency_requires_days(self):
        response = self.post(frequency='custom', custom_days=None)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_custom_frequency_requires_positive_days(self):
        response = self.post(frequency='custom', custom_days=0)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_scheduled_datetime_is_rejected(self):
        response = self.post(scheduled_date='not-a-date')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_property_local_wall_time_uses_tenant_timezone(self):
        response = self.post(scheduled_date='2026-08-23T09:00')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        pm = PreventiveMaintenance.objects.get(pm_id=response.data['pm_id'])
        local = pm.scheduled_date.astimezone(ZoneInfo('Asia/Bangkok'))
        self.assertEqual((local.hour, local.minute), (9, 0))

    def test_annual_recurrence_handles_leap_day_without_365_day_assumption(self):
        completed = timezone.make_aware(
            datetime(2028, 2, 29, 9, 0),
            ZoneInfo('Asia/Bangkok'),
        )
        pm = PreventiveMaintenance.objects.create(
            pmtitle='Leap-day annual PM',
            scheduled_date=completed,
            completed_date=completed,
            frequency='annual',
            created_by=self.operator,
        )
        local_next_due = pm.next_due_date.astimezone(ZoneInfo('Asia/Bangkok'))
        self.assertEqual((local_next_due.year, local_next_due.month, local_next_due.day), (2029, 2, 28))

    def test_created_by_cannot_be_forged(self):
        response = self.post(created_by=self.other_assignee.pk)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        pm = PreventiveMaintenance.objects.get(pm_id=response.data['pm_id'])
        self.assertEqual(pm.created_by, self.operator)

    def test_create_status_is_server_controlled_pending(self):
        response = self.post(status='completed')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['status'], 'pending')

    def test_completed_date_is_rejected_on_create(self):
        response = self.post(completed_date=timezone.now().isoformat())
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_initial_legacy_image_upload_is_rejected(self):
        image_buffer = BytesIO()
        Image.new('RGB', (2, 2), color='white').save(image_buffer, format='PNG')
        image = SimpleUploadedFile('before.png', image_buffer.getvalue(), content_type='image/png')
        self.client.force_authenticate(user=self.operator)
        response = self.client.post(
            self.endpoint,
            self.payload(before_image=image),
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('images', response.data)

    def test_global_procedure_template_is_accepted(self):
        response = self.post(procedure_template=self.procedure.pk)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        pm = PreventiveMaintenance.objects.get(pm_id=response.data['pm_id'])
        self.assertEqual(pm.procedure_template, self.procedure)

    def test_invalid_procedure_template_is_rejected(self):
        response = self.post(procedure_template=999999)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_is_atomic_when_m2m_assignment_fails(self):
        self.client.force_authenticate(user=self.operator)
        with patch.object(
            PreventiveMaintenanceCreateUpdateSerializer,
            '_set_m2m_relations',
            side_effect=RuntimeError('simulated M2M failure'),
        ):
            with self.assertRaises(RuntimeError):
                self.client.post(self.endpoint, self.payload(), format='json')
        self.assertFalse(PreventiveMaintenance.objects.filter(pmtitle='Inspect primary pump').exists())

    def test_response_property_id_is_external_identity(self):
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['property_id'], self.property.property_id)

    def test_capability_response_includes_property_timezone(self):
        self.client.force_authenticate(user=self.operator)
        response = self.client.get(
            f'{self.endpoint}stats/?property_id={self.property.property_id}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data['can_operate'])
        self.assertEqual(response.data['timezone'], 'Asia/Bangkok')
