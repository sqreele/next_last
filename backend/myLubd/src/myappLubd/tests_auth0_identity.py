from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import exceptions

from .auth import Auth0JWTAuthentication
from .models import Property, Tenant, TenantMembership


User = get_user_model()


class Auth0IdentityMatchingTests(TestCase):
    def setUp(self):
        self.authentication = Auth0JWTAuthentication()

    def test_verified_namespaced_email_reuses_existing_user_and_access(self):
        existing_user = User.objects.create_user(
            username='existing-user',
            email='existing@example.com',
        )
        tenant = Tenant.objects.create(name='Auth0 Identity Tenant')
        property_obj = Property.objects.create(name='Existing Hotel', tenant=tenant)
        membership = TenantMembership.objects.create(
            user=existing_user, tenant=tenant, role='viewer'
        )
        membership.properties.add(property_obj)

        authenticated_user = self.authentication._get_or_create_user_from_claims(
            {
                'sub': 'auth0|new-tenant-identity',
                'https://hotelcarepro.com/email': 'existing@example.com',
                'https://hotelcarepro.com/email_verified': True,
            }
        )

        self.assertEqual(authenticated_user.pk, existing_user.pk)
        self.assertTrue(membership.properties.filter(pk=property_obj.pk).exists())
        self.assertEqual(User.objects.count(), 1)

    def test_unverified_namespaced_email_does_not_merge_accounts(self):
        existing_user = User.objects.create_user(
            username='existing-user',
            email='existing@example.com',
        )

        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authentication._get_or_create_user_from_claims(
                {
                    'sub': 'auth0|different-identity',
                    'https://hotelcarepro.com/email': 'existing@example.com',
                    'https://hotelcarepro.com/email_verified': False,
                }
            )

        self.assertEqual(User.objects.count(), 1)
