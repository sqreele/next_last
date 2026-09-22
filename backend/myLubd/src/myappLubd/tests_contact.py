import json
from unittest.mock import MagicMock, patch

from django.core import mail
from django.core.cache import caches
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from .contact import send_contact_email


VALID_PAYLOAD = {
    'name': 'John Smith',
    'email': 'John@Example.com',
    'company': 'Example Hotel',
    'category': 'product',
    'subject': 'Product inquiry',
    'message': 'Please tell me more about the product for our hotel.',
}


@override_settings(
    CONTACT_RECIPIENT_EMAIL='support@staymaint.com',
    CONTACT_FROM_EMAIL='noreply@staymaint.com',
    MAILERSEND_API_TOKEN='',
)
class ContactSubmissionTests(SimpleTestCase):
    endpoint = '/api/v1/public/contact/'

    def setUp(self):
        self.client = APIClient()
        caches['contact_rate_limit'].clear()

    def post(self, payload=None, **extra):
        return self.client.post(
            self.endpoint,
            VALID_PAYLOAD if payload is None else payload,
            format='json',
            secure=True,
            REMOTE_ADDR='203.0.113.10',
            **extra,
        )

    @patch('myappLubd.contact.send_contact_email', return_value=True)
    def test_valid_submission_sends_email(self, send):
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data, {'detail': 'Message sent.'})
        send.assert_called_once()
        self.assertEqual(send.call_args.args[0]['email'], 'john@example.com')

    def test_missing_name_is_rejected(self):
        payload = {**VALID_PAYLOAD}
        payload.pop('name')
        self.assertEqual(self.post(payload).status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_email_is_rejected(self):
        response = self.post({**VALID_PAYLOAD, 'email': 'not-an-email'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_subject_is_rejected(self):
        payload = {**VALID_PAYLOAD}
        payload.pop('subject')
        self.assertEqual(self.post(payload).status_code, status.HTTP_400_BAD_REQUEST)

    def test_short_message_is_rejected(self):
        response = self.post({**VALID_PAYLOAD, 'message': 'Too short'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_oversized_message_is_rejected(self):
        response = self.post({**VALID_PAYLOAD, 'message': 'x' * 5001})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_oversized_request_body_is_rejected(self):
        body = json.dumps({**VALID_PAYLOAD, 'padding': 'x' * (17 * 1024)})
        response = self.client.post(
            self.endpoint,
            data=body,
            content_type='application/json',
            secure=True,
            REMOTE_ADDR='203.0.113.10',
        )
        self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    def test_invalid_category_is_rejected(self):
        response = self.post({**VALID_PAYLOAD, 'category': 'not-allowed'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_header_injection_attempt_is_rejected(self):
        response = self.post({**VALID_PAYLOAD, 'subject': 'Hello\r\nBcc: victim@example.com'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('myappLubd.contact.send_contact_email')
    def test_honeypot_returns_neutral_success_without_sending(self, send):
        response = self.post({**VALID_PAYLOAD, 'website': 'https://spam.example'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data, {'detail': 'Message received.'})
        send.assert_not_called()

    @patch('myappLubd.contact.send_contact_email', return_value=True)
    def test_burst_rate_limit(self, send):
        for index in range(3):
            response = self.post({
                **VALID_PAYLOAD,
                'subject': f'Product inquiry {index}',
                'message': f'Unique normal contact message number {index}.',
            })
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response = self.post({
            **VALID_PAYLOAD,
            'subject': 'Fourth product inquiry',
            'message': 'This fourth unique message should be rate limited.',
        })
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch('myappLubd.contact.send_contact_email', return_value=True)
    def test_duplicate_submission_is_suppressed(self, send):
        self.assertEqual(self.post().status_code, status.HTTP_201_CREATED)
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data, {'detail': 'Message received.'})
        send.assert_called_once()

    @patch('myappLubd.contact.send_contact_email', return_value=False)
    def test_mail_provider_failure_is_generic(self, send):
        response = self.post()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data, {'detail': 'Unable to send your message right now.'})

    def test_unknown_fields_are_rejected(self):
        response = self.post({**VALID_PAYLOAD, 'unexpected': 'value'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('unexpected', response.data)

    def test_unexpected_field_types_are_rejected(self):
        response = self.post({**VALID_PAYLOAD, 'name': 123})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    EMAIL_HOST_USER='smtp-user@example.com',
    EMAIL_HOST_PASSWORD='test-only-password',
    CONTACT_RECIPIENT_EMAIL='support@staymaint.com',
    CONTACT_FROM_EMAIL='noreply@staymaint.com',
    MAILERSEND_API_TOKEN='',
)
class ContactEmailCompositionTests(SimpleTestCase):
    def setUp(self):
        mail.outbox = []

    def test_email_has_safe_sender_reply_to_and_both_bodies(self):
        sent = send_contact_email({**VALID_PAYLOAD, 'email': 'visitor@example.com'})
        self.assertTrue(sent)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.from_email, 'StayMaint <noreply@staymaint.com>')
        self.assertNotEqual(message.from_email, 'visitor@example.com')
        self.assertEqual(message.reply_to, ['visitor@example.com'])
        self.assertEqual(message.to, ['support@staymaint.com'])
        self.assertIn('Name: John Smith', message.body)
        self.assertEqual(message.alternatives[0][1], 'text/html')

    def test_html_body_escapes_user_content(self):
        sent = send_contact_email({
            **VALID_PAYLOAD,
            'message': '<script>alert(1)</script> A legitimate long message.',
        })
        self.assertTrue(sent)
        html_body = mail.outbox[0].alternatives[0][0]
        self.assertNotIn('<script>', html_body)
        self.assertIn('&lt;script&gt;', html_body)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    EMAIL_HOST_USER='smtp-user@example.com',
    EMAIL_HOST_PASSWORD='test-only-password',
    CONTACT_RECIPIENT_EMAIL='support@staymaint.com',
    CONTACT_FROM_EMAIL='noreply@staymaint.com',
    MAILERSEND_API_TOKEN='unit-test-mailersend-token',
)
class MailerSendContactTransportTests(SimpleTestCase):
    def setUp(self):
        mail.outbox = []

    @staticmethod
    def accepted_response():
        response = MagicMock()
        response.status_code = 202
        response.headers = {'X-Message-Id': 'unit-test-message-id'}
        response.json.return_value = {}
        return response

    def send_accepted_contact(self, post):
        post.return_value = self.accepted_response()
        sent = send_contact_email({**VALID_PAYLOAD, 'email': 'visitor@example.com'})
        return sent, post.call_args.kwargs['json']

    @patch('myappLubd.email_utils.requests.post')
    def test_mailersend_is_selected_when_token_exists(self, post):
        sent, payload = self.send_accepted_contact(post)
        self.assertTrue(sent)
        post.assert_called_once()
        self.assertEqual(mail.outbox, [])
        self.assertEqual(post.call_args.args[0], 'https://api.mailersend.com/v1/email')
        headers = post.call_args.kwargs['headers']
        self.assertEqual(
            headers['Authorization'],
            'Bearer unit-test-mailersend-token',
        )
        self.assertEqual(headers['Content-Type'], 'application/json')
        self.assertEqual(headers['Accept'], 'application/json')
        self.assertEqual(headers['User-Agent'], 'StayMaint-Mailer/1.0')
        self.assertEqual(payload['from'], {
            'email': 'noreply@staymaint.com',
            'name': 'StayMaint',
        })
        self.assertEqual(payload['to'], [{'email': 'support@staymaint.com'}])
        self.assertEqual(payload['reply_to'], {'email': 'visitor@example.com'})
        self.assertEqual(payload['subject'], 'New Contact Message: Product inquiry')
        self.assertIn('New contact submission', payload['text'])
        self.assertIn('<h2>New contact submission</h2>', payload['html'])

    @patch('myappLubd.email_utils.requests.post')
    def test_mailersend_json_failure_falls_back_to_smtp(self, post):
        response = MagicMock(status_code=422)
        response.headers = {'X-Request-Id': 'safe-request-id'}
        response.json.return_value = {
            'message': 'The from.email domain must be verified. #MS42207',
        }
        post.return_value = response

        with self.assertLogs('myappLubd.email_utils', level='ERROR') as logs:
            sent = send_contact_email({**VALID_PAYLOAD, 'email': 'visitor@example.com'})

        self.assertTrue(sent)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['support@staymaint.com'])
        observed = '\n'.join(logs.output)
        self.assertIn('status=422', observed)
        self.assertIn('error_code=MS42207', observed)
        self.assertIn('request_id=safe-request-id', observed)

    @patch('myappLubd.email_utils.requests.post')
    def test_cloudflare_html_failure_is_safe_and_falls_back_to_smtp(self, post):
        response = MagicMock(status_code=403)
        response.headers = {'CF-Ray': 'safe-ray-id'}
        response.json.side_effect = ValueError('not JSON')
        response.text = '<html>edge response that must not be logged</html>'
        post.return_value = response

        with self.assertLogs('myappLubd.email_utils', level='ERROR') as logs:
            sent = send_contact_email({**VALID_PAYLOAD, 'email': 'visitor@example.com'})

        self.assertTrue(sent)
        self.assertEqual(len(mail.outbox), 1)
        observed = '\n'.join(logs.output)
        self.assertIn('status=403', observed)
        self.assertIn('request_id=safe-ray-id', observed)
        self.assertNotIn('edge response', observed)

    @patch('myappLubd.email_utils.EmailMultiAlternatives.send', side_effect=RuntimeError)
    @patch('myappLubd.email_utils.requests.post')
    def test_mailersend_and_smtp_failure_returns_false(self, post, smtp_send):
        response = MagicMock(status_code=500)
        response.headers = {}
        response.json.return_value = {'message': 'Provider unavailable'}
        post.return_value = response
        self.assertFalse(send_contact_email(VALID_PAYLOAD))
        smtp_send.assert_called_once()

    @patch('myappLubd.email_utils.EmailMultiAlternatives.send', side_effect=RuntimeError)
    @patch('myappLubd.email_utils.requests.post')
    def test_token_is_absent_from_logs_and_api_response(self, post, smtp_send):
        response = MagicMock(status_code=403)
        response.headers = {'X-Request-Id': 'unit-test-mailersend-token'}
        response.json.return_value = {
            'message': 'Denied unit-test-mailersend-token #MS40301',
        }
        post.return_value = response
        client = APIClient()
        caches['contact_rate_limit'].clear()

        with self.assertLogs(level='ERROR') as logs:
            response = client.post(
                '/api/v1/public/contact/',
                VALID_PAYLOAD,
                format='json',
                secure=True,
                REMOTE_ADDR='203.0.113.44',
            )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        observed = '\n'.join(logs.output) + response.content.decode('utf-8')
        self.assertNotIn('unit-test-mailersend-token', observed)
        smtp_send.assert_called_once()
