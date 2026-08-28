from unittest.mock import Mock, patch

from django.test import TestCase, override_settings
from jose.exceptions import ExpiredSignatureError, JWTClaimsError
from rest_framework import exceptions

from .auth import Auth0JWTAuthentication


@override_settings(
    AUTH0_DOMAIN='tenant.auth0.com',
    AUTH0_ISSUER='https://tenant.auth0.com/',
    AUTH0_AUDIENCE='https://api.staymaint.com',
)
class Auth0TokenValidationTests(TestCase):
    def setUp(self):
        self.authentication = Auth0JWTAuthentication()
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {'keys': [{'kid': 'key-1'}]}
        self.jwks = patch('myappLubd.auth.requests.get', return_value=response)
        self.headers = patch('myappLubd.auth.get_unverified_headers', return_value={'kid': 'key-1'})
        self.jwks.start()
        self.headers.start()
        self.addCleanup(self.jwks.stop)
        self.addCleanup(self.headers.stop)

    @patch('myappLubd.auth.jwt.decode')
    @patch('myappLubd.auth.jwt.get_unverified_claims', return_value={})
    def test_missing_issuer_is_rejected(self, _claims, decode):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authentication._validate_auth0_token('token')
        decode.assert_not_called()

    @patch('myappLubd.auth.jwt.decode')
    @patch('myappLubd.auth.jwt.get_unverified_claims', return_value={'iss': 'https://evil.example/'})
    def test_wrong_issuer_is_rejected(self, _claims, decode):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authentication._validate_auth0_token('token')
        decode.assert_not_called()

    @patch('myappLubd.auth.jwt.decode', side_effect=JWTClaimsError('audience'))
    @patch('myappLubd.auth.jwt.get_unverified_claims', return_value={'iss': 'https://tenant.auth0.com/'})
    def test_wrong_audience_is_rejected(self, _claims, _decode):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authentication._validate_auth0_token('token')

    @patch('myappLubd.auth.jwt.decode', side_effect=ExpiredSignatureError('expired'))
    @patch('myappLubd.auth.jwt.get_unverified_claims', return_value={'iss': 'https://tenant.auth0.com/'})
    def test_expired_token_is_rejected(self, _claims, _decode):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authentication._validate_auth0_token('token')

    @patch('myappLubd.auth.jwt.decode', return_value={'sub': 'auth0|ok'})
    @patch('myappLubd.auth.jwt.get_unverified_claims', return_value={'iss': 'https://tenant.auth0.com/'})
    def test_signed_decode_requires_current_validation_policy(self, _claims, decode):
        self.authentication._validate_auth0_token('token')
        kwargs = decode.call_args.kwargs
        self.assertEqual(kwargs['issuer'], 'https://tenant.auth0.com/')
        self.assertEqual(kwargs['audience'], 'https://api.staymaint.com')
        self.assertEqual(kwargs['algorithms'], ['RS256'])
        for option in ('verify_signature', 'verify_exp', 'verify_iat', 'verify_iss', 'verify_aud',
                       'require_exp', 'require_iat', 'require_iss', 'require_aud'):
            self.assertTrue(kwargs['options'][option])
