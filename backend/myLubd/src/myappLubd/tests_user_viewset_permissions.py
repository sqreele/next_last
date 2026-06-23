from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase


User = get_user_model()


class UserViewSetPermissionTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(
            username='alice',
            email='alice@example.com',
            password='pw12345!',
        )
        self.bob = User.objects.create_user(
            username='bob',
            email='bob@example.com',
            password='pw12345!',
        )
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='pw12345!',
            is_staff=True,
        )

    def test_regular_user_list_only_returns_self(self):
        self.client.force_authenticate(user=self.alice)

        resp = self.client.get('/api/v1/users/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        usernames = {item['username'] for item in resp.data}
        self.assertEqual(usernames, {'alice'})

    def test_regular_user_cannot_retrieve_another_user(self):
        self.client.force_authenticate(user=self.alice)

        resp = self.client.get(f'/api/v1/users/{self.bob.pk}/')

        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND, resp.content)

    def test_regular_user_can_update_self(self):
        self.client.force_authenticate(user=self.alice)

        resp = self.client.patch(
            f'/api/v1/users/{self.alice.pk}/',
            {'email': 'alice-new@example.com'},
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.email, 'alice-new@example.com')

    def test_regular_user_password_update_is_hashed(self):
        self.client.force_authenticate(user=self.alice)

        resp = self.client.patch(
            f'/api/v1/users/{self.alice.pk}/',
            {'password': 'NewPass123!'},
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.alice.refresh_from_db()
        self.assertNotEqual(self.alice.password, 'NewPass123!')
        self.assertTrue(self.alice.check_password('NewPass123!'))

    def test_regular_user_cannot_create_or_delete_users(self):
        self.client.force_authenticate(user=self.alice)

        create_resp = self.client.post(
            '/api/v1/users/',
            {
                'username': 'charlie',
                'email': 'charlie@example.com',
                'password': 'pw12345!',
            },
            format='json',
        )
        delete_resp = self.client.delete(f'/api/v1/users/{self.alice.pk}/')

        self.assertEqual(create_resp.status_code, status.HTTP_403_FORBIDDEN, create_resp.content)
        self.assertEqual(delete_resp.status_code, status.HTTP_403_FORBIDDEN, delete_resp.content)
        self.assertFalse(User.objects.filter(username='charlie').exists())
        self.assertTrue(User.objects.filter(pk=self.alice.pk).exists())

    def test_staff_user_can_list_all_users(self):
        self.client.force_authenticate(user=self.admin)

        resp = self.client.get('/api/v1/users/')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        usernames = {item['username'] for item in resp.data}
        self.assertEqual(usernames, {'alice', 'bob', 'admin'})
