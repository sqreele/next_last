"""Tests for the materialize_due_pm_jobs and escalate_stale_jobs management
   commands. Both commands are intended to run on cron, so the most important
   property to verify is idempotency — running twice does not double-write."""

from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import Job, PreventiveMaintenance, Property, Room, Topic


User = get_user_model()


class MaterializeDuePmJobsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel A')
        self.prop.users.add(self.user)
        self.topic = Topic.objects.create(title='HVAC')

    def _make_pm(self, *, scheduled_offset_minutes, status='pending'):
        pm = PreventiveMaintenance.objects.create(
            pmtitle='Quarterly HVAC',
            scheduled_date=timezone.now() + timedelta(minutes=scheduled_offset_minutes),
            frequency='quarterly',
            status=status,
            priority='medium',
            assigned_to=self.user,
        )
        pm.topics.add(self.topic)
        return pm

    def test_due_pm_gets_a_job_linked(self):
        pm = self._make_pm(scheduled_offset_minutes=-10)
        out = StringIO()
        call_command('materialize_due_pm_jobs', stdout=out)
        pm.refresh_from_db()
        self.assertIsNotNone(pm.job_id, 'PM should now have a linked Job.')
        self.assertEqual(pm.status, 'in_progress')

        job = pm.job
        self.assertEqual(job.user, self.user)
        self.assertTrue(job.is_preventivemaintenance)
        self.assertEqual(job.status, 'pending')
        self.assertIn('Quarterly HVAC', job.description)
        topic_titles = list(job.topics.values_list('title', flat=True))
        self.assertEqual(topic_titles, ['HVAC'])

    def test_running_twice_does_not_duplicate(self):
        pm = self._make_pm(scheduled_offset_minutes=-10)
        call_command('materialize_due_pm_jobs', stdout=StringIO())
        call_command('materialize_due_pm_jobs', stdout=StringIO())
        # Exactly one Job materialized, exactly one PM linked.
        self.assertEqual(Job.objects.filter(is_preventivemaintenance=True).count(), 1)
        pm.refresh_from_db()
        self.assertIsNotNone(pm.job_id)

    def test_future_pm_is_not_materialized(self):
        self._make_pm(scheduled_offset_minutes=120)
        call_command('materialize_due_pm_jobs', stdout=StringIO())
        self.assertFalse(Job.objects.filter(is_preventivemaintenance=True).exists())

    def test_lead_minutes_picks_up_near_future_work(self):
        self._make_pm(scheduled_offset_minutes=30)
        call_command('materialize_due_pm_jobs', '--lead-minutes', '60', stdout=StringIO())
        self.assertEqual(Job.objects.filter(is_preventivemaintenance=True).count(), 1)

    def test_completed_pm_is_skipped(self):
        pm = self._make_pm(scheduled_offset_minutes=-30, status='completed')
        pm.completed_date = timezone.now()
        pm.save(update_fields=['completed_date'])
        call_command('materialize_due_pm_jobs', stdout=StringIO())
        pm.refresh_from_db()
        self.assertIsNone(pm.job_id, 'Completed PM should not get a job.')

    def test_dry_run_writes_nothing(self):
        self._make_pm(scheduled_offset_minutes=-10)
        call_command('materialize_due_pm_jobs', '--dry-run', stdout=StringIO())
        self.assertFalse(Job.objects.exists())


class EscalateStaleJobsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tech', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel Stale')
        self.prop.users.add(self.user)
        self.room = Room.objects.create(name='201', room_type='Suite')
        self.room.properties.add(self.prop)

    def _make_job(self, *, hours_old, priority='low', status='pending'):
        job = Job.objects.create(
            user=self.user,
            description='Stale job',
            remarks='',
            status=status,
            priority=priority,
        )
        old_time = timezone.now() - timedelta(hours=hours_old)
        # save() refreshes updated_at, so push it back via direct update().
        Job.objects.filter(pk=job.pk).update(updated_at=old_time)
        job.refresh_from_db()
        return job

    def test_stale_low_priority_gets_escalated_to_high(self):
        job = self._make_job(hours_old=30, priority='low')
        call_command('escalate_stale_jobs', '--hours-pending', '24', stdout=StringIO())
        job.refresh_from_db()
        self.assertEqual(job.priority, 'high')
        self.assertIn('escalated', job.remarks)

    def test_fresh_jobs_left_alone(self):
        job = self._make_job(hours_old=2, priority='low')
        call_command('escalate_stale_jobs', '--hours-pending', '24', stdout=StringIO())
        job.refresh_from_db()
        self.assertEqual(job.priority, 'low')

    def test_running_twice_is_idempotent(self):
        job = self._make_job(hours_old=30, priority='low')
        call_command('escalate_stale_jobs', '--hours-pending', '24', stdout=StringIO())
        job.refresh_from_db()
        first_remarks = job.remarks
        call_command('escalate_stale_jobs', '--hours-pending', '24', stdout=StringIO())
        job.refresh_from_db()
        self.assertEqual(job.priority, 'high')
        # Remarks must NOT grow on a second pass — the job is already at
        # target priority so escalation should short-circuit.
        self.assertEqual(job.remarks, first_remarks)

    def test_target_priority_argument(self):
        job = self._make_job(hours_old=30, priority='low')
        call_command(
            'escalate_stale_jobs',
            '--hours-pending', '24',
            '--target-priority', 'medium',
            stdout=StringIO(),
        )
        job.refresh_from_db()
        self.assertEqual(job.priority, 'medium')

    def test_completed_jobs_are_not_escalated(self):
        job = self._make_job(hours_old=72, priority='low', status='completed')
        call_command('escalate_stale_jobs', '--hours-pending', '24', stdout=StringIO())
        job.refresh_from_db()
        self.assertEqual(job.priority, 'low')

    def test_dry_run_writes_nothing(self):
        job = self._make_job(hours_old=30, priority='low')
        call_command(
            'escalate_stale_jobs',
            '--hours-pending', '24',
            '--dry-run',
            stdout=StringIO(),
        )
        job.refresh_from_db()
        self.assertEqual(job.priority, 'low')
