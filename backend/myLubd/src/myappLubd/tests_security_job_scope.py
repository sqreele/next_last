from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Job, Property, Room, Tenant, Topic


User = get_user_model()


class JobTenantIsolationTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username='scope-alice', password='test-password')
        self.bob = User.objects.create_user(username='scope-bob', password='test-password')
        self.tenant_a = Tenant.objects.create(name='Scope Tenant A', owner=self.alice)
        self.tenant_b = Tenant.objects.create(name='Scope Tenant B', owner=self.bob)

        self.property_a = Property.objects.create(name='Scope Property A', tenant=self.tenant_a)
        self.property_a.users.add(self.alice)
        self.property_a_restricted = Property.objects.create(
            name='Scope Property A Restricted',
            tenant=self.tenant_a,
        )
        self.property_b = Property.objects.create(name='Scope Property B', tenant=self.tenant_b)
        self.property_b.users.add(self.bob)

        self.room_a = Room.objects.create(name='Scope A-101', room_type='Standard')
        self.room_a.properties.add(self.property_a)
        self.room_a_restricted = Room.objects.create(name='Scope A-201', room_type='Standard')
        self.room_a_restricted.properties.add(self.property_a_restricted)
        self.room_b = Room.objects.create(name='Scope B-101', room_type='Standard')
        self.room_b.properties.add(self.property_b)
        self.topic = Topic.objects.create(title='Scope Plumbing')

        self.job_a = Job.objects.create(
            user=self.alice,
            description='Tenant A job',
            remarks='Original',
            status='pending',
            priority='medium',
        )
        self.job_a.rooms.add(self.room_a)
        self.job_b = Job.objects.create(
            user=self.bob,
            description='Tenant B job',
            remarks='Original',
            status='pending',
            priority='medium',
        )
        self.job_b.rooms.add(self.room_b)
        self.client.force_authenticate(user=self.alice)

    def _create_payload(self, room_id):
        return {
            'description': 'Scoped new job',
            'remarks': 'Created by security test',
            'status': 'pending',
            'priority': 'medium',
            'room_id': room_id,
            'topic_data': {
                'title': self.topic.title,
                'description': self.topic.description or '',
            },
        }

    def test_same_property_create_and_update_are_allowed(self):
        create_response = self.client.post(
            '/api/v1/jobs/',
            self._create_payload(self.room_a.room_id),
            format='json',
        )
        update_response = self.client.patch(
            f'/api/v1/jobs/{self.job_a.job_id}/',
            {'status': 'in_progress'},
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.content)
        self.assertEqual(update_response.status_code, status.HTTP_200_OK, update_response.content)
        self.job_a.refresh_from_db()
        self.assertEqual(self.job_a.status, 'in_progress')

    def test_cross_tenant_room_is_rejected_on_create_patch_and_put(self):
        create_response = self.client.post(
            '/api/v1/jobs/',
            self._create_payload(self.room_b.room_id),
            format='json',
        )
        patch_response = self.client.patch(
            f'/api/v1/jobs/{self.job_a.job_id}/',
            {'rooms': [self.room_b.room_id]},
            format='json',
        )
        put_response = self.client.put(
            f'/api/v1/jobs/{self.job_a.job_id}/',
            {'rooms': [self.room_b.room_id]},
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN, create_response.content)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN, patch_response.content)
        self.assertEqual(put_response.status_code, status.HTTP_403_FORBIDDEN, put_response.content)
        self.assertFalse(Job.objects.filter(description='Scoped new job').exists())
        self.assertEqual(
            set(self.job_a.rooms.values_list('room_id', flat=True)),
            {self.room_a.room_id},
        )

    def test_same_tenant_but_unauthorized_property_ids_are_rejected(self):
        room_response = self.client.patch(
            f'/api/v1/jobs/{self.job_a.job_id}/',
            {'room_id': self.room_a_restricted.room_id},
            format='json',
        )
        property_response = self.client.patch(
            f'/api/v1/jobs/{self.job_a.job_id}/',
            {'property_id': self.property_a_restricted.property_id},
            format='json',
        )

        self.assertEqual(room_response.status_code, status.HTTP_403_FORBIDDEN, room_response.content)
        self.assertEqual(property_response.status_code, status.HTTP_403_FORBIDDEN, property_response.content)

    def test_foreign_job_id_is_hidden_for_read_update_and_delete(self):
        detail_url = f'/api/v1/jobs/{self.job_b.job_id}/'

        read_response = self.client.get(detail_url)
        update_response = self.client.patch(detail_url, {'status': 'completed'}, format='json')
        delete_response = self.client.delete(detail_url)

        self.assertEqual(read_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(update_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Job.objects.filter(pk=self.job_b.pk).exists())

    def test_list_excludes_foreign_tenant_jobs(self):
        response = self.client.get('/api/v1/jobs/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        returned_ids = {item['job_id'] for item in response.data['results']}
        self.assertIn(self.job_a.job_id, returned_ids)
        self.assertNotIn(self.job_b.job_id, returned_ids)
