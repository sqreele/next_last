from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase

from .admin import JobAdmin
from .models import Job, Room


User = get_user_model()


class JobAdminSearchTests(TestCase):
    def setUp(self):
        self.request = RequestFactory().get('/admin/myappLubd/job/')
        self.admin = JobAdmin(Job, AdminSite())
        self.user = User.objects.create_user(username='engineer', password='pw12345!')
        self.room = Room.objects.create(name='LUBD-1205', room_type='Deluxe')
        self.job = Job.objects.create(
            user=self.user,
            description='Replace air filter',
            remarks='Admin search test',
            status='pending',
            priority='medium',
        )
        self.job.rooms.add(self.room)

    def test_search_matches_room_name(self):
        queryset, _ = self.admin.get_search_results(self.request, Job.objects.all(), '1205')

        self.assertIn(self.job, queryset)

    def test_search_does_not_match_room_id(self):
        queryset, _ = self.admin.get_search_results(
            self.request,
            Job.objects.all(),
            str(self.room.room_id),
        )

        self.assertNotIn(self.job, queryset)

    def test_search_does_not_match_description(self):
        queryset, _ = self.admin.get_search_results(
            self.request,
            Job.objects.all(),
            'Replace air filter',
        )

        self.assertNotIn(self.job, queryset)
