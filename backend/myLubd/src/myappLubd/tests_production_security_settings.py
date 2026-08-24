import json
import os
import subprocess
import sys
from textwrap import dedent

from django.test import SimpleTestCase


class ProductionSecuritySettingsTests(SimpleTestCase):
    settings_probe = dedent(
        """
        import json
        import django

        django.setup()

        from django.conf import settings
        from django.http import HttpResponse
        from django.middleware.security import SecurityMiddleware
        from django.test import RequestFactory

        middleware = SecurityMiddleware(lambda request: HttpResponse('ok'))
        factory = RequestFactory()
        forwarded_https_response = middleware(
            factory.get(
                '/health/',
                HTTP_HOST='hotelcarepro.com',
                HTTP_X_FORWARDED_PROTO='https',
            )
        )
        plain_http_response = middleware(
            factory.get('/health/', HTTP_HOST='hotelcarepro.com')
        )

        print(json.dumps({
            'debug': settings.DEBUG,
            'session_cookie_secure': settings.SESSION_COOKIE_SECURE,
            'csrf_cookie_secure': settings.CSRF_COOKIE_SECURE,
            'ssl_redirect': settings.SECURE_SSL_REDIRECT,
            'hsts_seconds': settings.SECURE_HSTS_SECONDS,
            'hsts_include_subdomains': settings.SECURE_HSTS_INCLUDE_SUBDOMAINS,
            'hsts_preload': settings.SECURE_HSTS_PRELOAD,
            'forwarded_https_is_secure': factory.get(
                '/health/',
                HTTP_HOST='hotelcarepro.com',
                HTTP_X_FORWARDED_PROTO='https',
            ).is_secure(),
            'forwarded_https_status': forwarded_https_response.status_code,
            'plain_http_status': plain_http_response.status_code,
            'plain_http_location': plain_http_response.get('Location'),
        }))
        """
    )

    def run_settings_probe(self, *, debug, secret_marker='valid'):
        env = os.environ.copy()
        env.update({
            'DJANGO_SETTINGS_MODULE': 'myLubd.settings',
            'DEBUG': '1' if debug else '0',
            'DJANGO_ALLOWED_HOSTS': 'hotelcarepro.com www.hotelcarepro.com backend localhost',
            'DJANGO_CORS_ORIGINS': 'https://hotelcarepro.com https://www.hotelcarepro.com',
            'DJANGO_CSRF_TRUSTED_ORIGINS': 'https://hotelcarepro.com https://www.hotelcarepro.com',
            'POSTGRES_PASSWORD': 'production-settings-test-db-password',
            'REDIS_PASSWORD': 'production-settings-test-redis-password',
        })
        if secret_marker == 'missing':
            env.pop('DJANGO_SECRET_KEY', None)
        elif secret_marker == 'weak':
            env['DJANGO_SECRET_KEY'] = 'development-secret'
        else:
            env['DJANGO_SECRET_KEY'] = 'settings-test-only-' + ('x' * 64)

        return subprocess.run(
            [sys.executable, '-c', self.settings_probe],
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_production_rejects_missing_secret(self):
        result = self.run_settings_probe(debug=False, secret_marker='missing')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)

    def test_production_rejects_weak_development_secret(self):
        result = self.run_settings_probe(debug=False, secret_marker='weak')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)

    def test_production_enforces_https_cookies_and_hsts(self):
        result = self.run_settings_probe(debug=False)

        self.assertEqual(result.returncode, 0, result.stderr)
        values = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertFalse(values['debug'])
        self.assertTrue(values['session_cookie_secure'])
        self.assertTrue(values['csrf_cookie_secure'])
        self.assertTrue(values['ssl_redirect'])
        self.assertEqual(values['hsts_seconds'], 31536000)
        self.assertTrue(values['hsts_include_subdomains'])
        self.assertFalse(values['hsts_preload'])
        self.assertTrue(values['forwarded_https_is_secure'])
        self.assertEqual(values['forwarded_https_status'], 200)
        self.assertEqual(values['plain_http_status'], 301)
        self.assertTrue(values['plain_http_location'].startswith('https://'))

    def test_development_keeps_http_and_local_fallback_available(self):
        result = self.run_settings_probe(debug=True, secret_marker='missing')

        self.assertEqual(result.returncode, 0, result.stderr)
        values = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertTrue(values['debug'])
        self.assertFalse(values['session_cookie_secure'])
        self.assertFalse(values['csrf_cookie_secure'])
        self.assertFalse(values['ssl_redirect'])
        self.assertEqual(values['hsts_seconds'], 0)
        self.assertEqual(values['plain_http_status'], 200)
