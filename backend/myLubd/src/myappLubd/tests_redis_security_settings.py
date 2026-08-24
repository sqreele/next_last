import json
import os
import subprocess
import sys
from textwrap import dedent

from django.test import SimpleTestCase


class RedisSecuritySettingsTests(SimpleTestCase):
    settings_probe = dedent(
        """
        import json
        import django

        django.setup()

        from django.conf import settings

        print(json.dumps({
            'redis_url': settings.REDIS_URL,
        }))
        """
    )

    def run_settings_probe(self, *, password_marker='valid', settings_module='myLubd.settings'):
        env = os.environ.copy()
        env.pop('REDIS_PASSWORD', None)
        env.update({
            'DJANGO_SETTINGS_MODULE': settings_module,
            'DEBUG': '0',
            'DJANGO_SECRET_KEY': 'redis-settings-test-' + ('x' * 64),
            'DJANGO_ALLOWED_HOSTS': 'hotelcarepro.com backend localhost',
            'DJANGO_CORS_ORIGINS': 'https://hotelcarepro.com',
            'DJANGO_CSRF_TRUSTED_ORIGINS': 'https://hotelcarepro.com',
            'POSTGRES_PASSWORD': 'redis-settings-test-db-password',
            'REDIS_HOST': 'redis',
            'REDIS_PORT': '6379',
            'REDIS_DB': '1',
        })
        if password_marker == 'valid':
            env['REDIS_PASSWORD'] = 'explicit-test-redis-password'
        elif password_marker == 'predictable':
            env['REDIS_PASSWORD'] = 'password'
        elif password_marker == 'short':
            env['REDIS_PASSWORD'] = 'short-value'
        elif password_marker == 'unsafe':
            env['REDIS_PASSWORD'] = 'unsafe value with spaces'

        return subprocess.run(
            [sys.executable, '-c', self.settings_probe],
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_missing_redis_password_fails_closed(self):
        result = self.run_settings_probe(password_marker='missing')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)
        self.assertIn('REDIS_PASSWORD', result.stderr)

    def test_predictable_redis_password_is_rejected(self):
        result = self.run_settings_probe(password_marker='predictable')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('predictable value', result.stderr)

    def test_short_redis_password_is_rejected(self):
        result = self.run_settings_probe(password_marker='short')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('at least 16 characters', result.stderr)

    def test_config_unsafe_redis_password_is_rejected(self):
        result = self.run_settings_probe(password_marker='unsafe')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('URL-safe characters', result.stderr)

    def test_explicit_password_builds_authenticated_database_one_url(self):
        result = self.run_settings_probe()

        self.assertEqual(result.returncode, 0, result.stderr)
        values = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(
            values['redis_url'],
            'redis://:explicit-test-redis-password@redis:6379/1',
        )

    def test_legacy_cache_uses_authenticated_redis_url(self):
        result = self.run_settings_probe(settings_module='myappLubd.settings')

        self.assertEqual(result.returncode, 0, result.stderr)
        values = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertIn('@redis:6379/1', values['redis_url'])
