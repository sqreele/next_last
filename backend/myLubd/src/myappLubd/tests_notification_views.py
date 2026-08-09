from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase


User = get_user_model()


class NotificationViewRegressionTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='notification-user', password='pw12345!')
        self.client.force_authenticate(user=self.user)

    def test_overdue_notifications_preserve_empty_result_contract(self):
        response = self.client.get('/api/v1/notifications/overdue/?property_id=missing')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data, {'count': 0, 'results': []})

    def test_push_subscribe_rejects_incomplete_browser_subscription(self):
        response = self.client.post(
            '/api/v1/push/subscribe/',
            {'endpoint': 'https://push.example/subscription'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(
            response.data,
            {'error': 'endpoint and keys.{p256dh,auth} are required.'},
        )

    def test_push_public_key_returns_configuration_contract(self):
        response = self.client.get('/api/v1/push/public-key/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(set(response.data), {'public_key', 'configured'})
        self.assertEqual(response.data['configured'], bool(response.data['public_key']))
