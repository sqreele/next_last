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
    PreventiveMaintenance,
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

        self.room_a = Room.objects.create(name='A-101', room_type='Standard')
        self.room_a.properties.add(self.prop_a)

        self.room_b = Room.objects.create(name='B-201', room_type='Standard')
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
        self.user = User.objects.create_user(username='tech', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel X')
        self.prop.users.add(self.user)
        self.room = Room.objects.create(name='101', room_type='Standard')
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
        self.room = Room.objects.create(name='S-1', room_type='Standard')
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

    def test_schedule_is_tenant_scoped(self):
        other = User.objects.create_user(username='outsider', password='pw12345!')
        _login(self.client, other)
        resp = self.client.get('/api/v1/preventive-maintenance/schedule/?days=30')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['total'], 0)
