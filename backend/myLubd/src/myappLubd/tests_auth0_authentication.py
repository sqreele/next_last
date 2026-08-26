from django.contrib.auth import get_user_model
from rest_framework import exceptions
from rest_framework.test import APITestCase
from unittest.mock import Mock, patch
from django.test import override_settings
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

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

    def test_duplicate_email_is_rejected(self):
        User.objects.create_user(username='duplicate', email='PERSON@example.com')
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._get_or_create_user_from_claims({
                'sub': 'auth0|duplicate',
                'email': self.user.email,
                'email_verified': True,
            })

    def test_inactive_user_is_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._get_or_create_user_from_claims({
                'sub': 'auth0|inactive',
                'email': self.user.email,
                'email_verified': True,
            })


@override_settings(
    AUTH0_DOMAIN='tenant.auth0.com',
    AUTH0_ISSUER='https://tenant.auth0.com/',
    AUTH0_AUDIENCE='https://api.hotelcarepro.com',
)
class Auth0TokenValidationTests(APITestCase):
    def setUp(self):
        self.authenticator = Auth0JWTAuthentication()
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {'keys': [{'kid': 'key-1'}]}
        self.jwks_patcher = patch('myappLubd.auth.requests.get', return_value=response)
        self.header_patcher = patch(
            'myappLubd.auth.get_unverified_headers', return_value={'kid': 'key-1'}
        )
        self.jwks_patcher.start()
        self.header_patcher.start()
        self.addCleanup(self.jwks_patcher.stop)
        self.addCleanup(self.header_patcher.stop)

    @patch('myappLubd.auth.jwt.decode')
    @patch('myappLubd.auth.jwt.get_unverified_claims', return_value={})
    def test_missing_issuer_is_rejected(self, _claims, decode):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._validate_auth0_token('token')
        decode.assert_not_called()

    @patch('myappLubd.auth.jwt.decode')
    @patch(
        'myappLubd.auth.jwt.get_unverified_claims',
        return_value={'iss': 'https://evil.example/'},
    )
    def test_wrong_issuer_is_rejected(self, _claims, decode):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._validate_auth0_token('token')
        decode.assert_not_called()

    @patch('myappLubd.auth.jwt.decode', side_effect=JWTClaimsError('audience'))
    @patch(
        'myappLubd.auth.jwt.get_unverified_claims',
        return_value={'iss': 'https://tenant.auth0.com/'},
    )
    def test_wrong_audience_is_rejected(self, _claims, _decode):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._validate_auth0_token('token')

    @patch('myappLubd.auth.jwt.decode', side_effect=ExpiredSignatureError('expired'))
    @patch(
        'myappLubd.auth.jwt.get_unverified_claims',
        return_value={'iss': 'https://tenant.auth0.com/'},
    )
    def test_expired_token_is_rejected(self, _claims, _decode):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authenticator._validate_auth0_token('token')

    @patch('myappLubd.auth.jwt.decode', return_value={'sub': 'auth0|ok'})
    @patch(
        'myappLubd.auth.jwt.get_unverified_claims',
        return_value={'iss': 'https://tenant.auth0.com/'},
    )
    def test_signed_decode_requires_issuer_audience_exp_and_iat(self, _claims, decode):
        self.authenticator._validate_auth0_token('token')
        kwargs = decode.call_args.kwargs
        self.assertEqual(kwargs['issuer'], 'https://tenant.auth0.com/')
        self.assertEqual(kwargs['audience'], 'https://api.hotelcarepro.com')
        self.assertEqual(kwargs['algorithms'], ['RS256'])
        self.assertTrue(kwargs['options']['verify_signature'])
        self.assertTrue(kwargs['options']['verify_exp'])
        self.assertTrue(kwargs['options']['verify_iat'])
        self.assertTrue(kwargs['options']['verify_iss'])
        self.assertTrue(kwargs['options']['verify_aud'])
        self.assertTrue(kwargs['options']['require_exp'])
        self.assertTrue(kwargs['options']['require_iat'])
        self.assertTrue(kwargs['options']['require_iss'])
        self.assertTrue(kwargs['options']['require_aud'])
