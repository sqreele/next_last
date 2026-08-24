from pathlib import Path

from django.test import SimpleTestCase


class CronHardeningTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.entrypoint = (
            Path(__file__).resolve().parents[2] / 'entrypoint.sh'
        ).read_text(encoding='utf-8')

    def test_cron_definition_does_not_embed_credentials(self):
        cron_definition = self.entrypoint.split(
            '# Files in /etc/cron.d already use the system-crontab format', 1
        )[1]

        for credential in (
            'EMAIL_HOST_PASSWORD',
            'GMAIL_CLIENT_SECRET',
            'GMAIL_REFRESH_TOKEN',
            'DJANGO_SECRET_KEY',
            'REDIS_PASSWORD',
            'SQL_PASSWORD',
        ):
            self.assertNotIn(f'{credential}=', cron_definition)

    def test_cron_credentials_and_definition_are_owner_only(self):
        self.assertIn("os.chmod(destination, 0o600)", self.entrypoint)
        self.assertIn('chmod 0600 /etc/cron.d/daily_summary', self.entrypoint)
        self.assertIn('chmod 0640 /var/log/cron.log', self.entrypoint)

    def test_system_cron_file_is_not_installed_as_a_user_crontab(self):
        self.assertNotIn('crontab /etc/cron.d/daily_summary', self.entrypoint)
        self.assertIn('0 23 * * * root . $CRON_ENV_FILE', self.entrypoint)
