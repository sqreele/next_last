"""Workflow and authorization contract tests for completing PM work."""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Machine,
    MaintenanceHistory,
    PreventiveMaintenance,
    Property,
    Tenant,
    TenantMembership,
)


User = get_user_model()


class PreventiveMaintenanceCompletionWorkflowTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='PM completion tenant')
        self.property_a = Property.objects.create(
            name='PM completion property A',
            tenant=self.tenant,
        )
        self.property_b = Property.objects.create(
            name='PM completion property B',
            tenant=self.tenant,
        )

        self.operator = User.objects.create_user(
            username='pm-completion-operator',
            password='pw12345!',
        )
        operator_membership = TenantMembership.objects.create(
            user=self.operator,
            tenant=self.tenant,
            role='technician',
        )
        operator_membership.properties.add(self.property_a)

        self.viewer = User.objects.create_user(
            username='pm-completion-viewer',
            password='pw12345!',
        )
        viewer_membership = TenantMembership.objects.create(
            user=self.viewer,
            tenant=self.tenant,
            role='viewer',
        )
        viewer_membership.properties.add(self.property_a)

        self.machine_a = Machine.objects.create(
            machine_id='PM-COMPLETION-A',
            name='PM completion machine A',
            property=self.property_a,
        )
        self.machine_b = Machine.objects.create(
            machine_id='PM-COMPLETION-B',
            name='PM completion machine B',
            property=self.property_b,
        )

    def _make_pm(self, workflow_status='pending', *, machine=None, completed_date=None):
        pm = PreventiveMaintenance.objects.create(
            pmtitle=f'{workflow_status} PM',
            scheduled_date=timezone.now(),
            status=workflow_status,
            completed_date=completed_date,
            created_by=self.operator,
        )
        pm.machines.add(machine or self.machine_a)
        return pm

    def _detail_url(self, pm, property_obj=None):
        property_obj = property_obj or self.property_a
        return (
            f'/api/v1/preventive-maintenance/{pm.pm_id}/'
            f'?property_id={property_obj.property_id}'
        )

    def _complete_url(self, pm, property_obj=None):
        property_obj = property_obj or self.property_a
        return (
            f'/api/v1/preventive-maintenance/{pm.pm_id}/complete/'
            f'?property_id={property_obj.property_id}'
        )

    def test_pending_operator_can_complete_and_receives_authoritative_status(self):
        pm = self._make_pm('pending')
        self.client.force_authenticate(self.operator)

        detail = self.client.get(self._detail_url(pm))
        response = self.client.post(
            self._complete_url(pm),
            {'completion_notes': 'Completed by operator'},
            format='json',
        )

        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertTrue(detail.data['can_operate'])
        self.assertEqual(detail.data['status'], 'pending')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['status'], 'completed')
        self.assertIsNotNone(response.data['completed_date'])
        self.assertEqual(
            MaintenanceHistory.objects.filter(maintenance=pm, action='completed').count(),
            1,
        )

    def test_in_progress_and_overdue_operator_can_complete(self):
        self.client.force_authenticate(self.operator)

        for workflow_status in ('in_progress', 'overdue'):
            with self.subTest(workflow_status=workflow_status):
                pm = self._make_pm(workflow_status)
                response = self.client.post(self._complete_url(pm), {}, format='json')

                self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
                self.assertEqual(response.data['status'], 'completed')
                self.assertEqual(
                    MaintenanceHistory.objects.filter(
                        maintenance=pm,
                        action='completed',
                    ).count(),
                    1,
                )

    def test_completed_status_is_rejected_without_duplicate_history(self):
        original_completed_date = timezone.now()
        pm = self._make_pm('completed', completed_date=original_completed_date)
        MaintenanceHistory.objects.create(
            maintenance=pm,
            action='completed',
            performed_by=self.operator,
        )
        self.client.force_authenticate(self.operator)

        response = self.client.post(
            self._complete_url(pm),
            {'completion_notes': 'Duplicate attempt'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(response.data['detail'], 'This maintenance task is already completed.')
        pm.refresh_from_db()
        self.assertEqual(pm.completed_date, original_completed_date)
        self.assertEqual(
            MaintenanceHistory.objects.filter(maintenance=pm, action='completed').count(),
            1,
        )

    def test_completed_status_without_date_is_still_rejected(self):
        pm = self._make_pm('completed', completed_date=None)
        self.client.force_authenticate(self.operator)

        response = self.client.post(self._complete_url(pm), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        pm.refresh_from_db()
        self.assertEqual(pm.status, 'completed')
        self.assertIsNone(pm.completed_date)
        self.assertFalse(MaintenanceHistory.objects.filter(maintenance=pm).exists())

    def test_cancelled_operator_cannot_complete(self):
        pm = self._make_pm('cancelled')
        self.client.force_authenticate(self.operator)

        response = self.client.post(self._complete_url(pm), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(
            response.data['detail'],
            'A cancelled maintenance task cannot be completed.',
        )
        pm.refresh_from_db()
        self.assertEqual(pm.status, 'cancelled')
        self.assertIsNone(pm.completed_date)
        self.assertFalse(MaintenanceHistory.objects.filter(maintenance=pm).exists())

    def test_viewer_cannot_complete_pending_pm(self):
        pm = self._make_pm('pending')
        self.client.force_authenticate(self.viewer)

        detail = self.client.get(self._detail_url(pm))
        response = self.client.post(self._complete_url(pm), {}, format='json')

        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertFalse(detail.data['can_operate'])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        pm.refresh_from_db()
        self.assertEqual(pm.status, 'pending')
        self.assertIsNone(pm.completed_date)
        self.assertFalse(MaintenanceHistory.objects.filter(maintenance=pm).exists())

    def test_completion_remains_scoped_to_active_accessible_property(self):
        foreign_pm = self._make_pm('pending', machine=self.machine_b)
        self.client.force_authenticate(self.operator)

        active_property_response = self.client.post(
            self._complete_url(foreign_pm, self.property_a),
            {},
            format='json',
        )
        foreign_property_response = self.client.post(
            self._complete_url(foreign_pm, self.property_b),
            {},
            format='json',
        )

        self.assertEqual(active_property_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(foreign_property_response.status_code, status.HTTP_404_NOT_FOUND)
        foreign_pm.refresh_from_db()
        self.assertEqual(foreign_pm.status, 'pending')
        self.assertIsNone(foreign_pm.completed_date)
        self.assertFalse(
            MaintenanceHistory.objects.filter(maintenance=foreign_pm).exists()
        )
