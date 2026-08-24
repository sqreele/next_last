import json
import os
import subprocess
import sys
from textwrap import dedent

from django.test import SimpleTestCase


class DatabaseCredentialSettingsTests(SimpleTestCase):
    settings_probe = dedent(
        """
        import json
        import django

        django.setup()

        from django.conf import settings

        print(json.dumps({
            'password': settings.DATABASES['default']['PASSWORD'],
        }))
        """
    )

    def run_settings_probe(
        self,
        *,
        debug,
        password_marker='valid',
        source='POSTGRES_PASSWORD',
        settings_module='myLubd.settings',
    ):
        env = os.environ.copy()
        for name in ('POSTGRES_PASSWORD', 'SQL_PASSWORD', 'DB_PASSWORD'):
            env.pop(name, None)
        env.update({
            'DJANGO_SETTINGS_MODULE': settings_module,
            'DEBUG': '1' if debug else '0',
            'DJANGO_SECRET_KEY': 'database-settings-test-' + ('x' * 64),
            'DJANGO_ALLOWED_HOSTS': 'hotelcarepro.com backend localhost',
            'DJANGO_CORS_ORIGINS': 'https://hotelcarepro.com',
            'DJANGO_CSRF_TRUSTED_ORIGINS': 'https://hotelcarepro.com',
            'REDIS_PASSWORD': 'database-settings-test-redis-password',
        })
        if password_marker == 'weak':
            env[source] = 'postgres'
        elif password_marker == 'valid':
            env[source] = 'explicit-test-database-password'

        return subprocess.run(
            [sys.executable, '-c', self.settings_probe],
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_production_rejects_missing_database_password(self):
        result = self.run_settings_probe(debug=False, password_marker='missing')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)
        self.assertIn('POSTGRES_PASSWORD', result.stderr)

    def test_production_rejects_predictable_database_password(self):
        result = self.run_settings_probe(debug=False, password_marker='weak')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)
        self.assertIn('predictable default', result.stderr)

    def test_production_accepts_explicit_database_password(self):
        result = self.run_settings_probe(debug=False)

        self.assertEqual(result.returncode, 0, result.stderr)
        values = json.loads(result.stdout.strip().splitlines()[-1])
        self.assertEqual(values['password'], 'explicit-test-database-password')

    def test_direct_runtime_accepts_explicit_sql_password(self):
        result = self.run_settings_probe(
            debug=False,
            source='SQL_PASSWORD',
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_development_also_requires_an_explicit_database_password(self):
        result = self.run_settings_probe(debug=True, password_marker='missing')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)

    def test_development_accepts_an_explicit_local_password(self):
        result = self.run_settings_probe(debug=True)

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_development_rejects_a_predictable_explicit_password(self):
        result = self.run_settings_probe(debug=True, password_marker='weak')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('predictable default', result.stderr)

    def test_legacy_settings_module_rejects_its_former_postgres_default(self):
        missing = self.run_settings_probe(
            debug=False,
            password_marker='missing',
            settings_module='myappLubd.settings',
        )
        predictable = self.run_settings_probe(
            debug=False,
            password_marker='weak',
            settings_module='myappLubd.settings',
        )

        self.assertNotEqual(missing.returncode, 0)
        self.assertIn('ImproperlyConfigured', missing.stderr)
        self.assertNotEqual(predictable.returncode, 0)
        self.assertIn('predictable default', predictable.stderr)

    def test_legacy_settings_module_accepts_explicit_password(self):
        result = self.run_settings_probe(
            debug=False,
            settings_module='myappLubd.settings',
        )

        self.assertEqual(result.returncode, 0, result.stderr)
