import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ENTRYPOINT = Path(__file__).resolve().parents[1] / 'entrypoint.sh'


class CronEntrypointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = ENTRYPOINT.read_text(encoding='utf-8')
        marker = 'python - "$CRON_ENV_FILE" <<\'PY\'\n'
        cls.serializer = cls.source.split(marker, 1)[1].split('\nPY\n', 1)[0]

    def generate_cron_environment(self, values, *, unset=()):
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / 'cron.env'
        environment = os.environ.copy()
        for name in unset:
            environment.pop(name, None)
        environment.update(values)
        subprocess.run(
            [sys.executable, '-', str(path)],
            input=self.serializer,
            text=True,
            env=environment,
            check=True,
            capture_output=True,
        )
        return directory, path

    def load_selected_environment(self, path, names):
        probe = (
            'import json, os; '
            f'print(json.dumps({{name: os.environ.get(name) for name in {tuple(names)!r}}}))'
        )
        result = subprocess.run(
            ['/bin/sh', '-c', '. "$1"; exec "$2" -c "$3"', 'cron-test',
             str(path), sys.executable, probe],
            text=True,
            check=True,
            capture_output=True,
        )
        return json.loads(result.stdout)

    def test_daily_summary_receives_database_configuration(self):
        for name in (
            'SQL_ENGINE',
            'SQL_DATABASE',
            'SQL_USER',
            'SQL_PASSWORD',
            'SQL_HOST',
            'SQL_PORT',
        ):
            self.assertIn(f"'{name}'", self.source)

    def test_daily_summary_receives_email_recipient_and_link_configuration(self):
        for name in (
            'EMAIL_HOST_USER',
            'EMAIL_HOST_PASSWORD',
            'DAILY_SUMMARY_RECIPIENTS',
            'GMAIL_CLIENT_ID',
            'GMAIL_CLIENT_SECRET',
            'GMAIL_REFRESH_TOKEN',
            'FRONTEND_BASE_URL',
        ):
            self.assertIn(f"'{name}'", self.source)

    def test_runtime_environment_is_root_only_and_sourced_by_system_cron(self):
        self.assertIn("os.open(sys.argv[1], flags, 0o600)", self.source)
        self.assertIn("os.fchown(fd, 0, 0)", self.source)
        self.assertIn("os.fchmod(fd, 0o600)", self.source)
        self.assertIn("os.O_NOFOLLOW", self.source)
        self.assertIn('root . $CRON_ENV_FILE && cd /app', self.source)
        self.assertNotIn('crontab /etc/cron.d/daily_summary', self.source)

        directory, path = self.generate_cron_environment({})
        self.addCleanup(directory.cleanup)
        self.assertEqual(path.stat().st_uid, 0)
        self.assertEqual(path.stat().st_gid, 0)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_public_cron_definition_does_not_embed_secret_values(self):
        self.assertNotIn('echo "EMAIL_HOST_PASSWORD=', self.source)
        self.assertNotIn('echo "GMAIL_CLIENT_SECRET=', self.source)
        self.assertNotIn('echo "GMAIL_REFRESH_TOKEN=', self.source)
        self.assertNotIn('echo "SQL_PASSWORD=', self.source)
        self.assertNotIn('echo "LINE_CHANNEL_ACCESS_TOKEN=', self.source)
        self.assertNotIn('echo "LINE_CHANNEL_SECRET=', self.source)

    def test_line_timeout_defaults_only_when_unset_or_empty(self):
        cases = (
            ('unset', {}, ('LINE_MESSAGING_TIMEOUT_SECONDS',), '3'),
            ('empty', {'LINE_MESSAGING_TIMEOUT_SECONDS': ''}, (), '3'),
            ('integer', {'LINE_MESSAGING_TIMEOUT_SECONDS': '5'}, (), '5'),
            ('decimal', {'LINE_MESSAGING_TIMEOUT_SECONDS': '2.5'}, (), '2.5'),
        )
        for label, values, unset, expected in cases:
            with self.subTest(label=label):
                directory, path = self.generate_cron_environment(values, unset=unset)
                self.addCleanup(directory.cleanup)
                loaded = self.load_selected_environment(
                    path, ('LINE_MESSAGING_TIMEOUT_SECONDS',),
                )
                self.assertEqual(loaded['LINE_MESSAGING_TIMEOUT_SECONDS'], expected)
                self.assertEqual(float(loaded['LINE_MESSAGING_TIMEOUT_SECONDS']), float(expected))

    def test_line_access_token_is_shell_safely_propagated(self):
        fake_token = 'fake token with $ and ไทย'
        directory, path = self.generate_cron_environment({
            'LINE_CHANNEL_ACCESS_TOKEN': fake_token,
        })
        self.addCleanup(directory.cleanup)
        loaded = self.load_selected_environment(path, ('LINE_CHANNEL_ACCESS_TOKEN',))
        self.assertEqual(loaded['LINE_CHANNEL_ACCESS_TOKEN'], fake_token)

    def test_malformed_nonempty_line_timeout_remains_fail_fast(self):
        directory, path = self.generate_cron_environment({
            'LINE_MESSAGING_TIMEOUT_SECONDS': 'abc',
        })
        self.addCleanup(directory.cleanup)
        loaded = self.load_selected_environment(path, ('LINE_MESSAGING_TIMEOUT_SECONDS',))
        self.assertEqual(loaded['LINE_MESSAGING_TIMEOUT_SECONDS'], 'abc')
        with self.assertRaises(ValueError):
            float(loaded['LINE_MESSAGING_TIMEOUT_SECONDS'])

    def test_application_settings_keep_three_second_default(self):
        settings = (ENTRYPOINT.parent / 'src' / 'myLubd' / 'settings.py').read_text(
            encoding='utf-8'
        )
        self.assertIn("os.getenv('LINE_MESSAGING_TIMEOUT_SECONDS', '3')", settings)

    def test_special_characters_survive_and_child_process_sees_database_values(self):
        special_password = ' space \' " $HOME & \\ # ไทย '
        expected = {
            'SQL_ENGINE': 'django.db.backends.postgresql',
            'SQL_DATABASE': 'stay maint',
            'SQL_USER': 'cron-user',
            'SQL_PASSWORD': special_password,
            'SQL_HOST': 'db#primary',
            'SQL_PORT': '5432',
        }
        directory, path = self.generate_cron_environment(expected)
        self.addCleanup(directory.cleanup)

        mode = stat.S_IMODE(path.stat().st_mode)
        self.assertEqual(mode, 0o600)
        self.assertEqual(path.stat().st_uid, os.geteuid())

        probe = (
            'import json, os; '
            f'print(json.dumps({{name: os.environ.get(name) for name in {tuple(expected)!r}}}, '
            'ensure_ascii=False))'
        )
        result = subprocess.run(
            ['/bin/sh', '-c', '. "$1"; exec "$2" -c "$3"', 'cron-test',
             str(path), sys.executable, probe],
            text=True,
            check=True,
            capture_output=True,
        )
        self.assertEqual(json.loads(result.stdout), expected)

    def test_schedule_is_single_and_keeps_expected_timezone_and_logging(self):
        summary_schedule = (
            '0 23 * * * root . $CRON_ENV_FILE && cd /app && '
            '/usr/local/bin/python manage.py send_daily_summary '
            '>> /var/log/cron.log 2>&1'
        )
        pm_schedule = (
            '0 9 * * * root . $CRON_ENV_FILE && cd /app && '
            '/usr/local/bin/python manage.py send_pm_line_reminders '
            '>> /var/log/cron.log 2>&1'
        )
        self.assertIn(summary_schedule, self.source)
        self.assertIn(pm_schedule, self.source)
        self.assertEqual(self.source.count('manage.py send_daily_summary'), 1)
        self.assertEqual(self.source.count('manage.py send_pm_line_reminders'), 1)
        self.assertEqual(self.source.count('CRON_TZ=Asia/Bangkok'), 1)
        self.assertEqual(self.source.count('service cron start'), 1)
        dockerfile = (ENTRYPOINT.parent / 'Dockerfile').read_text(encoding='utf-8')
        self.assertIn('ENV TZ=Asia/Bangkok', dockerfile)
        self.assertIn('/usr/share/zoneinfo/$TZ', dockerfile)


if __name__ == '__main__':
    unittest.main()
