"""Tests for the multi-tenant write guard on Jobs plus the new endpoints
   added on top of the existing viewsets (PM schedule, job audit log).

These complement tests_area_comments.py and use the same APITestCase /
force_authenticate pattern so they slot into the existing `manage.py test`
runner without extra config."""

from datetime import datetime, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

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
    Tenant,
    TenantMembership,
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

        tenant_a = Tenant.objects.create(name='Job Guard Tenant A')
        tenant_b = Tenant.objects.create(name='Job Guard Tenant B')
        self.prop_a = Property.objects.create(name='Hotel A', tenant=tenant_a)
        self.prop_b = Property.objects.create(name='Hotel B', tenant=tenant_b)
        TenantMembership.objects.create(user=self.alice, tenant=tenant_a, role='technician').properties.add(self.prop_a)
        TenantMembership.objects.create(user=self.bob, tenant=tenant_b, role='technician').properties.add(self.prop_b)

        self.room_a = Room.objects.create(name='A-101', room_type='Standard', property=self.prop_a)

        self.room_b = Room.objects.create(name='B-201', room_type='Standard', property=self.prop_b)

        self.topic = Topic.objects.create(title='Plumbing')

    def _create_payload(self, room_id):
        return {
            'description': 'Leaky tap',
            'status': 'pending',
            'priority': 'medium',
            'remarks': 'Test job',
            'property_id': self.prop_a.property_id,
            'room_ids': [room_id],
            'topic_data': {'title': self.topic.title},
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

    def test_create_with_other_tenant_room_does_not_link_foreign_room(self):
        _login(self.client, self.alice)
        resp = self.client.post(
            '/api/v1/jobs/',
            self._create_payload(self.room_b.room_id),
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertFalse(Job.objects.filter(user=self.alice).exists())

    def test_update_cannot_move_job_to_other_tenant_room(self):
        # Seed a legitimate job for Alice, then attempt to PATCH her own job
        # so it references Bob's room. The request must be rejected.
        job = Job.objects.create(
            user=self.alice,
            property=self.prop_a,
            description='Initial',
            remarks='Test job',
            status='pending',
            priority='medium',
        )
        job.rooms.set([self.room_a])

        _login(self.client, self.alice)
        resp = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/',
            {'room_ids': [self.room_b.room_id]},
            format='json',
        )
        before_room_ids = set(job.rooms.values_list('room_id', flat=True))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        job.refresh_from_db()
        after_room_ids = set(job.rooms.values_list('room_id', flat=True))
        self.assertEqual(before_room_ids, after_room_ids)
        self.assertEqual(after_room_ids, {self.room_a.room_id})
        self.assertNotIn(self.room_b.room_id, after_room_ids)
        self.assertEqual(job.property_id, self.prop_a.id)

    def test_staff_without_membership_cannot_create(self):
        staff = User.objects.create_user(username='admin', password='pw12345!', is_staff=True)
        _login(self.client, staff)
        resp = self.client.post(
            '/api/v1/jobs/',
            self._create_payload(self.room_b.room_id),
            format='json',
        )
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST), resp.content)
        self.assertFalse(Job.objects.filter(user=staff).exists())


class JobAuditLogTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='auth0_69678f1e958bafc83554db32',
            email='tech@example.com',
            password='pw12345!',
        )
        tenant = Tenant.objects.create(name='Audit Tenant')
        self.prop = Property.objects.create(name='Hotel X', tenant=tenant)
        TenantMembership.objects.create(user=self.user, tenant=tenant, role='technician').properties.add(self.prop)
        self.room = Room.objects.create(name='101', room_type='Standard', property=self.prop)

        self.job = Job.objects.create(
            user=self.user,
            property=self.prop,
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
        self.tenant = Tenant.objects.create(name='Schedule Tenant')
        self.prop = Property.objects.create(name='Hotel S', tenant=self.tenant)
        TenantMembership.objects.create(user=self.user, tenant=self.tenant, role='technician').properties.add(self.prop)
        self.room = Room.objects.create(name='S-1', room_type='Standard', property=self.prop)

        now = timezone.now()
        self.pm_today = PreventiveMaintenance.objects.create(
            pmtitle='Filter check',
            scheduled_date=now.replace(hour=9, minute=0, second=0, microsecond=0),
            frequency='weekly',
            status='pending',
            created_by=self.user,
        )
        # Anchor a job for the today PM so it shows up in the tenant-scoped
        # queryset (PMs filter through jobs.rooms.properties OR machines).
        self.pm_today.job = Job.objects.create(
            user=self.user,
            property=self.prop,
            description='Filter',
            remarks='Test job',
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
            created_by=self.user,
        )
        self.pm_overdue.job = Job.objects.create(
            user=self.user,
            property=self.prop,
            description='HVAC',
            remarks='Test job',
            status='pending',
            priority='medium',
            is_preventivemaintenance=True,
        )
        self.pm_overdue.job.rooms.set([self.room])
        self.pm_overdue.save(update_fields=['job'])

    def schedule_url(self, **params):
        return '/api/v1/preventive-maintenance/schedule/?' + urlencode({
            'property_id': self.prop.property_id,
            **params,
        })

    def test_schedule_returns_buckets(self):
        _login(self.client, self.user)
        resp = self.client.get(self.schedule_url(days=30))
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        body = resp.data
        self.assertEqual(body['status'], 'open')
        self.assertEqual(len(body['days']), 30)
        # Each bucket has the expected shape.
        first = body['days'][0]
        for key in ('date', 'weekday', 'items', 'overdue_count', 'open_count', 'completed_count', 'cancelled_count'):
            self.assertIn(key, first)
        self.assertEqual(body['property_id'], self.prop.property_id)
        self.assertEqual(body['timezone'], self.tenant.timezone)
        self.assertTrue(body['can_operate'])
        expected_from = timezone.localdate() - timedelta(days=timezone.localdate().weekday())
        self.assertEqual(body['from'], expected_from.isoformat())

    def test_schedule_caps_days_param(self):
        _login(self.client, self.user)
        resp = self.client.get(self.schedule_url(days=9999))
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
            created_by=self.user,
        )
        completed_pm.job = Job.objects.create(
            user=self.user,
            property=self.prop,
            description='Recurring filter replacement',
            remarks='Test job',
            status='completed',
            priority='medium',
            is_preventivemaintenance=True,
        )
        completed_pm.job.rooms.set([self.room])
        completed_pm.save(update_fields=['job'])

        _login(self.client, self.user)
        resp = self.client.get(self.schedule_url(days=30, status='open'))

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
            created_by=self.user,
        )
        completed_pm.job = Job.objects.create(
            user=self.user,
            property=self.prop,
            description='Monthly AC clean',
            remarks='Test job',
            status='completed',
            priority='medium',
            is_preventivemaintenance=True,
        )
        completed_pm.job.rooms.set([self.room])
        completed_pm.save(update_fields=['job'])

        _login(self.client, self.user)
        from_date = timezone.localdate().isoformat()
        resp = self.client.get(self.schedule_url(
            **{'from': from_date, 'date_from': from_date, 'days': 30, 'status': 'open'}
        ))

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        due_date = timezone.localtime(next_due).date().isoformat()
        due_bucket = next(day for day in resp.data['days'] if day['date'] == due_date)
        occurrence = next(item for item in due_bucket['items'] if item['pm_id'] == completed_pm.pm_id)
        self.assertEqual(occurrence['occurrence_type'], 'next_due')
        self.assertEqual(occurrence['calendar_status'], 'open')

    def test_schedule_is_tenant_scoped(self):
        other = User.objects.create_user(username='outsider', password='pw12345!')
        _login(self.client, other)
        resp = self.client.get(self.schedule_url(days=30))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_schedule_requires_property_and_rejects_invalid_range_inputs(self):
        _login(self.client, self.user)
        missing_property = self.client.get('/api/v1/preventive-maintenance/schedule/?days=30')
        invalid_from = self.client.get(self.schedule_url(**{'from': 'not-a-date'}))
        invalid_days = self.client.get(self.schedule_url(days=0))
        invalid_status = self.client.get(self.schedule_url(status='unknown'))

        self.assertEqual(missing_property.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_from.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_days.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_status.status_code, status.HTTP_400_BAD_REQUEST)

    def test_schedule_hides_mixed_property_pm_and_deduplicates_multi_machine_pm(self):
        second_machine = Machine.objects.create(name='Second local machine', property=self.prop)
        self.pm_today.machines.add(second_machine, Machine.objects.create(name='Third local machine', property=self.prop))

        foreign_tenant = Tenant.objects.create(name='Foreign Schedule Tenant')
        foreign_property = Property.objects.create(name='Foreign Hotel', tenant=foreign_tenant)
        foreign_machine = Machine.objects.create(name='Foreign machine', property=foreign_property)
        self.pm_overdue.machines.add(foreign_machine)
        orphan = PreventiveMaintenance.objects.create(
            pmtitle='No canonical property',
            scheduled_date=timezone.now(),
            created_by=self.user,
        )

        _login(self.client, self.user)
        start = (timezone.localdate() - timedelta(days=7)).isoformat()
        response = self.client.get(self.schedule_url(**{'from': start, 'days': 14, 'status': 'all'}))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        items = [item for bucket in response.data['days'] for item in bucket['items']]
        self.assertEqual(sum(item['pm_id'] == self.pm_today.pm_id for item in items), 1)
        self.assertNotIn(self.pm_overdue.pm_id, {item['pm_id'] for item in items})
        self.assertNotIn(orphan.pm_id, {item['pm_id'] for item in items})

    def test_schedule_property_switch_queries_remain_isolated(self):
        second_property = Property.objects.create(name='Hotel S2', tenant=self.tenant)
        TenantMembership.objects.get(user=self.user, tenant=self.tenant).properties.add(second_property)
        second_room = Room.objects.create(name='S2-1', room_type='Standard', property=second_property)
        second_job = Job.objects.create(
            user=self.user,
            property=second_property,
            description='Second property PM',
            remarks='Test job',
            status='pending',
            priority='medium',
            is_preventivemaintenance=True,
        )
        second_job.rooms.add(second_room)
        second_pm = PreventiveMaintenance.objects.create(
            pmtitle='Second property schedule',
            job=second_job,
            scheduled_date=timezone.now(),
            created_by=self.user,
        )
        _login(self.client, self.user)
        start = (timezone.localdate() - timedelta(days=7)).isoformat()

        first_response = self.client.get(self.schedule_url(
            **{'from': start, 'days': 14, 'status': 'all'}
        ))
        second_response = self.client.get(
            '/api/v1/preventive-maintenance/schedule/?' + urlencode({
                'property_id': second_property.property_id,
                'from': start,
                'days': 14,
                'status': 'all',
            })
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK, first_response.content)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK, second_response.content)
        first_ids = {item['pm_id'] for bucket in first_response.data['days'] for item in bucket['items']}
        second_ids = {item['pm_id'] for bucket in second_response.data['days'] for item in bucket['items']}
        self.assertNotIn(second_pm.pm_id, first_ids)
        self.assertEqual(second_ids, {second_pm.pm_id})

    def test_schedule_viewer_can_read_but_cannot_reschedule(self):
        viewer = User.objects.create_user(username='schedule-viewer', password='pw12345!')
        TenantMembership.objects.create(user=viewer, tenant=self.tenant, role='viewer').properties.add(self.prop)
        _login(self.client, viewer)

        schedule_response = self.client.get(self.schedule_url(days=30))
        reschedule_response = self.client.post(
            f'/api/v1/preventive-maintenance/{self.pm_today.pm_id}/reschedule/',
            {'scheduled_date': (timezone.now() + timedelta(days=3)).isoformat()},
            format='json',
        )

        self.assertEqual(schedule_response.status_code, status.HTTP_200_OK)
        self.assertFalse(schedule_response.data['can_operate'])
        self.assertEqual(reschedule_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_operator_reschedule_validates_and_localizes_naive_datetime(self):
        self.tenant.timezone = 'America/New_York'
        self.tenant.save(update_fields=['timezone'])
        _login(self.client, self.user)

        invalid = self.client.post(
            f'/api/v1/preventive-maintenance/{self.pm_today.pm_id}/reschedule/',
            {'scheduled_date': 'not-a-date'},
            format='json',
        )
        valid = self.client.post(
            f'/api/v1/preventive-maintenance/{self.pm_today.pm_id}/reschedule/',
            {'scheduled_date': '2026-01-15T09:30:00'},
            format='json',
        )

        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(valid.status_code, status.HTTP_200_OK, valid.content)
        self.pm_today.refresh_from_db()
        self.assertEqual(str(self.pm_today.scheduled_date.astimezone(ZoneInfo('America/New_York')).time()), '09:30:00')

    def test_cancelled_pm_is_not_counted_open_or_overdue(self):
        self.pm_today.status = 'cancelled'
        cancelled_at = timezone.now() - timedelta(hours=1)
        self.pm_today.scheduled_date = cancelled_at
        self.pm_today.save(update_fields=['status', 'scheduled_date'])
        _login(self.client, self.user)
        cancelled_date = timezone.localtime(
            cancelled_at, ZoneInfo(self.tenant.timezone)
        ).date().isoformat()

        response = self.client.get(self.schedule_url(
            **{'from': cancelled_date, 'days': 1, 'status': 'all'}
        ))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        bucket = response.data['days'][0]
        item = next(item for item in bucket['items'] if item['pm_id'] == self.pm_today.pm_id)
        self.assertEqual(item['calendar_status'], 'cancelled')
        self.assertEqual(bucket['cancelled_count'], 1)
        self.assertEqual(bucket['open_count'], 0)
        self.assertEqual(bucket['overdue_count'], 0)

    def test_schedule_uses_property_timezone_at_utc_date_boundary(self):
        self.tenant.timezone = 'America/Los_Angeles'
        self.tenant.save(update_fields=['timezone'])
        boundary = datetime(2026, 1, 2, 0, 30, tzinfo=ZoneInfo('UTC'))
        self.pm_today.scheduled_date = boundary
        self.pm_today.save(update_fields=['scheduled_date'])
        _login(self.client, self.user)

        response = self.client.get(self.schedule_url(
            **{'from': '2026-01-01', 'days': 1, 'status': 'all'}
        ))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['timezone'], 'America/Los_Angeles')
        self.assertEqual(response.data['days'][0]['date'], '2026-01-01')
        self.assertEqual(
            [item['pm_id'] for item in response.data['days'][0]['items']],
            [self.pm_today.pm_id],
        )


class PreventiveMaintenanceCreateTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='pm-tech', password='pw12345!')
        tenant = Tenant.objects.create(name='PM Create Tenant')
        self.prop = Property.objects.create(name='Hotel PM', tenant=tenant)
        TenantMembership.objects.create(user=self.user, tenant=tenant, role='technician').properties.add(self.prop)
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
        tenant = Tenant.objects.create(name='PM Plan Tenant')
        self.prop = Property.objects.create(name='Hotel Plan', tenant=tenant)
        TenantMembership.objects.create(user=self.user, tenant=tenant, role='technician').properties.add(self.prop)
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
        resp = self.client.get(
            f'/api/v1/preventive-maintenance/schedule/?days=30&status=open&property_id={self.prop.property_id}'
        )

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
