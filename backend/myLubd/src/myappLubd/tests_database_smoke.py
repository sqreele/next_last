from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework import status
from rest_framework.test import APIClient, APITestCase


User = get_user_model()


class DatabaseEnvironmentSmokeTest(APITestCase):
    def test_record_creation_and_authenticated_api_query_use_test_database(self):
        database_name = str(connection.settings_dict['NAME'])
        self.assertTrue(
            database_name.startswith('test_'),
            f'Refusing smoke test outside a dedicated test database: {database_name}',
        )

        user = User.objects.create_user(
            username='database-smoke-user',
            email='database-smoke@example.com',
            password='test-only-password',
        )
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get('/api/v1/users/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertTrue(User.objects.filter(pk=user.pk).exists())
        self.assertEqual(
            [item['username'] for item in response.data],
            ['database-smoke-user'],
        )
