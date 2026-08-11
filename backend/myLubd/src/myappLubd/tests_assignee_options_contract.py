from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Job, Property, Room, Tenant, TenantMembership, UserProfile
from .serializers import PreventiveMaintenanceCreateUpdateSerializer


User = get_user_model()


class AssigneeOptionsContractTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = User.objects.create_user(
            username='option-manager', email='manager@example.com', password='pw12345!'
        )
        self.assignee = User.objects.create_user(
            username='option-assignee',
            email='assignee@example.com',
            first_name='Option',
            last_name='Assignee',
            password='pw12345!',
        )
        self.foreign = User.objects.create_user(
            username='option-foreign', email='foreign@example.com', password='pw12345!'
        )
        self.inactive = User.objects.create_user(
            username='option-inactive', email='inactive@example.com', password='pw12345!'
        )
        self.inactive.is_active = False
        self.inactive.save(update_fields=['is_active'])

        self.tenant = Tenant.objects.create(name='Assignee Options Tenant', owner=self.manager)
        self.foreign_tenant = Tenant.objects.create(name='Foreign Options Tenant', owner=self.foreign)
        self.manager_membership = TenantMembership.objects.create(
            tenant=self.tenant, user=self.manager, role='owner'
        )
        self.assignee_membership = TenantMembership.objects.create(
            tenant=self.tenant, user=self.assignee, role='technician'
        )
        TenantMembership.objects.create(
            tenant=self.tenant, user=self.inactive, role='technician'
        )
        TenantMembership.objects.create(
            tenant=self.foreign_tenant, user=self.foreign, role='owner'
        )
        self.property = Property.objects.create(name='Assignee Options Property', tenant=self.tenant)
        self.foreign_property = Property.objects.create(
            name='Foreign Options Property', tenant=self.foreign_tenant
        )
        self.manager_membership.properties.add(self.property)
        self.assignee_membership.properties.add(self.property)
        self.property.users.add(self.manager, self.assignee)
        self.manager.userprofile.properties.add(self.property)
        self.assignee.userprofile.properties.add(self.property)
        self.client.force_authenticate(self.manager)

    def _options(self):
        return self.client.get('/api/v1/user-profiles/assignee-options/')

    def test_authorized_assignee_list_uses_raw_array_transport(self):
        response = self._options()

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertIsInstance(response.data, list)
        self.assertEqual(
            {row['username'] for row in response.data},
            {self.manager.username, self.assignee.username},
        )

    def test_cross_tenant_and_inactive_users_are_excluded(self):
        response = self._options()
        usernames = {row['username'] for row in response.data}

        self.assertNotIn(self.foreign.username, usernames)
        self.assertNotIn(self.inactive.username, usernames)

    def test_canonical_and_profile_identifiers_reference_the_correct_models(self):
        response = self._options()
        row = next(item for item in response.data if item['username'] == self.assignee.username)

        self.assertEqual(row['user_id'], self.assignee.pk)
        self.assertEqual(row['profile_id'], self.assignee.userprofile.pk)

    def test_user_and_profile_id_mismatch_does_not_change_canonical_identity(self):
        drift_user = User.objects.create_user(username='profile-sequence-drift')
        drift_user.userprofile.delete()
        UserProfile.objects.create(user=drift_user)
        mismatched = User.objects.create_user(
            username='mismatched-assignee', email='mismatch@example.com'
        )
        TenantMembership.objects.create(
            tenant=self.tenant, user=mismatched, role='technician'
        )
        self.assertNotEqual(mismatched.pk, mismatched.userprofile.pk)

        response = self._options()
        row = next(item for item in response.data if item['username'] == mismatched.username)

        self.assertEqual(row['user_id'], mismatched.pk)
        self.assertEqual(row['profile_id'], mismatched.userprofile.pk)

    def test_job_reassign_accepts_canonical_user_id(self):
        room = Room.objects.create(name='Assignee Option Room', room_type='Plant')
        room.properties.add(self.property)
        job = Job.objects.create(
            user=self.manager,
            description='Assignment identity contract',
            status='pending',
            priority='medium',
        )
        job.rooms.add(room)
        option = next(
            item for item in self._options().data if item['username'] == self.assignee.username
        )

        response = self.client.post(
            f'/api/v1/jobs/{job.job_id}/reassign/',
            {'user_id': option['user_id']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        job.refresh_from_db()
        self.assertEqual(job.user_id, self.assignee.pk)

    def test_pm_assigned_to_field_accepts_canonical_user_id(self):
        option = next(
            item for item in self._options().data if item['username'] == self.assignee.username
        )
        field = PreventiveMaintenanceCreateUpdateSerializer().fields['assigned_to']

        resolved_user = field.to_internal_value(option['user_id'])

        self.assertEqual(resolved_user, self.assignee)

    def test_machine_has_no_assignee_write_identity(self):
        from .serializers import MachineSerializer

        self.assertNotIn('assigned_to', MachineSerializer().fields)

    def test_contract_exposes_only_narrow_non_sensitive_fields(self):
        response = self._options()
        row = response.data[0]

        self.assertEqual(
            set(row),
            {
                'user_id',
                'profile_id',
                'username',
                'email',
                'first_name',
                'last_name',
                'display_name',
                'positions',
                'properties',
            },
        )
        for forbidden in ('password', 'permissions', 'is_staff', 'is_superuser', 'access_token'):
            self.assertNotIn(forbidden, row)
        self.assertEqual(
            set(row['properties'][0]), {'id', 'property_id', 'name'}
        )

    def test_legacy_detailed_id_remains_profile_id(self):
        response = self.client.get('/api/v1/user-profiles/detailed/')
        row = next(item for item in response.data if item['username'] == self.assignee.username)

        self.assertEqual(row['id'], self.assignee.userprofile.pk)
        self.assertNotIn('user_id', row)
