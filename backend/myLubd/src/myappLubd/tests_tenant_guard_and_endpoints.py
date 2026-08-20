"""Tests for the multi-tenant write guard on Jobs plus the new endpoints
   added on top of the existing viewsets (PM schedule, job audit log).

These complement tests_area_comments.py and use the same APITestCase /
force_authenticate pattern so they slot into the existing `manage.py test`
runner without extra config."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import (
    Job,
    JobComment,
    Machine,
    PreventiveMaintenance,
    PMMasterPlan,
    Property,
    Room,
    Topic,
)


User = get_user_model()


def _login(client, user):
    client.force_authenticate(user=user)


class JobTenantGuardTests(APITestCase):
    """JobViewSet.perform_create/update must reject cross-tenant writes."""

    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username='alice', password='pw12345!')
        self.bob = User.objects.create_user(username='bob', password='pw12345!')

        self.prop_a = Property.objects.create(name='Hotel A')
        self.prop_a.users.add(self.alice)
        self.prop_b = Property.objects.create(name='Hotel B')
        self.prop_b.users.add(self.bob)

        self.room_a = Room.objects.create(name='A-101', room_type='Standard', property=self.prop_a)
        self.room_a.properties.add(self.prop_a)

        self.room_b = Room.objects.create(name='B-201', room_type='Standard', property=self.prop_b)
        self.room_b.properties.add(self.prop_b)

        self.topic = Topic.objects.create(title='Plumbing')

    def _create_payload(self, room_id):
        return {
            'description': 'Leaky tap',
            'status': 'pending',
            'priority': 'medium',
            'remarks': '',
            'rooms': [room_id],
            'topics': [self.topic.id],
        }

    def test_create_with_own_room_succeeds(self):
        _login(self.client, self.alice)
        resp = self.client.post(
            '/api/v1/jobs/',
            self._create_payload(self.room_a.room_id),
            format='json',
        )
        self.assertIn(resp.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED), resp.content)
        self.assertTrue(Job.objects.filter(description='Leaky tap', user=self.alice).exists())

    def test_create_with_other_tenant_room_is_forbidden(self):
        _login(self.client, self.alice)
        resp = self.client.post(
            '/api/v1/jobs/',
            self._create_payload(self.room_b.room_id),
            format='json',
        )
        # _validate_tenant_scope raises PermissionDenied => 403.
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.assertFalse(Job.objects.filter(description='Leaky tap').exists())

    def test_update_cannot_move_job_to_other_tenant_room(self):
        # Seed a legitimate job for Alice, then attempt to PATCH her own job
        # so it references Bob's room. Should be rejected.
        job = Job.objects.create(
            user=self.alice,
            description='Initial',
            remarks='',
            status='pending',
            priority='medium',
        )
        job.rooms.set([self.room_a])

        _login(self.client, self.alice)
        resp = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/',
            {'rooms': [self.room_b.room_id]},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)

        job.refresh_from_db()
        self.assertEqual(set(job.rooms.values_list('room_id', flat=True)), {self.room_a.room_id})

    def test_staff_bypass_for_create(self):
        staff = User.objects.create_user(username='admin', password='pw12345!', is_staff=True)
        _login(self.client, staff)
        resp = self.client.post(
            '/api/v1/jobs/',
            self._create_payload(self.room_b.room_id),
            format='json',
        )
        self.assertIn(resp.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED), resp.content)


class JobAuditLogTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='auth0_69678f1e958bafc83554db32',
            email='tech@example.com',
            password='pw12345!',
        )
        self.prop = Property.objects.create(name='Hotel X')
        self.prop.users.add(self.user)
        self.room = Room.objects.create(name='101', room_type='Standard', property=self.prop)
        self.room.properties.add(self.prop)

        self.job = Job.objects.create(
            user=self.user,
            description='Test job',
            remarks='[2026-01-15 09:30 · alice → in_progress] Starting work.\n'
                    '[2026-01-15 11:45 · alice → completed] Done, water flows fine.',
            status='completed',
            priority='medium',
            completed_at=timezone.now(),
        )
        self.job.rooms.set([self.room])

    def test_audit_log_returns_events(self):
        _login(self.client, self.user)
        resp = self.client.get(f'/api/v1/jobs/{self.job.job_id}/audit-log/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        data = resp.data
        self.assertEqual(data['job_id'], self.job.job_id)
        kinds = {e['kind'] for e in data['events']}
        # Must contain the synthesized events for created, completed, and the
        # two parsed status notes.
        self.assertIn('created', kinds)
        self.assertIn('completed', kinds)
        created_event = next(e for e in data['events'] if e['kind'] == 'created')
        self.assertEqual(created_event['actor'], 'tech@example.com')
        status_changes = [e for e in data['events'] if e['kind'] == 'status_change']
        self.assertEqual(len(status_changes), 2)
        self.assertEqual(status_changes[0]['new_status'], 'in_progress')
        self.assertEqual(status_changes[1]['new_status'], 'completed')
        self.assertEqual(status_changes[0]['actor'], 'alice')

    def test_audit_log_is_tenant_scoped(self):
        other = User.objects.create_user(username='outsider', password='pw12345!')
        _login(self.client, other)
        resp = self.client.get(f'/api/v1/jobs/{self.job.job_id}/audit-log/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class PreventiveMaintenanceScheduleTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='tech', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel S')
        self.prop.users.add(self.user)
        self.room = Room.objects.create(name='S-1', room_type='Standard', property=self.prop)
        self.room.properties.add(self.prop)

        now = timezone.now()
        self.pm_today = PreventiveMaintenance.objects.create(
            pmtitle='Filter check',
            scheduled_date=now.replace(hour=9, minute=0, second=0, microsecond=0),
            frequency='weekly',
            status='pending',
        )
        # Anchor a job for the today PM so it shows up in the tenant-scoped
        # queryset (PMs filter through jobs.rooms.properties OR machines).
        self.pm_today.job = Job.objects.create(
            user=self.user,
            description='Filter',
            remarks='',
            status='pending',
            priority='medium',
            is_preventivemaintenance=True,
        )
        self.pm_today.job.rooms.set([self.room])
        self.pm_today.save(update_fields=['job'])

        self.pm_overdue = PreventiveMaintenance.objects.create(
            pmtitle='HVAC quarterly',
            scheduled_date=now - timedelta(days=2),
            frequency='quarterly',
            status='pending',
        )
        self.pm_overdue.job = Job.objects.create(
            user=self.user,
            description='HVAC',
            remarks='',
            status='pending',
            priority='medium',
            is_preventivemaintenance=True,
        )
        self.pm_overdue.job.rooms.set([self.room])
        self.pm_overdue.save(update_fields=['job'])

    def test_schedule_returns_buckets(self):
        _login(self.client, self.user)
        resp = self.client.get('/api/v1/preventive-maintenance/schedule/?days=30')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        body = resp.data
        self.assertEqual(body['status'], 'open')
        self.assertEqual(len(body['days']), 30)
        # Each bucket has the expected shape.
        first = body['days'][0]
        for key in ('date', 'weekday', 'items', 'overdue_count', 'open_count', 'completed_count'):
            self.assertIn(key, first)

    def test_schedule_caps_days_param(self):
        _login(self.client, self.user)
        resp = self.client.get('/api/v1/preventive-maintenance/schedule/?days=9999')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Cap is 180.
        self.assertEqual(len(resp.data['days']), 180)

    def test_open_schedule_includes_completed_pm_next_due_date(self):
        next_due = timezone.now() + timedelta(days=5)
        completed_pm = PreventiveMaintenance.objects.create(
            pmtitle='Recurring filter replacement',
            scheduled_date=timezone.now() - timedelta(days=25),
            completed_date=timezone.now() - timedelta(days=24),
            next_due_date=next_due,
            frequency='monthly',
            status='completed',
        )
        completed_pm.job = Job.objects.create(
            user=self.user,
            description='Recurring filter replacement',
            remarks='',
            status='completed',
            priority='medium',
            is_preventivemaintenance=True,
        )
        completed_pm.job.rooms.set([self.room])
        completed_pm.save(update_fields=['job'])

        _login(self.client, self.user)
        resp = self.client.get('/api/v1/preventive-maintenance/schedule/?days=30&status=open')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        due_date = timezone.localtime(next_due).date().isoformat()
        due_bucket = next(day for day in resp.data['days'] if day['date'] == due_date)
        occurrence = next(item for item in due_bucket['items'] if item['pm_id'] == completed_pm.pm_id)
        self.assertEqual(occurrence['occurrence_type'], 'next_due')
        self.assertEqual(occurrence['calendar_status'], 'open')
        self.assertEqual(due_bucket['open_count'], 1)


    def test_schedule_date_from_does_not_hide_next_due_occurrence(self):
        next_due = timezone.now() + timedelta(days=9)
        completed_pm = PreventiveMaintenance.objects.create(
            pmtitle='Monthly AC clean',
            scheduled_date=timezone.now() - timedelta(days=22),
            completed_date=timezone.now() - timedelta(days=21),
            next_due_date=next_due,
            frequency='monthly',
            status='completed',
        )
        completed_pm.job = Job.objects.create(
            user=self.user,
            description='Monthly AC clean',
            remarks='',
            status='completed',
            priority='medium',
            is_preventivemaintenance=True,
        )
        completed_pm.job.rooms.set([self.room])
        completed_pm.save(update_fields=['job'])

        _login(self.client, self.user)
        from_date = timezone.localdate().isoformat()
        resp = self.client.get(
            f'/api/v1/preventive-maintenance/schedule/?from={from_date}&date_from={from_date}&days=30&status=open'
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        due_date = timezone.localtime(next_due).date().isoformat()
        due_bucket = next(day for day in resp.data['days'] if day['date'] == due_date)
        occurrence = next(item for item in due_bucket['items'] if item['pm_id'] == completed_pm.pm_id)
        self.assertEqual(occurrence['occurrence_type'], 'next_due')
        self.assertEqual(occurrence['calendar_status'], 'open')

    def test_schedule_is_tenant_scoped(self):
        other = User.objects.create_user(username='outsider', password='pw12345!')
        _login(self.client, other)
        resp = self.client.get('/api/v1/preventive-maintenance/schedule/?days=30')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['total'], 0)


class PreventiveMaintenanceCreateTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='pm-tech', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel PM')
        self.prop.users.add(self.user)
        self.machine = Machine.objects.create(
            machine_id='L2544AF9284',
            name='Laundry extractor',
            category='Laundry',
            property=self.prop,
        )

    def test_create_accepts_empty_optional_form_fields_with_machine_ids(self):
        _login(self.client, self.user)

        resp = self.client.post(
            '/api/v1/preventive-maintenance/',
            {
                'pmtitle': 'Inspect laundry extractor',
                'scheduled_date': timezone.now().isoformat(),
                'frequency': 'monthly',
                'machine_ids': [self.machine.machine_id],
                'procedure_template': '',
                'assigned_to': '',
                'completed_date': '',
                'custom_days': '',
                'notes': '',
                'remarks': '',
            },
            format='multipart',
        )

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        pm = PreventiveMaintenance.objects.get(pmtitle='Inspect laundry extractor')
        self.assertEqual(list(pm.machines.values_list('machine_id', flat=True)), [self.machine.machine_id])


class PMMasterPlanWorkflowTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='planner', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel Plan')
        self.prop.users.add(self.user)
        self.machine = Machine.objects.create(
            machine_id='MPLAN001',
            name='Plan pump',
            category='Pump',
            property=self.prop,
        )

    def test_projection_includes_master_plan_without_pm_record(self):
        plan = PMMasterPlan.objects.create(
            title='Pump service plan',
            start_date=timezone.now() + timedelta(days=10),
            frequency='custom',
            custom_days=30,
            lead_time_days=7,
            created_by=self.user,
            assigned_to=self.user,
        )
        plan.machines.set([self.machine])

        _login(self.client, self.user)
        resp = self.client.get('/api/v1/preventive-maintenance/schedule/?days=30&status=open')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        items = [item for bucket in resp.data['days'] for item in bucket['items']]
        projected = next(item for item in items if item.get('plan_id') == plan.plan_id)
        self.assertEqual(projected['occurrence_type'], 'projected')
        self.assertIsNone(projected['pm_id'])
        self.assertFalse(PreventiveMaintenance.objects.filter(master_plan=plan).exists())

    def test_materialize_master_plan_is_idempotent_and_completion_based(self):
        plan = PMMasterPlan.objects.create(
            title='Completion based service',
            start_date=timezone.now() + timedelta(days=2),
            frequency='custom',
            custom_days=30,
            lead_time_days=7,
            created_by=self.user,
            assigned_to=self.user,
        )
        plan.machines.set([self.machine])

        from .services import PreventiveMaintenanceService

        first = PreventiveMaintenanceService.materialize_master_plan_occurrences(cutoff=timezone.now())
        second = PreventiveMaintenanceService.materialize_master_plan_occurrences(cutoff=timezone.now())

        self.assertEqual(first['created_count'], 1)
        self.assertEqual(second['created_count'], 0)
        pm = PreventiveMaintenance.objects.get(master_plan=plan)
        completed_date = timezone.now() + timedelta(days=5)
        PreventiveMaintenanceService.update_status(pm, 'completed', self.user, completed_date=completed_date)

        plan.refresh_from_db()
        pm.refresh_from_db()
        self.assertEqual(PreventiveMaintenance.objects.filter(master_plan=plan).count(), 1)
        self.assertEqual(pm.status, 'completed')
        self.assertEqual(plan.last_completed_date.date(), completed_date.date())
        self.assertEqual(plan.next_due_date.date(), (completed_date + timedelta(days=30)).date())
