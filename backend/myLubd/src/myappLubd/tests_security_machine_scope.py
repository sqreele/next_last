from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Machine, PreventiveMaintenance, Property, User


class MachineTenantIsolationTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username='machine-alice', password='pw12345!')
        self.bob = User.objects.create_user(username='machine-bob', password='pw12345!')
        self.alpha = Property.objects.create(name='Machine Alpha')
        self.beta = Property.objects.create(name='Machine Beta')
        self.alpha.users.add(self.alice)
        self.beta.users.add(self.bob)
        self.local = Machine.objects.create(name='Local', category='Pump', property=self.alpha)
        self.foreign = Machine.objects.create(name='Foreign', category='Pump', property=self.beta)
        self.foreign_pm = PreventiveMaintenance.objects.create(
            pmtitle='Foreign PM', scheduled_date=timezone.now(), frequency='monthly', created_by=self.bob
        )
        self.foreign_pm.machines.set([self.foreign])
        self.client.force_authenticate(self.alice)

    def test_list_retrieve_filter_and_foreign_mutations_are_scoped(self):
        response = self.client.get('/api/v1/machines/')
        self.assertEqual(response.status_code, 200)
        ids = {item['machine_id'] for item in response.data['results']}
        self.assertEqual(ids, {self.local.machine_id})
        endpoint = f'/api/v1/machines/{self.foreign.machine_id}/'
        self.assertEqual(self.client.get(endpoint).status_code, 404)
        self.assertEqual(self.client.patch(endpoint, {'name': 'Stolen'}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(endpoint).status_code, 404)
        filtered = self.client.get(f'/api/v1/machines/?property_id={self.beta.property_id}')
        self.assertEqual(filtered.data['results'], [])

    def test_create_and_update_reject_foreign_property(self):
        create = self.client.post('/api/v1/machines/', {
            'name': 'Forged', 'category': 'Pump', 'property': self.beta.pk
        }, format='json')
        self.assertEqual(create.status_code, status.HTTP_400_BAD_REQUEST, create.content)
        update = self.client.patch(
            f'/api/v1/machines/{self.local.machine_id}/', {'property': self.beta.pk}, format='json'
        )
        self.assertEqual(update.status_code, status.HTTP_400_BAD_REQUEST, update.content)
        self.local.refresh_from_db()
        self.assertEqual(self.local.property, self.alpha)

    def test_same_property_create_update_and_delete_remain_valid(self):
        created = self.client.post('/api/v1/machines/', {
            'name': 'Valid', 'category': 'Pump', 'property': self.alpha.pk
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        machine = Machine.objects.get(name='Valid')
        endpoint = f"/api/v1/machines/{machine.machine_id}/"
        self.assertEqual(self.client.patch(endpoint, {'name': 'Updated'}, format='json').status_code, 200)
        self.assertEqual(self.client.delete(endpoint).status_code, 204)

    def test_machine_cannot_attach_foreign_pm(self):
        response = self.client.post(
            f'/api/v1/machines/{self.local.machine_id}/set_preventive_maintenances/',
            {'preventive_maintenance_ids': [self.foreign_pm.pm_id]}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertFalse(self.local.preventive_maintenances.exists())

    def test_numeric_lookup_does_not_bypass_public_identifier(self):
        self.assertEqual(self.client.get(f'/api/v1/machines/{self.foreign.pk}/').status_code, 404)
