from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Machine, PreventiveMaintenance, Property, User


class PreventiveMaintenanceTenantIsolationTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username='pm-alice', password='pw12345!')
        self.alice_peer = User.objects.create_user(username='pm-alice-peer', password='pw12345!')
        self.bob = User.objects.create_user(username='pm-bob', password='pw12345!')
        self.alice_property = Property.objects.create(name='PM Alpha')
        self.bob_property = Property.objects.create(name='PM Beta')
        self.alice_property.users.add(self.alice, self.alice_peer)
        self.bob_property.users.add(self.bob)
        self.alice_machine = Machine.objects.create(
            machine_id='PMALPHA01', name='Alpha pump', category='Pump', property=self.alice_property
        )
        self.bob_machine = Machine.objects.create(
            machine_id='PMBETA001', name='Beta pump', category='Pump', property=self.bob_property
        )
        self.alice_pm = self._pm('Alpha service', self.alice, self.alice_machine)
        self.bob_pm = self._pm('Beta service', self.bob, self.bob_machine)
        self.client.force_authenticate(self.alice)

    def _pm(self, title, creator, machine):
        pm = PreventiveMaintenance.objects.create(
            pmtitle=title,
            scheduled_date=timezone.now(),
            frequency='monthly',
            created_by=creator,
            assigned_to=creator,
        )
        pm.machines.set([machine])
        return pm

    def _payload(self, machine_ids=None, assigned_to=None, title='New PM'):
        return {
            'pmtitle': title,
            'scheduled_date': timezone.now().isoformat(),
            'frequency': 'monthly',
            'machine_ids': machine_ids or [self.alice_machine.machine_id],
            'assigned_to': assigned_to or self.alice_peer.pk,
        }

    def test_list_retrieve_and_property_filter_do_not_disclose_foreign_pm(self):
        response = self.client.get('/api/v1/preventive-maintenance/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item['pm_id'] for item in response.data['results']}
        self.assertIn(self.alice_pm.pm_id, ids)
        self.assertNotIn(self.bob_pm.pm_id, ids)
        self.assertEqual(
            self.client.get(f'/api/v1/preventive-maintenance/{self.bob_pm.pm_id}/').status_code,
            status.HTTP_404_NOT_FOUND,
        )
        filtered = self.client.get(
            f'/api/v1/preventive-maintenance/?property_id={self.bob_property.property_id}'
        )
        self.assertEqual(filtered.status_code, status.HTTP_200_OK)
        self.assertEqual(filtered.data['results'], [])

    def test_create_accepts_same_property_machine_and_assignee(self):
        response = self.client.post('/api/v1/preventive-maintenance/', self._payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        pm = PreventiveMaintenance.objects.get(pm_id=response.data['pm_id'])
        self.assertEqual(pm.assigned_to, self.alice_peer)
        self.assertEqual(list(pm.machines.all()), [self.alice_machine])

    def test_create_rejects_foreign_or_mixed_property_machines(self):
        before = PreventiveMaintenance.objects.count()
        for machine_ids in (
            [self.bob_machine.machine_id],
            [self.alice_machine.machine_id, self.bob_machine.machine_id],
        ):
            response = self.client.post(
                '/api/v1/preventive-maintenance/', self._payload(machine_ids=machine_ids), format='json'
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(PreventiveMaintenance.objects.count(), before)

    def test_create_rejects_foreign_assignee(self):
        response = self.client.post(
            '/api/v1/preventive-maintenance/', self._payload(assigned_to=self.bob.pk), format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertFalse(PreventiveMaintenance.objects.filter(pmtitle='New PM').exists())

    def test_patch_and_put_cannot_attach_foreign_relations(self):
        original_title = self.alice_pm.pmtitle
        patch_response = self.client.patch(
            f'/api/v1/preventive-maintenance/{self.alice_pm.pm_id}/',
            {'machine_ids': [self.bob_machine.machine_id], 'assigned_to': self.bob.pk},
            format='json',
        )
        self.assertEqual(patch_response.status_code, status.HTTP_400_BAD_REQUEST, patch_response.content)
        put_response = self.client.put(
            f'/api/v1/preventive-maintenance/{self.alice_pm.pm_id}/',
            self._payload(machine_ids=[self.bob_machine.machine_id], title='Forged'),
            format='json',
        )
        self.assertEqual(put_response.status_code, status.HTTP_400_BAD_REQUEST, put_response.content)
        self.alice_pm.refresh_from_db()
        self.assertEqual(self.alice_pm.pmtitle, original_title)
        self.assertEqual(list(self.alice_pm.machines.all()), [self.alice_machine])

    def test_foreign_patch_put_delete_and_numeric_lookup_are_not_found(self):
        endpoint = f'/api/v1/preventive-maintenance/{self.bob_pm.pm_id}/'
        self.assertEqual(self.client.patch(endpoint, {'pmtitle': 'Stolen'}, format='json').status_code, 404)
        self.assertEqual(self.client.put(endpoint, self._payload(title='Stolen'), format='json').status_code, 404)
        self.assertEqual(self.client.delete(endpoint).status_code, 404)
        self.assertEqual(
            self.client.get(f'/api/v1/preventive-maintenance/{self.bob_pm.pk}/').status_code, 404
        )
        self.bob_pm.refresh_from_db()
        self.assertEqual(self.bob_pm.pmtitle, 'Beta service')

    def test_same_property_patch_and_delete_remain_valid(self):
        response = self.client.patch(
            f'/api/v1/preventive-maintenance/{self.alice_pm.pm_id}/',
            {'pmtitle': 'Alpha updated', 'assigned_to': self.alice_peer.pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.alice_pm.refresh_from_db()
        self.assertEqual(self.alice_pm.assigned_to, self.alice_peer)
        self.assertEqual(
            self.client.delete(f'/api/v1/preventive-maintenance/{self.alice_pm.pm_id}/').status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_master_plan_rejects_foreign_machine_and_assignee(self):
        before = self.alice.created_pm_master_plans.count()
        base = {
            'title': 'Forged plan', 'start_date': timezone.now().isoformat(),
            'frequency': 'monthly', 'assigned_to': self.alice_peer.pk,
        }
        for payload in (
            {**base, 'machine_ids': [self.bob_machine.machine_id]},
            {**base, 'machine_ids': [self.alice_machine.machine_id], 'assigned_to': self.bob.pk},
        ):
            response = self.client.post('/api/v1/preventive-maintenance/plans/', payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(self.alice.created_pm_master_plans.count(), before)

    def test_master_plan_same_property_assignment_and_user_list_scope(self):
        response = self.client.post('/api/v1/preventive-maintenance/plans/', {
            'title': 'Valid plan', 'start_date': timezone.now().isoformat(),
            'frequency': 'monthly', 'machine_ids': [self.alice_machine.machine_id],
            'assigned_to': self.alice_peer.pk,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        users = self.client.get('/api/v1/users/')
        self.assertEqual(users.status_code, status.HTTP_200_OK)
        rows = users.data['results'] if isinstance(users.data, dict) else users.data
        returned_users = {row['username'] for row in rows}
        self.assertEqual(returned_users, {self.alice.username})
