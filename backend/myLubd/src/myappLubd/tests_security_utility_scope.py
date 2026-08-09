from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Property, User, UtilityConsumption


class UtilityTenantIsolationTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username='utility-alice', password='pw12345!')
        self.bob = User.objects.create_user(username='utility-bob', password='pw12345!')
        self.alpha = Property.objects.create(name='Utility Alpha')
        self.beta = Property.objects.create(name='Utility Beta')
        self.alpha.users.add(self.alice)
        self.beta.users.add(self.bob)
        self.local = UtilityConsumption.objects.create(property=self.alpha, month=1, year=2026, water=10, created_by=self.alice)
        self.foreign = UtilityConsumption.objects.create(property=self.beta, month=1, year=2026, water=99, created_by=self.bob)
        self.client.force_authenticate(self.alice)

    def test_list_retrieve_filter_delete_and_numeric_idor(self):
        response = self.client.get('/api/v1/utility-consumption/')
        self.assertEqual({row['id'] for row in response.data['results']}, {self.local.pk})
        endpoint = f'/api/v1/utility-consumption/{self.foreign.pk}/'
        self.assertEqual(self.client.get(endpoint).status_code, 404)
        self.assertEqual(self.client.delete(endpoint).status_code, 404)
        self.assertTrue(UtilityConsumption.objects.filter(pk=self.foreign.pk).exists())
        filtered = self.client.get(f'/api/v1/utility-consumption/?property_id={self.beta.property_id}')
        self.assertEqual(filtered.data['results'], [])

    def test_create_patch_and_put_reject_foreign_property_without_changes(self):
        before = UtilityConsumption.objects.count()
        response = self.client.post('/api/v1/utility-consumption/', {
            'property': self.beta.pk, 'month': 2, 'year': 2026, 'water': 50
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(UtilityConsumption.objects.count(), before)
        endpoint = f'/api/v1/utility-consumption/{self.local.pk}/'
        self.assertEqual(self.client.patch(endpoint, {'property': self.beta.pk, 'water': 50}, format='json').status_code, 400)
        self.assertEqual(self.client.put(endpoint, {'property': self.beta.pk, 'month': 2, 'year': 2026, 'water': 50}, format='json').status_code, 400)
        self.local.refresh_from_db()
        self.assertEqual(self.local.property, self.alpha)
        self.assertEqual(self.local.water, 10)

    def test_same_property_create_patch_put_and_delete(self):
        response = self.client.post('/api/v1/utility-consumption/', {
            'property': self.alpha.pk, 'month': 2, 'year': 2026, 'water': 20
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        endpoint = f"/api/v1/utility-consumption/{response.data['id']}/"
        self.assertEqual(self.client.patch(endpoint, {'water': 21}, format='json').status_code, 200)
        self.assertEqual(self.client.put(endpoint, {'property': self.alpha.pk, 'month': 2, 'year': 2026, 'water': 22}, format='json').status_code, 200)
        self.assertEqual(self.client.delete(endpoint).status_code, 204)
