from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase

from .admin import DeletedJobAdmin, JobAdmin
from .models import DeletedJob, Job, JobComment, Property


User = get_user_model()


class JobSoftDeleteTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='trash-admin', password='pw12345!')
        self.property = Property.objects.create(name='Recoverable Jobs Hotel')
        self.job = Job.objects.create(
            user=self.user,
            property=self.property,
            description='Recover this job',
            remarks='Must retain related records',
        )
        self.comment = JobComment.objects.create(
            job=self.job,
            author=self.user,
            comment='Keep this comment',
        )

    def test_instance_delete_hides_job_but_retains_related_data(self):
        self.job.delete(deleted_by=self.user)

        self.assertFalse(Job.objects.filter(pk=self.job.pk).exists())
        deleted = Job.all_objects.get(pk=self.job.pk)
        self.assertIsNotNone(deleted.deleted_at)
        self.assertEqual(deleted.deleted_by, self.user)
        self.assertTrue(JobComment.objects.filter(pk=self.comment.pk).exists())

    def test_restore_returns_job_to_normal_manager(self):
        self.job.delete(deleted_by=self.user)

        deleted = DeletedJob.objects.get(pk=self.job.pk)
        self.assertTrue(deleted.restore())

        restored = Job.objects.get(pk=self.job.pk)
        self.assertIsNone(restored.deleted_at)
        self.assertIsNone(restored.deleted_by)

    def test_bulk_delete_is_recoverable(self):
        Job.objects.filter(pk=self.job.pk).delete()

        self.assertFalse(Job.objects.filter(pk=self.job.pk).exists())
        self.assertTrue(DeletedJob.objects.filter(pk=self.job.pk).exists())

    def test_admin_delete_records_the_admin_user(self):
        request = RequestFactory().post('/admin/myappLubd/job/')
        request.user = self.user

        JobAdmin(Job, AdminSite()).delete_model(request, self.job)

        self.assertEqual(Job.all_objects.get(pk=self.job.pk).deleted_by, self.user)

    def test_deleted_job_admin_action_restores_selected_jobs(self):
        self.job.delete(deleted_by=self.user)
        request = RequestFactory().post('/admin/myappLubd/deletedjob/')
        request.user = self.user
        request._messages = _MessageCollector()

        DeletedJobAdmin(DeletedJob, AdminSite()).restore_jobs(
            request,
            DeletedJob.objects.filter(pk=self.job.pk),
        )

        self.assertTrue(Job.objects.filter(pk=self.job.pk).exists())


class _MessageCollector:
    def add(self, level, message, extra_tags=''):
        pass
