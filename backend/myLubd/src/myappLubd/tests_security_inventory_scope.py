from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Inventory, InventoryUsage, Job, Machine, PreventiveMaintenance, Property, Room, User


class InventoryTenantIsolationTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username='stock-alice', password='pw12345!')
        self.bob = User.objects.create_user(username='stock-bob', password='pw12345!')
        self.alpha = Property.objects.create(name='Stock Alpha')
        self.beta = Property.objects.create(name='Stock Beta')
        self.alpha.users.add(self.alice)
        self.beta.users.add(self.bob)
        self.alpha_room = Room.objects.create(name='Stock A Room', room_type='Store')
        self.beta_room = Room.objects.create(name='Stock B Room', room_type='Store')
        self.alpha_room.properties.add(self.alpha)
        self.beta_room.properties.add(self.beta)
        self.local = Inventory.objects.create(name='Local part', quantity=10, property=self.alpha, room=self.alpha_room, created_by=self.alice)
        self.foreign = Inventory.objects.create(name='Foreign part', quantity=20, property=self.beta, room=self.beta_room, created_by=self.bob)
        self.local_job = Job.objects.create(user=self.alice, description='Local job', remarks='ok')
        self.local_job.rooms.set([self.alpha_room])
        self.foreign_job = Job.objects.create(user=self.bob, description='Foreign job', remarks='ok')
        self.foreign_job.rooms.set([self.beta_room])
        machine = Machine.objects.create(name='Beta stock machine', category='Pump', property=self.beta)
        self.foreign_pm = PreventiveMaintenance.objects.create(
            pmtitle='Foreign stock PM', scheduled_date=timezone.now(), created_by=self.bob
        )
        self.foreign_pm.machines.set([machine])
        self.client.force_authenticate(self.alice)

    def test_list_retrieve_filter_delete_and_numeric_idor(self):
        response = self.client.get('/api/v1/inventory/')
        self.assertEqual({row['item_id'] for row in response.data['results']}, {self.local.item_id})
        endpoint = f'/api/v1/inventory/{self.foreign.item_id}/'
        self.assertEqual(self.client.get(endpoint).status_code, 404)
        self.assertEqual(self.client.delete(endpoint).status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/inventory/{self.foreign.pk}/').status_code, 404)
        self.assertTrue(Inventory.objects.filter(pk=self.foreign.pk).exists())
        filtered = self.client.get(f'/api/v1/inventory/?property_id={self.beta.property_id}')
        self.assertEqual(filtered.data['results'], [])

    def test_create_and_update_reject_foreign_property_or_room(self):
        before = Inventory.objects.count()
        for payload in (
            {'name': 'Forged property', 'quantity': 3, 'property': self.beta.pk},
            {'name': 'Forged room', 'quantity': 3, 'property': self.alpha.pk, 'room': self.beta_room.pk},
        ):
            response = self.client.post('/api/v1/inventory/', payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(Inventory.objects.count(), before)
        response = self.client.patch(
            f'/api/v1/inventory/{self.local.item_id}/',
            {'property': self.beta.pk, 'created_by': self.bob.pk}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        put = self.client.put(
            f'/api/v1/inventory/{self.local.item_id}/',
            {'name': 'Forged put', 'quantity': 10, 'property': self.beta.pk}, format='json'
        )
        self.assertEqual(put.status_code, status.HTTP_400_BAD_REQUEST, put.content)
        self.local.refresh_from_db()
        self.assertEqual(self.local.property, self.alpha)
        self.assertEqual(self.local.created_by, self.alice)

    def test_foreign_stock_mutations_are_hidden_and_unchanged(self):
        for action in ('restock', 'use', 'consume'):
            response = self.client.post(
                f'/api/v1/inventory/{self.foreign.item_id}/{action}/', {'quantity': 2}, format='json'
            )
            self.assertEqual(response.status_code, 404)
        self.foreign.refresh_from_db()
        self.assertEqual(self.foreign.quantity, 20)
        self.assertEqual(InventoryUsage.objects.count(), 0)

    def test_consume_rejects_foreign_job_and_pm_without_side_effects(self):
        for relation in ({'job_id': self.foreign_job.job_id}, {'pm_id': self.foreign_pm.pm_id}):
            response = self.client.post(
                f'/api/v1/inventory/{self.local.item_id}/consume/',
                {'quantity': 2, **relation}, format='json'
            )
            self.assertNotIn(response.status_code, range(200, 300))
        self.local.refresh_from_db()
        self.assertEqual(self.local.quantity, 10)
        self.assertEqual(InventoryUsage.objects.count(), 0)
        self.assertFalse(self.local.jobs.exists())
        self.assertFalse(self.local.preventive_maintenances.exists())

    def test_same_property_create_patch_consume_restock_and_delete(self):
        created = self.client.post('/api/v1/inventory/', {
            'name': 'Valid part', 'quantity': 5, 'property': self.alpha.pk, 'room': self.alpha_room.pk
        }, format='json')
        self.assertEqual(created.status_code, 201, created.content)
        item_id = created.data['item_id']
        self.assertEqual(self.client.patch(f'/api/v1/inventory/{item_id}/', {'name': 'Updated'}, format='json').status_code, 200)
        consumed = self.client.post(
            f'/api/v1/inventory/{item_id}/consume/', {'quantity': 2, 'job_id': self.local_job.job_id}, format='json'
        )
        self.assertEqual(consumed.status_code, 201, consumed.content)
        item = Inventory.objects.get(item_id=item_id)
        self.assertEqual(item.quantity, 3)
        self.assertEqual(InventoryUsage.objects.filter(inventory=item, job=self.local_job, quantity=2).count(), 1)
        self.assertEqual(self.client.post(f'/api/v1/inventory/{item_id}/restock/', {'quantity': 2}, format='json').status_code, 200)
        deletable = Inventory.objects.create(name='Deletable', quantity=1, property=self.alpha, created_by=self.alice)
        self.assertEqual(self.client.delete(f'/api/v1/inventory/{deletable.item_id}/').status_code, 204)

    def test_legacy_use_does_not_partially_link_when_foreign_pm_is_rejected(self):
        response = self.client.post(
            f'/api/v1/inventory/{self.local.item_id}/use/',
            {'quantity': 2, 'job_id': self.local_job.job_id, 'pm_id': self.foreign_pm.pm_id}, format='json'
        )
        self.assertNotIn(response.status_code, range(200, 300))
        self.local.refresh_from_db()
        self.assertEqual(self.local.quantity, 10)
        self.assertFalse(self.local.jobs.exists())
        self.assertFalse(self.local.preventive_maintenances.exists())
