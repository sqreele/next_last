from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import MaintenanceProcedure


User = get_user_model()


class MaintenanceProcedureViewRegressionTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='procedure-user', password='pw12345!')
        self.staff = User.objects.create_user(
            username='procedure-staff', password='pw12345!', is_staff=True
        )
        self.procedure = MaintenanceProcedure.objects.create(
            name='Inspect pump',
            description='Inspect the pump and record its condition.',
            frequency='monthly',
            estimated_duration='15 mins',
        )

    def test_authenticated_user_can_list_shared_procedures(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get('/api/v1/maintenance-procedures/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        results = response.data.get('results', response.data)
        self.assertEqual([item['id'] for item in results], [self.procedure.id])

    def test_non_staff_user_cannot_create_procedure(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            '/api/v1/maintenance-procedures/',
            {'name': 'Blocked', 'description': 'Must not be created.'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self.assertFalse(MaintenanceProcedure.objects.filter(name='Blocked').exists())

    def test_staff_user_can_create_procedure(self):
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(
            '/api/v1/maintenance-procedures/',
            {
                'name': 'Staff procedure',
                'description': 'Created by an authorized staff user.',
                'frequency': 'weekly',
                'estimated_duration': '20 mins',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertTrue(MaintenanceProcedure.objects.filter(name='Staff procedure').exists())
