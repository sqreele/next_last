from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Property, Tenant, TenantMembership, UserProfile


User = get_user_model()


class CurrentUserProfileApiTests(APITestCase):
    url = '/api/v1/user-profiles/me/'

    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(
            username='alice-profile',
            email='alice@example.com',
            first_name='Alice',
            password='pw12345!',
        )
        self.bob = User.objects.create_user(
            username='bob-profile',
            email='bob@example.com',
            password='pw12345!',
        )
        self.alice_profile = UserProfile.objects.get(user=self.alice)
        self.alice_profile.positions = 'Engineer'
        self.alice_profile.save(update_fields=['positions'])

        self.tenant_a = Tenant.objects.create(name='Profile Tenant A')
        self.tenant_b = Tenant.objects.create(name='Profile Tenant B')
        self.a1 = Property.objects.create(name='Profile A1', tenant=self.tenant_a)
        self.a2 = Property.objects.create(name='Profile A2', tenant=self.tenant_a)
        self.b1 = Property.objects.create(name='Profile B1', tenant=self.tenant_b)

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.alice)

    def test_anonymous_user_is_denied(self):
        response = self.client.get(self.url)
        self.assertIn(
            response.status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )

    def test_current_user_receives_minimal_non_sensitive_payload(self):
        membership = TenantMembership.objects.create(
            tenant=self.tenant_a, user=self.alice, role='viewer',
        )
        membership.properties.add(self.a1)
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['email'], 'alice@example.com')
        self.assertEqual(response.data['memberships'][0]['role'], 'viewer')
        self.assertEqual(response.data['memberships'][0]['access_scope'], 'granted')
        self.assertEqual(
            [item['property_id'] for item in response.data['properties']],
            [self.a1.property_id],
        )
        for sensitive_field in (
            'id', 'user', 'password', 'access_token', 'refresh_token',
            'google_id', 'is_staff', 'property_id', 'profile_property_id',
        ):
            self.assertNotIn(sensitive_field, response.data)

    def test_multiple_memberships_are_not_merged_or_arbitrarily_selected(self):
        TenantMembership.objects.create(
            tenant=self.tenant_a, user=self.alice, role='manager',
        )
        restricted = TenantMembership.objects.create(
            tenant=self.tenant_b, user=self.alice, role='billing',
        )
        restricted.properties.add(self.b1)
        self.authenticate()

        response = self.client.get(self.url)

        memberships = {item['tenant_id']: item for item in response.data['memberships']}
        self.assertEqual(memberships[self.tenant_a.tenant_id]['role'], 'manager')
        self.assertEqual(memberships[self.tenant_a.tenant_id]['access_scope'], 'tenant_wide')
        self.assertEqual(
            {item['property_id'] for item in memberships[self.tenant_a.tenant_id]['properties']},
            {self.a1.property_id, self.a2.property_id},
        )
        self.assertEqual(memberships[self.tenant_b.tenant_id]['role'], 'billing')
        self.assertEqual(
            [item['property_id'] for item in memberships[self.tenant_b.tenant_id]['properties']],
            [self.b1.property_id],
        )

    def test_inactive_membership_is_excluded(self):
        membership = TenantMembership.objects.create(
            tenant=self.tenant_a, user=self.alice, role='owner', is_active=False,
        )
        membership.properties.add(self.a1)
        self.authenticate()

        response = self.client.get(self.url)

        self.assertEqual(response.data['memberships'], [])
        self.assertEqual(response.data['properties'], [])

    def test_patch_updates_only_profile_metadata_and_returns_authoritative_profile(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {'first_name': 'Alicia', 'last_name': 'Example', 'positions': 'Chief Engineer'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.alice.refresh_from_db()
        self.alice_profile.refresh_from_db()
        self.assertEqual(self.alice.first_name, 'Alicia')
        self.assertEqual(self.alice.last_name, 'Example')
        self.assertEqual(self.alice_profile.positions, 'Chief Engineer')
        self.assertEqual(response.data['display_name'], 'Alicia Example')

    def test_patch_rejects_authorization_and_identity_fields(self):
        membership = TenantMembership.objects.create(
            tenant=self.tenant_a, user=self.alice, role='viewer',
        )
        self.authenticate()
        forbidden = {
            'email': 'attacker@example.com',
            'role': 'owner',
            'tenant_id': self.tenant_b.tenant_id,
            'properties': [self.a2.property_id],
            'is_staff': True,
            'is_superuser': True,
            'user_id': self.bob.pk,
            'email_verified': True,
        }

        response = self.client.patch(self.url, forbidden, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.alice.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(self.alice.email, 'alice@example.com')
        self.assertFalse(self.alice.is_staff)
        self.assertFalse(self.alice.is_superuser)
        self.assertEqual(membership.role, 'viewer')
        self.assertFalse(membership.properties.exists())
        self.assertEqual(set(response.data), set(forbidden))

    def test_patch_returns_field_validation_errors(self):
        self.authenticate()
        response = self.client.patch(
            self.url,
            {'first_name': 'x' * 151},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('first_name', response.data)

    def test_modified_profile_id_cannot_read_or_write_another_user(self):
        self.authenticate()
        bob_profile = UserProfile.objects.get(user=self.bob)

        read_response = self.client.get(f'/api/v1/user-profiles/{bob_profile.pk}/')
        write_response = self.client.patch(
            f'/api/v1/user-profiles/{bob_profile.pk}/',
            {'positions': 'Owner'},
            format='json',
        )

        self.assertEqual(read_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(write_response.status_code, status.HTTP_404_NOT_FOUND)
        bob_profile.refresh_from_db()
        self.assertIsNone(bob_profile.positions)

    def test_legacy_auth0_update_cannot_change_email(self):
        self.authenticate()
        response = self.client.post(
            '/api/v1/auth/profile/update/',
            {'auth0_profile': {'email': 'attacker@example.com', 'given_name': 'Alicia'}},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.email, 'alice@example.com')
        self.assertEqual(self.alice.first_name, 'Alicia')
