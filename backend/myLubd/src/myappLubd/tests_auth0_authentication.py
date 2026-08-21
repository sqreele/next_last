from django.contrib.auth import get_user_model
from rest_framework import exceptions
from rest_framework.test import APITestCase

from .auth import Auth0JWTAuthentication
from .models import Property, Tenant, TenantMembership


User = get_user_model()


class Auth0AccountMatchingTests(APITestCase):
    def setUp(self):
        self.authenticator = Auth0JWTAuthentication()
        self.user = User.objects.create_user(
            username='existing-user',
            email='person@example.com',
        )
        self.tenant = Tenant.objects.create(name='Auth0 Existing Tenant')
        self.property = Property.objects.create(name='Existing Hotel', tenant=self.tenant)
        self.membership = TenantMembership.objects.create(
            user=self.user, tenant=self.tenant, role='viewer'
        )
        self.membership.properties.add(self.property)

    def test_verified_email_matches_existing_user_case_insensitively(self):
        result = self.authenticator._get_or_create_user_from_claims({
            'sub': 'auth0|123',
            'https://hotelcarepro.com/email': 'PERSON@EXAMPLE.COM',
            'https://hotelcarepro.com/email_verified': True,
        })

        self.assertEqual(result, self.user)
        self.assertEqual(list(self.membership.properties.all()), [self.property])
        self.assertEqual(User.objects.count(), 1)

    def test_unknown_email_does_not_create_user(self):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._get_or_create_user_from_claims({
                'sub': 'auth0|456',
                'https://hotelcarepro.com/email': 'unknown@example.com',
                'https://hotelcarepro.com/email_verified': True,
            })

        self.assertEqual(User.objects.count(), 1)

    def test_unverified_email_is_rejected(self):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._get_or_create_user_from_claims({
                'sub': 'auth0|789',
                'https://hotelcarepro.com/email': self.user.email,
                'https://hotelcarepro.com/email_verified': False,
            })

    def test_username_collision_does_not_match_another_email(self):
        User.objects.create_user(username='collision', email='owner@example.com')

        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._get_or_create_user_from_claims({
                'sub': 'auth0|999',
                'https://hotelcarepro.com/email': 'collision@attacker.example',
                'https://hotelcarepro.com/email_verified': True,
            })

    def test_legacy_standard_email_claims_remain_compatible(self):
        result = self.authenticator._get_or_create_user_from_claims({
            'sub': 'auth0|legacy',
            'email': self.user.email,
            'email_verified': True,
        })

        self.assertEqual(result, self.user)
