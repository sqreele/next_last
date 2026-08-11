from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Property, Tenant, TenantMembership, UserProfile


User = get_user_model()


class CurrentUserContractTests(APITestCase):
    endpoint = '/api/v1/user-profiles/me/'

    def setUp(self):
        self.client = APIClient()

        sequence_drift = User.objects.create_user(username='profile-sequence-drift')
        sequence_drift.userprofile.delete()
        UserProfile.objects.create(user=sequence_drift)

        self.user = User.objects.create_user(
            username='current-contract-user',
            email='current@example.com',
            password='pw12345!',
        )
        self.other_user = User.objects.create_user(
            username='other-contract-user',
            email='other@example.com',
            password='pw12345!',
        )
        self.assertNotEqual(self.user.pk, self.user.userprofile.pk)

        self.tenant = Tenant.objects.create(name='Current User Tenant', owner=self.user)
        self.other_tenant = Tenant.objects.create(
            name='Other Current User Tenant', owner=self.other_user
        )
        self.membership = TenantMembership.objects.create(
            tenant=self.tenant, user=self.user, role='owner'
        )
        TenantMembership.objects.create(
            tenant=self.other_tenant, user=self.other_user, role='owner'
        )
        self.property = Property.objects.create(name='Current User Property', tenant=self.tenant)
        self.other_property = Property.objects.create(
            name='Other User Property', tenant=self.other_tenant
        )
        self.membership.properties.add(self.property)
        self.property.users.add(self.user)
        self.user.userprofile.properties.add(self.property)
        self.client.force_authenticate(self.user)

    def test_current_user_response_exposes_explicit_distinct_identities(self):
        response = self.client.get(self.endpoint)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['user_id'], self.user.pk)
        self.assertEqual(response.data['profile_id'], self.user.userprofile.pk)
        self.assertNotEqual(response.data['user_id'], response.data['profile_id'])

    def test_legacy_id_remains_the_user_profile_primary_key(self):
        response = self.client.get(self.endpoint)

        self.assertEqual(response.data['id'], self.user.userprofile.pk)
        self.assertEqual(response.data['id'], response.data['profile_id'])

    def test_endpoint_returns_only_the_authenticated_callers_identity(self):
        response = self.client.get(self.endpoint)

        self.assertEqual(response.data['user_id'], self.user.pk)
        self.assertEqual(response.data['profile_id'], self.user.userprofile.pk)
        self.assertNotEqual(response.data['user_id'], self.other_user.pk)
        self.assertNotEqual(response.data['profile_id'], self.other_user.userprofile.pk)

    def test_auth_provider_identity_is_not_overloaded_as_an_application_pk(self):
        auth_subject = 'auth0|current-user-contract-subject'
        self.user.userprofile.google_id = auth_subject
        self.user.userprofile.save(update_fields=['google_id'])

        response = self.client.get(self.endpoint)

        self.assertIsInstance(response.data['user_id'], int)
        self.assertIsInstance(response.data['profile_id'], int)
        self.assertNotEqual(str(response.data['user_id']), auth_subject)
        self.assertNotEqual(str(response.data['profile_id']), auth_subject)
        self.assertNotIn('google_id', response.data)
        self.assertNotIn('auth_sub', response.data)

    def test_property_access_shape_and_isolation_are_preserved(self):
        response = self.client.get(self.endpoint)
        property_ids = {item['property_id'] for item in response.data['properties']}

        self.assertEqual(property_ids, {self.property.property_id})
        self.assertNotIn(self.other_property.property_id, property_ids)

    def test_missing_profile_preserves_safe_not_found_behavior(self):
        self.user.userprofile.delete()

        response = self.client.get(self.endpoint)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.assertFalse(UserProfile.objects.filter(user=self.user).exists())

    def test_anonymous_behavior_is_unchanged(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.endpoint)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

