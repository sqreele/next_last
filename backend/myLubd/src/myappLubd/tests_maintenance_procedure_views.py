from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Machine, MaintenanceProcedure, Property


User = get_user_model()


class MaintenanceProcedureViewRegressionTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='procedure-user', password='pw12345!')
        self.staff = User.objects.create_user(
            username='procedure-staff', password='pw12345!', is_staff=True
        )
        self.other_user = User.objects.create_user(
            username='procedure-other', password='pw12345!'
        )
        self.property_a = Property.objects.create(name='Procedure Hotel A')
        self.property_b = Property.objects.create(name='Procedure Hotel B')
        self.property_a.users.add(self.user)
        self.property_b.users.add(self.other_user)
        self.machine_a = Machine.objects.create(
            machine_id='PROC-M-A', name='Procedure machine A', category='Pump',
            property=self.property_a,
        )
        self.machine_b = Machine.objects.create(
            machine_id='PROC-M-B', name='Procedure machine B', category='Pump',
            property=self.property_b,
        )
        self.procedure = MaintenanceProcedure.objects.create(
            name='Inspect pump',
            description='Inspect the pump and record its condition.',
            frequency='monthly',
            estimated_duration='15 mins',
        )
        self.procedure.machines.add(self.machine_a)
        self.foreign_procedure = MaintenanceProcedure.objects.create(
            name='Foreign pump inspection',
            description='Must remain isolated.',
            frequency='monthly',
            estimated_duration='20 mins',
        )
        self.foreign_procedure.machines.add(self.machine_b)

    def test_authenticated_user_can_list_shared_procedures(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get(
            f'/api/v1/maintenance-procedures/?property_id={self.property_a.property_id}'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        results = response.data.get('results', response.data)
        self.assertEqual([item['id'] for item in results], [self.procedure.id])
        self.assertEqual(results[0]['property_id'], self.property_a.property_id)
        self.assertEqual(results[0]['machine_ids'], [self.machine_a.machine_id])

    def test_property_selector_fails_closed_for_foreign_property(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get(
            f'/api/v1/maintenance-procedures/?property_id={self.property_b.property_id}'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data.get('results', response.data), [])

    def test_unscoped_non_staff_list_never_discloses_global_or_foreign_procedures(self):
        unlinked = MaintenanceProcedure.objects.create(
            name='Global fallback', description='Must not be selectable.'
        )
        self.client.force_authenticate(user=self.user)

        response = self.client.get('/api/v1/maintenance-procedures/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        results = response.data.get('results', response.data)
        returned_ids = {item['id'] for item in results}
        self.assertEqual(returned_ids, {self.procedure.id})
        self.assertNotIn(unlinked.id, returned_ids)
        self.assertNotIn(self.foreign_procedure.id, returned_ids)

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

    def test_non_staff_custom_actions_are_forbidden_and_leave_shared_data_unchanged(self):
        self.procedure.steps = [{
            'step_number': 1, 'title': 'Original', 'description': 'Keep',
            'estimated_time': 5,
        }]
        self.procedure.save(update_fields=['steps'])
        self.client.force_authenticate(user=self.user)
        base = f'/api/v1/maintenance-procedures/{self.procedure.pk}'
        requests = [
            ('post', f'{base}/add_step/', {
                'property_id': self.property_a.property_id,
                'title': 'Injected', 'description': 'No', 'estimated_time': 1,
            }),
            ('put', f'{base}/update_step/', {
                'property_id': self.property_a.property_id, 'step_number': 1,
                'title': 'Injected', 'description': 'No', 'estimated_time': 1,
            }),
            ('delete', f'{base}/delete_step/', {
                'property_id': self.property_a.property_id, 'step_number': 1,
            }),
            ('post', f'{base}/reorder_steps/', {
                'property_id': self.property_a.property_id, 'new_order': [1],
            }),
            ('post', f'{base}/duplicate/', {
                'property_id': self.property_a.property_id, 'new_name': 'Injected copy',
            }),
        ]

        for method, url, payload in requests:
            response = getattr(self.client, method)(url, payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

        self.procedure.refresh_from_db()
        self.assertEqual(self.procedure.steps[0]['title'], 'Original')
        self.assertFalse(MaintenanceProcedure.objects.filter(name='Injected copy').exists())

    def test_staff_custom_action_requires_matching_canonical_property(self):
        self.client.force_authenticate(user=self.staff)
        endpoint = f'/api/v1/maintenance-procedures/{self.procedure.pk}/add_step/'
        payload = {
            'property_id': self.property_a.property_id,
            'title': 'Authorized', 'description': 'Same property', 'estimated_time': 5,
        }

        allowed = self.client.post(endpoint, payload, format='json')
        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.content)
        self.procedure.refresh_from_db()
        self.assertEqual(self.procedure.steps[-1]['title'], 'Authorized')

        before = list(self.procedure.steps)
        denied = self.client.post(endpoint, {
            **payload,
            'property_id': self.property_b.property_id,
            'title': 'Foreign property',
        }, format='json')
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND, denied.content)
        self.procedure.refresh_from_db()
        self.assertEqual(self.procedure.steps, before)

    def test_staff_duplicate_is_bound_only_to_the_requested_property(self):
        self.procedure.machines.add(self.machine_b)
        self.client.force_authenticate(user=self.staff)

        response = self.client.post(
            f'/api/v1/maintenance-procedures/{self.procedure.pk}/duplicate/',
            {'property_id': self.property_a.property_id, 'new_name': 'Hotel A copy'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        duplicate = MaintenanceProcedure.objects.get(pk=response.data['duplicate_id'])
        self.assertEqual(list(duplicate.machines.all()), [self.machine_a])
