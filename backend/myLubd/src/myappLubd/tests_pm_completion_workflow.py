"""Workflow and authorization contract tests for completing PM work."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import close_old_connections, connections, connection
from django.test import TransactionTestCase
from django.utils import timezone
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Machine,
    Job,
    MaintenanceHistory,
    PMMasterPlan,
    PreventiveMaintenance,
    Property,
    Tenant,
    TenantMembership,
)
from .test_plan_helpers import use_canonical_plan
from .services import PreventiveMaintenanceService


User = get_user_model()


class PreventiveMaintenanceCompletionWorkflowTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='PM completion tenant')
        use_canonical_plan(self.tenant, 'pro')
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

    def _status_url(self, pm):
        return self._detail_url(pm).replace('/?', '/change_status/?')

    def _schedule_items(self, due, status_filter='open'):
        response = self.client.get('/api/v1/preventive-maintenance/schedule/', {
            'property_id': self.property_a.property_id,
            'from': timezone.localtime(due).date().isoformat(),
            'days': 2,
            'status': status_filter,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        return [item for day in response.data['days'] for item in day['items']]

    def test_edit_completion_runs_workflow_and_metadata_edits_do_not_repeat_it(self):
        pm = self._make_pm()
        self.client.force_authenticate(self.operator)
        completed = timezone.now() + timezone.timedelta(minutes=1)
        payload = {
            'pmtitle': 'Updated title',
            'scheduled_date': pm.scheduled_date.isoformat(),
            'completed_date': completed.isoformat(),
            'machine_ids': [self.machine_a.machine_id],
            'notes': 'Completed through edit form',
        }
        response = self.client.put(self._detail_url(pm), payload, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['status'], 'completed')
        pm.refresh_from_db()
        self.assertEqual(pm.completed_date, completed)
        self.assertEqual(pm.completed_by, self.operator)
        next_pm = PreventiveMaintenance.objects.get(recurrence_source_pm=pm)
        self.assertEqual(next_pm.pmtitle, payload['pmtitle'])
        self.assertEqual(next_pm.scheduled_date, pm.next_due_date)
        self.assertIsNone(next_pm.job_id)
        self.assertEqual(list(next_pm.machines.all()), [self.machine_a])
        self.machine_a.refresh_from_db()
        self.assertEqual(self.machine_a.last_maintenance_date, completed)
        history = MaintenanceHistory.objects.get(maintenance=pm, action='completed')
        self.assertEqual(history.notes, payload['notes'])
        self.assertEqual(history.performed_by, self.operator)

        payload['notes'] = 'Corrected notes'
        payload['completed_date'] = completed.replace(second=0, microsecond=0).isoformat()
        response = self.client.put(self._detail_url(pm), payload, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(PreventiveMaintenance.objects.count(), 2)
        self.assertEqual(MaintenanceHistory.objects.filter(maintenance=pm).count(), 1)
        pm.refresh_from_db()
        self.assertEqual(pm.completed_date, completed)

    def test_edit_cannot_complete_cancelled_work_or_rewrite_completion(self):
        self.client.force_authenticate(self.operator)
        for workflow_status in ('cancelled', 'completed'):
            pm = self._make_pm(
                workflow_status,
                completed_date=timezone.now() if workflow_status == 'completed' else None,
            )
            response = self.client.patch(self._detail_url(pm), {
                'pmtitle': 'Should roll back',
                'completed_date': (timezone.now() + timezone.timedelta(minutes=1)).isoformat(),
            }, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
            pm.refresh_from_db()
            self.assertEqual(pm.pmtitle, f'{workflow_status} PM')
            self.assertFalse(PreventiveMaintenance.objects.filter(recurrence_source_pm=pm).exists())

    def test_status_completion_rejects_retries_without_changing_date_or_history(self):
        pm = self._make_pm()
        self.client.force_authenticate(self.operator)
        response = self.client.post(self._status_url(pm), {
            'status': 'completed', 'completion_notes': 'Status API completion',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        pm.refresh_from_db()
        completed = pm.completed_date
        response = self.client.post(self._status_url(pm), {'status': 'completed'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        pm.refresh_from_db()
        self.assertEqual(pm.completed_date, completed)
        self.assertEqual(PreventiveMaintenance.objects.count(), 2)
        history = MaintenanceHistory.objects.get(maintenance=pm, action='completed')
        self.assertEqual(history.notes, 'Status API completion')

    def test_service_reloads_stale_state_before_completion(self):
        pm = self._make_pm()
        stale = PreventiveMaintenance.objects.get(pk=pm.pk)
        PreventiveMaintenanceService.update_status(pm, 'completed', self.operator)
        with self.assertRaises(ValidationError):
            PreventiveMaintenanceService.update_status(stale, 'completed', self.operator)
        self.assertEqual(PreventiveMaintenance.objects.count(), 2)
        self.assertEqual(MaintenanceHistory.objects.filter(maintenance=pm).count(), 1)

    def test_failed_next_occurrence_rolls_back_edit_completion(self):
        pm = self._make_pm()
        self.client.force_authenticate(self.operator)
        with patch.object(PreventiveMaintenanceService, 'create_next_occurrence', side_effect=RuntimeError('schedule failed')):
            with self.assertRaises(RuntimeError):
                self.client.patch(self._detail_url(pm), {
                    'pmtitle': 'Should roll back',
                    'completed_date': (timezone.now() + timezone.timedelta(minutes=1)).isoformat(),
                }, format='json')
        pm.refresh_from_db()
        self.assertEqual(pm.status, 'pending')
        self.assertEqual(pm.pmtitle, 'pending PM')
        self.assertIsNone(pm.completed_date)
        self.assertFalse(MaintenanceHistory.objects.filter(maintenance=pm).exists())

    def test_next_occurrence_gets_its_own_job_when_due(self):
        pm = self._make_pm()
        old_job = Job.objects.create(
            user=self.operator, property=self.property_a,
            description='Original PM work order', status='completed',
            is_preventivemaintenance=True,
        )
        pm.job = old_job
        pm.save(update_fields=['job'])
        result = PreventiveMaintenanceService.update_status(pm, 'completed', self.operator)
        next_pm = result['next_schedule']
        self.assertIsNone(next_pm.job_id)
        self.assertEqual(next_pm.recurrence_source_pm, pm)
        # Make only this next occurrence due, then run the real dispatcher.
        next_pm.scheduled_date = timezone.now() - timezone.timedelta(minutes=1)
        next_pm.save(update_fields=['scheduled_date'])
        call_command('materialize_due_pm_jobs', stdout=StringIO())
        next_pm.refresh_from_db()
        self.assertIsNotNone(next_pm.job_id)
        self.assertNotEqual(next_pm.job_id, old_job.pk)
        pm.refresh_from_db()
        self.assertEqual(pm.job_id, old_job.pk)
        call_command('materialize_due_pm_jobs', stdout=StringIO())
        self.assertEqual(Job.objects.count(), 2)

    def test_calendar_shows_actual_next_occurrence_once(self):
        pm = self._make_pm()
        result = PreventiveMaintenanceService.update_status(pm, 'completed', self.operator)
        next_pm = result['next_schedule']
        self.client.force_authenticate(self.operator)
        for status_filter in ('open', 'all'):
            items = self._schedule_items(next_pm.scheduled_date, status_filter)
            self.assertEqual([item['pm_id'] for item in items], [next_pm.pm_id])
            self.assertEqual(items[0]['occurrence_type'], 'scheduled')

        # An edited or cancelled successor must not resurrect its predecessor's
        # old next_due projection.
        old_due = next_pm.scheduled_date
        next_pm.pmtitle = 'Rescheduled and cancelled task'
        next_pm.scheduled_date += timezone.timedelta(days=5)
        next_pm.status = 'cancelled'
        next_pm.save()
        self.assertEqual(self._schedule_items(old_due), [])

    def test_calendar_deduplicates_legacy_unlinked_occurrence(self):
        pm = self._make_pm()
        result = PreventiveMaintenanceService.update_status(pm, 'completed', self.operator)
        next_pm = result['next_schedule']
        next_pm.recurrence_source_pm = None
        next_pm.save(update_fields=['recurrence_source_pm'])
        self.client.force_authenticate(self.operator)
        items = self._schedule_items(next_pm.scheduled_date)
        self.assertEqual([item['pm_id'] for item in items], [next_pm.pm_id])
        next_pm.status = 'cancelled'
        next_pm.save(update_fields=['status'])
        self.assertEqual(self._schedule_items(next_pm.scheduled_date), [])

    def test_master_plan_calendar_projects_next_due_once(self):
        pm = self._make_pm()
        plan = PMMasterPlan.objects.create(
            title=pm.pmtitle, start_date=pm.scheduled_date,
            frequency='monthly', created_by=self.operator,
        )
        plan.machines.add(self.machine_a)
        pm.master_plan = plan
        pm.occurrence_due_date = pm.scheduled_date
        pm.save()
        result = PreventiveMaintenanceService.update_status(pm, 'completed', self.operator)
        self.assertIsNone(result['next_schedule'])
        plan.refresh_from_db()
        self.client.force_authenticate(self.operator)
        items = self._schedule_items(plan.next_due_date)
        self.assertEqual(len(items), 1, items)
        self.assertEqual(items[0]['plan_id'], plan.plan_id)
        self.assertEqual(items[0]['occurrence_type'], 'projected')

    def test_invalid_completion_datetime_returns_validation_error(self):
        pm = self._make_pm()
        self.client.force_authenticate(self.operator)
        response = self.client.post(self._complete_url(pm), {
            'completed_date': 'invalid datetime',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        pm.refresh_from_db()
        self.assertEqual(pm.status, 'pending')
        self.assertEqual(PreventiveMaintenance.objects.count(), 1)


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class PreventiveMaintenanceConcurrentCompletionTests(TransactionTestCase):
    setUp = PreventiveMaintenanceCompletionWorkflowTests.setUp
    _make_pm = PreventiveMaintenanceCompletionWorkflowTests._make_pm

    def test_concurrent_completions_create_one_successor_and_one_history(self):
        pm = self._make_pm()
        barrier = Barrier(2)

        def complete():
            close_old_connections()
            try:
                stale = PreventiveMaintenance.objects.get(pk=pm.pk)
                barrier.wait(timeout=10)
                try:
                    PreventiveMaintenanceService.update_status(stale, 'completed', self.operator)
                except ValidationError:
                    return 'rejected'
                return 'completed'
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(complete) for _ in range(2)]
            results = [future.result(timeout=20) for future in futures]
        self.assertCountEqual(results, ['completed', 'rejected'])
        self.assertEqual(PreventiveMaintenance.objects.filter(recurrence_source_pm=pm).count(), 1)
        self.assertEqual(PreventiveMaintenance.objects.count(), 2)
        self.assertEqual(MaintenanceHistory.objects.filter(maintenance=pm, action='completed').count(), 1)
