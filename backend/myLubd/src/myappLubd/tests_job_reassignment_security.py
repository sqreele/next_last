from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Area, Job, Property, Room, Tenant, TenantMembership, UserProfile


User = get_user_model()


class JobReassignmentSecurityTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.actor = User.objects.create_user(username='reassign-actor')
        self.target = User.objects.create_user(username='reassign-target')
        self.foreign_target = User.objects.create_user(username='reassign-foreign')
        self.unauthorized_actor = User.objects.create_user(username='reassign-intruder')

        self.tenant_a = Tenant.objects.create(name='Reassignment Tenant A', owner=self.actor)
        self.tenant_b = Tenant.objects.create(name='Reassignment Tenant B', owner=self.foreign_target)
        actor_membership = TenantMembership.objects.create(
            tenant=self.tenant_a,
            user=self.actor,
            role='manager',
        )
        target_membership = TenantMembership.objects.create(
            tenant=self.tenant_a,
            user=self.target,
            role='technician',
        )
        foreign_membership = TenantMembership.objects.create(
            tenant=self.tenant_b,
            user=self.foreign_target,
            role='technician',
        )
        intruder_membership = TenantMembership.objects.create(
            tenant=self.tenant_b,
            user=self.unauthorized_actor,
            role='technician',
        )

        self.property_a = Property.objects.create(
            name='Reassignment Property A',
            tenant=self.tenant_a,
        )
        self.property_b = Property.objects.create(
            name='Reassignment Property B',
            tenant=self.tenant_b,
        )
        actor_membership.properties.add(self.property_a)
        target_membership.properties.add(self.property_a)
        foreign_membership.properties.add(self.property_b)
        intruder_membership.properties.add(self.property_b)
        self.property_a.users.add(self.actor, self.target)
        self.property_b.users.add(self.foreign_target, self.unauthorized_actor)

        self.room_a = Room.objects.create(name='Reassignment Room A', room_type='Plant')
        self.room_a.properties.add(self.property_a)
        self.area_a = Area.objects.create(property=self.property_a, name='Reassignment Area A')
        self.area_b = Area.objects.create(property=self.property_b, name='Reassignment Area B')
        self.client.force_authenticate(self.actor)

    def _job(self, *, room=None, area=None):
        job = Job.objects.create(
            user=self.actor,
            description='Security-sensitive reassignment',
            remarks='',
            status='pending',
            priority='medium',
            area=area,
        )
        if room is not None:
            job.rooms.add(room)
        return job

    def _reassign(self, job, target_id):
        return self.client.post(
            f'/api/v1/jobs/{job.job_id}/reassign/',
            {'user_id': target_id},
            format='json',
        )

    def _assert_assignment_unchanged(self, job):
        job.refresh_from_db()
        self.assertEqual(job.user_id, self.actor.pk)
        self.assertEqual(job.remarks, '')

    def test_room_only_job_allows_user_with_property_access(self):
        job = self._job(room=self.room_a)

        response = self._reassign(job, self.target.pk)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        job.refresh_from_db()
        self.assertEqual(job.user_id, self.target.pk)

    def test_room_only_job_denies_foreign_property_user_without_mutation(self):
        job = self._job(room=self.room_a)

        response = self._reassign(job, self.foreign_target.pk)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self._assert_assignment_unchanged(job)

    def test_area_only_job_allows_user_with_property_access(self):
        job = self._job(area=self.area_a)

        response = self._reassign(job, self.target.pk)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        job.refresh_from_db()
        self.assertEqual(job.user_id, self.target.pk)

    def test_area_only_job_denies_foreign_property_user_without_mutation(self):
        job = self._job(area=self.area_a)

        response = self._reassign(job, self.foreign_target.pk)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self._assert_assignment_unchanged(job)

    def test_room_and_area_same_property_allow_authorized_user(self):
        job = self._job(room=self.room_a, area=self.area_a)

        response = self._reassign(job, self.target.pk)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        job.refresh_from_db()
        self.assertEqual(job.user_id, self.target.pk)

    def test_room_and_area_conflict_fails_closed_without_mutation(self):
        job = self._job(room=self.room_a, area=self.area_b)

        response = self._reassign(job, self.target.pk)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self._assert_assignment_unchanged(job)

    def test_job_without_property_scope_fails_closed_without_mutation(self):
        job = self._job()
        self.actor.is_staff = True
        self.actor.save(update_fields=['is_staff'])

        response = self._reassign(job, self.target.pk)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self._assert_assignment_unchanged(job)

    def test_canonical_user_id_is_accepted(self):
        job = self._job(room=self.room_a)

        response = self._reassign(job, self.target.pk)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        job.refresh_from_db()
        self.assertEqual(job.user_id, self.target.pk)

    def test_profile_id_is_not_silently_treated_as_user_id(self):
        self.target.userprofile.delete()
        replacement_profile = UserProfile.objects.create(user=self.target)
        self.assertNotEqual(replacement_profile.pk, self.target.pk)
        self.assertFalse(User.objects.filter(pk=replacement_profile.pk).exists())
        job = self._job(room=self.room_a)

        response = self._reassign(job, replacement_profile.pk)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_assignment_unchanged(job)

    def test_cross_tenant_target_is_denied_without_mutation(self):
        job = self._job(room=self.room_a)

        response = self._reassign(job, self.foreign_target.pk)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self._assert_assignment_unchanged(job)

    def test_unauthorized_actor_cannot_reassign_job(self):
        job = self._job(room=self.room_a)
        self.client.force_authenticate(self.unauthorized_actor)

        response = self._reassign(job, self.foreign_target.pk)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_assignment_unchanged(job)

    def test_username_is_not_accepted_as_canonical_user_id(self):
        job = self._job(room=self.room_a)

        response = self._reassign(job, self.target.username)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self._assert_assignment_unchanged(job)
