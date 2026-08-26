from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserProfile


User = get_user_model()


@override_settings(LEGACY_APP_AUTH_ENABLED=False)
class LegacyApplicationAuthGateTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='legacy-user',
            email='legacy@example.com',
            password='strong-password',
        )

    def assert_no_tokens(self, response):
        payload = getattr(response, 'data', {})
        self.assertNotIn('access', payload)
        self.assertNotIn('refresh', payload)
        self.assertNotIn('session_token', payload)

    def test_anonymous_registration_is_disabled_and_creates_no_account(self):
        response = self.client.post(
            '/api/v1/auth/register/',
            {
                'username': 'public-signup',
                'email': 'signup@example.com',
                'password': 'strong-password',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(username='public-signup').exists())
        self.assert_no_tokens(response)

    def test_local_login_and_simplejwt_issue_are_disabled(self):
        credentials = {'username': self.user.username, 'password': 'strong-password'}
        for path in ('/api/v1/auth/login/', '/api/v1/token/'):
            response = self.client.post(path, credentials, format='json')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, path)
            self.assert_no_tokens(response)

    def test_simplejwt_refresh_is_disabled(self):
        response = self.client.post(
            '/api/v1/token/refresh/', {'refresh': 'attacker-controlled'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assert_no_tokens(response)

    def test_internally_minted_simplejwt_is_not_accepted_by_application_api(self):
        token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.get('/api/v1/auth/check/')
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_google_auth_and_password_recovery_are_disabled(self):
        for path, body in (
            ('/api/v1/auth/google/', {'id_token': 'secret-id-token'}),
            ('/api/v1/auth/password/forgot/', {'email': self.user.email}),
            ('/api/v1/auth/password/reset/', {'token': 'secret', 'new_password': 'new'}),
        ):
            response = self.client.post(path, body, format='json')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, path)
            self.assert_no_tokens(response)

    def test_django_admin_session_login_remains_available(self):
        admin = User.objects.create_superuser(
            username='platform-admin', email='admin@example.com', password='admin-password'
        )
        self.assertTrue(self.client.login(username=admin.username, password='admin-password'))
        response = self.client.get('/admin/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


@override_settings(LEGACY_APP_AUTH_ENABLED=True, GOOGLE_CLIENT_ID='google-client')
class LegacyGoogleLoggingTests(APITestCase):
    def test_success_log_does_not_contain_provider_or_issued_tokens(self):
        user = User.objects.create_user(username='google-user', email='google@example.com')
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.google_id = 'google-subject'
        profile.save(update_fields=['google_id'])

        with patch(
            'myappLubd.views.id_token.verify_oauth2_token',
            return_value={
                'sub': 'google-subject',
                'email': user.email,
                'given_name': 'Google',
            },
        ), self.assertLogs('myappLubd.views', level='INFO') as captured:
            response = self.client.post(
                '/api/v1/auth/google/',
                {
                    'id_token': 'id-token-secret-marker',
                    'access_token': 'provider-secret-marker',
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        logs = '\n'.join(captured.output)
        for secret in (
            'id-token-secret-marker',
            'provider-secret-marker',
            response.data['access'],
            response.data['refresh'],
            response.data['session_token'],
        ):
            self.assertNotIn(secret, logs)
