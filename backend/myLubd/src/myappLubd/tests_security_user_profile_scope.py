from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Property, Tenant, TenantMembership


User = get_user_model()


class UserProfilePropertyAccessSecurityTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager_a = User.objects.create_user(username='manager-a', password='pw12345!')
        self.member_a = User.objects.create_user(username='member-a', password='pw12345!')
        self.member_b = User.objects.create_user(username='member-b', password='pw12345!')
        self.tenant_a = Tenant.objects.create(name='Profile Tenant A', owner=self.manager_a)
        self.tenant_b = Tenant.objects.create(name='Profile Tenant B', owner=self.member_b)
        self.manager_membership = TenantMembership.objects.create(
            tenant=self.tenant_a, user=self.manager_a, role='owner'
        )
        self.member_a_membership = TenantMembership.objects.create(
            tenant=self.tenant_a, user=self.member_a, role='technician'
        )
        self.member_b_membership = TenantMembership.objects.create(
            tenant=self.tenant_b, user=self.member_b, role='owner'
        )
        self.property_a = Property.objects.create(name='Profile Property A', tenant=self.tenant_a)
        self.property_b = Property.objects.create(name='Profile Property B', tenant=self.tenant_b)
        self.manager_membership.properties.add(self.property_a)
        self.property_a.users.add(self.manager_a)
        self.manager_a.userprofile.properties.add(self.property_a)
        self.client.force_authenticate(self.manager_a)

    def _grant_url(self, user):
        return f'/api/v1/user-profiles/{user.userprofile.pk}/add_property/'

    def _remove_url(self, user):
        return f'/api/v1/user-profiles/{user.userprofile.pk}/remove_property/'

    def test_authorized_list_contains_same_tenant_profiles(self):
        response = self.client.get('/api/v1/user-profiles/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(
            {row['username'] for row in response.data},
            {self.manager_a.username, self.member_a.username},
        )

    def test_cross_tenant_profile_is_excluded_from_list_and_detailed_options(self):
        list_response = self.client.get('/api/v1/user-profiles/')
        options_response = self.client.get('/api/v1/user-profiles/detailed/')

        self.assertNotIn(self.member_b.username, {row['username'] for row in list_response.data})
        self.assertNotIn(self.member_b.username, {row['username'] for row in options_response.data})

    def test_direct_foreign_profile_detail_is_not_found(self):
        response = self.client.get(f'/api/v1/user-profiles/{self.member_b.userprofile.pk}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)

    def test_authorized_property_grant_updates_all_access_relations(self):
        response = self.client.post(
            self._grant_url(self.member_a), {'property_id': self.property_a.property_id}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertTrue(self.member_a_membership.properties.filter(pk=self.property_a.pk).exists())
        self.assertTrue(self.property_a.users.filter(pk=self.member_a.pk).exists())
        self.assertTrue(self.member_a.userprofile.properties.filter(pk=self.property_a.pk).exists())

    def test_foreign_property_grant_is_denied_without_side_effects(self):
        response = self.client.post(
            self._grant_url(self.member_a), {'property_id': self.property_b.property_id}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.assertFalse(self.member_a_membership.properties.filter(pk=self.property_b.pk).exists())
        self.assertFalse(self.property_b.users.filter(pk=self.member_a.pk).exists())
        self.assertFalse(self.member_a.userprofile.properties.filter(pk=self.property_b.pk).exists())

    def test_authorized_property_removal_updates_all_access_relations(self):
        self.member_a_membership.properties.add(self.property_a)
        self.property_a.users.add(self.member_a)
        self.member_a.userprofile.properties.add(self.property_a)

        response = self.client.post(
            self._remove_url(self.member_a), {'property_id': self.property_a.property_id}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertFalse(self.member_a_membership.properties.filter(pk=self.property_a.pk).exists())
        self.assertFalse(self.property_a.users.filter(pk=self.member_a.pk).exists())
        self.assertFalse(self.member_a.userprofile.properties.filter(pk=self.property_a.pk).exists())

    def test_foreign_property_removal_is_denied_and_relationship_remains(self):
        self.member_b_membership.properties.add(self.property_b)
        self.property_b.users.add(self.member_b)
        self.member_b.userprofile.properties.add(self.property_b)

        response = self.client.post(
            self._remove_url(self.member_b), {'property_id': self.property_b.property_id}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.assertTrue(self.member_b_membership.properties.filter(pk=self.property_b.pk).exists())
        self.assertTrue(self.property_b.users.filter(pk=self.member_b.pk).exists())
        self.assertTrue(self.member_b.userprofile.properties.filter(pk=self.property_b.pk).exists())

    def test_unprivileged_user_cannot_update_same_tenant_peer_profile(self):
        self.client.force_authenticate(self.member_a)

        response = self.client.patch(
            f'/api/v1/user-profiles/{self.manager_a.userprofile.pk}/',
            {'positions': 'Escalated'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.manager_a.userprofile.refresh_from_db()
        self.assertNotEqual(self.manager_a.userprofile.positions, 'Escalated')

    def test_self_profile_read_and_safe_update_are_preserved(self):
        self.client.force_authenticate(self.member_a)

        me_response = self.client.get('/api/v1/user-profiles/me/')
        update_response = self.client.patch(
            f'/api/v1/user-profiles/{self.member_a.userprofile.pk}/',
            {'positions': 'Engineer'},
            format='json',
        )

        self.assertEqual(me_response.status_code, status.HTTP_200_OK, me_response.content)
        self.assertEqual(update_response.status_code, status.HTTP_200_OK, update_response.content)
        self.member_a.userprofile.refresh_from_db()
        self.assertEqual(self.member_a.userprofile.positions, 'Engineer')

    def test_profile_write_cannot_escalate_property_or_staff_fields(self):
        self.client.force_authenticate(self.member_a)

        response = self.client.patch(
            f'/api/v1/user-profiles/{self.member_a.userprofile.pk}/',
            {
                'properties': [self.property_b.pk],
                'is_staff': True,
                'is_superuser': True,
                'role': 'owner',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.member_a.refresh_from_db()
        self.assertFalse(self.member_a.is_staff)
        self.assertFalse(self.member_a.is_superuser)
        self.assertFalse(self.member_a.userprofile.properties.filter(pk=self.property_b.pk).exists())

    def test_unprivileged_user_cannot_grant_property_even_to_self(self):
        self.client.force_authenticate(self.member_a)

        response = self.client.post(
            self._grant_url(self.member_a), {'property_id': self.property_a.property_id}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.assertFalse(self.member_a_membership.properties.filter(pk=self.property_a.pk).exists())

    def test_inactive_target_membership_cannot_receive_property_grant(self):
        self.member_a_membership.is_active = False
        self.member_a_membership.save(update_fields=['is_active'])

        response = self.client.post(
            self._grant_url(self.member_a), {'property_id': self.property_a.property_id}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.assertFalse(self.member_a.userprofile.properties.filter(pk=self.property_a.pk).exists())
