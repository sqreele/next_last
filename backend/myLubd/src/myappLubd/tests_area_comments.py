"""Tests for the Area and JobComment features.

Covers:
- create area
- list areas restricted by user's accessible properties
- create job with area
- create comment on job
- prevent access to other tenant data (areas + comments)
"""
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Area, Job, JobComment, Property, Room, Topic


User = get_user_model()


def _login(client, user):
    client.force_authenticate(user=user)


class AreaApiTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_a = User.objects.create_user(username='alice', password='pw12345!')
        self.user_b = User.objects.create_user(username='bob', password='pw12345!')

        self.prop_a = Property.objects.create(name='Hotel A')
        self.prop_a.users.add(self.user_a)
        self.prop_b = Property.objects.create(name='Hotel B')
        self.prop_b.users.add(self.user_b)

    def test_create_area(self):
        _login(self.client, self.user_a)
        resp = self.client.post('/api/v1/areas/', {
            'name': 'Lobby',
            'description': 'Main lobby',
            'property_id': self.prop_a.id,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.data['name'], 'Lobby')
        self.assertTrue(Area.objects.filter(name='Lobby', property=self.prop_a).exists())

    def test_cannot_create_area_on_inaccessible_property(self):
        _login(self.client, self.user_a)
        resp = self.client.post('/api/v1/areas/', {
            'name': 'Pump Room',
            'property_id': self.prop_b.id,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_areas_restricted_to_user_properties(self):
        Area.objects.create(property=self.prop_a, name='Lobby')
        Area.objects.create(property=self.prop_b, name='Restaurant')

        _login(self.client, self.user_a)
        resp = self.client.get('/api/v1/areas/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Pagination may or may not be applied; normalize
        data = resp.data.get('results') if isinstance(resp.data, dict) and 'results' in resp.data else resp.data
        names = [a['name'] for a in data]
        self.assertIn('Lobby', names)
        self.assertNotIn('Restaurant', names)

    def test_soft_delete_marks_inactive(self):
        area = Area.objects.create(property=self.prop_a, name='Rooftop')
        _login(self.client, self.user_a)
        resp = self.client.delete(f'/api/v1/areas/{area.id}/')
        self.assertIn(resp.status_code, (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT))
        area.refresh_from_db()
        self.assertFalse(area.is_active)


class JobWithAreaTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='tech', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel X')
        self.prop.users.add(self.user)
        self.area = Area.objects.create(property=self.prop, name='Lobby')
        self.room = Room.objects.create(name='101', room_type='Standard')
        self.room.properties.add(self.prop)
        self.topic = Topic.objects.create(title='Plumbing')

    def test_create_job_with_area(self):
        _login(self.client, self.user)
        resp = self.client.post('/api/v1/jobs/', {
            'description': 'Leak',
            'remarks': '',
            'priority': 'medium',
            'status': 'pending',
            'room_id': self.room.room_id,
            'topic_data': {'title': self.topic.title},
            'area_id': self.area.id,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        job_id = resp.data['job_id']
        job = Job.objects.get(job_id=job_id)
        self.assertEqual(job.area_id, self.area.id)
        # Detail response should include area name
        detail = self.client.get(f'/api/v1/jobs/{job_id}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data['area_name'], 'Lobby')


class JobCommentTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username='owner', password='pw12345!')
        self.intruder = User.objects.create_user(username='intruder', password='pw12345!')

        self.prop = Property.objects.create(name='Hotel Y')
        self.prop.users.add(self.owner)
        self.other_prop = Property.objects.create(name='Hotel Z')
        self.other_prop.users.add(self.intruder)

        self.room = Room.objects.create(name='202', room_type='Suite')
        self.room.properties.add(self.prop)
        self.topic = Topic.objects.create(title='Electrical')

        _login(self.client, self.owner)
        resp = self.client.post('/api/v1/jobs/', {
            'description': 'Lights flickering',
            'remarks': '',
            'priority': 'low',
            'status': 'pending',
            'room_id': self.room.room_id,
            'topic_data': {'title': self.topic.title},
        }, format='json')
        assert resp.status_code == status.HTTP_201_CREATED, resp.content
        self.job_id = resp.data['job_id']

    def test_create_and_list_comments_chronologically(self):
        _login(self.client, self.owner)
        for text in ['First', 'Second', 'Third']:
            r = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {'comment': text}, format='json')
            self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)

        r = self.client.get(f'/api/v1/jobs/{self.job_id}/comments/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        comments = r.data['results']
        self.assertEqual([c['comment'] for c in comments], ['First', 'Second', 'Third'])
        self.assertEqual(comments[0]['author_username'], 'owner')

    def test_empty_comment_rejected(self):
        _login(self.client, self.owner)
        r = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {'comment': '   '}, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cross_tenant_user_cannot_see_or_comment(self):
        # owner posts a comment
        _login(self.client, self.owner)
        self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {'comment': 'private'}, format='json')

        # intruder from different property must not access
        _login(self.client, self.intruder)
        r = self.client.get(f'/api/v1/jobs/{self.job_id}/comments/')
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

        r = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {'comment': 'hack'}, format='json')
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)
        # Confirm DB unchanged
        self.assertEqual(JobComment.objects.filter(comment='hack').count(), 0)
