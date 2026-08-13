"""Tests for the Area and JobComment features.

Covers:
- create area
- list areas restricted by user's accessible properties
- create job with area
- create comment on job
- prevent access to other tenant data (areas + comments)
"""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.contrib.auth import get_user_model
from django.db import IntegrityError, close_old_connections, connections, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Area, Job, JobComment, Property, Room, Tenant, Topic


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
        self.assertEqual(detail.data['area_id'], self.area.id)
        self.assertEqual(detail.data['area']['name'], 'Lobby')

    def test_create_area_only_job_is_listed_with_area(self):
        _login(self.client, self.user)
        resp = self.client.post('/api/v1/jobs/', {
            'description': 'Bathroom leak',
            'remarks': '',
            'priority': 'medium',
            'status': 'pending',
            'topic_data': {'title': self.topic.title},
            'area_id': self.area.id,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.data['area_id'], self.area.id)
        self.assertEqual(resp.data['area']['name'], 'Lobby')

        listing = self.client.get('/api/v1/jobs/')
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        results = listing.data.get('results', listing.data)
        created = next(job for job in results if job['job_id'] == resp.data['job_id'])
        self.assertEqual(created['area_name'], 'Lobby')
        self.assertEqual(created['area_id'], self.area.id)

    def test_create_job_may_omit_remarks_but_rejects_null(self):
        _login(self.client, self.user)
        payload = {
            'description': 'No notes yet',
            'priority': 'medium',
            'status': 'pending',
            'room_id': self.room.room_id,
            'topic_data': {'title': self.topic.title},
        }
        response = self.client.post('/api/v1/jobs/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(Job.objects.get(job_id=response.data['job_id']).remarks, '')

        payload['description'] = 'Null notes'
        payload['remarks'] = None
        response = self.client.post('/api/v1/jobs/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertFalse(Job.objects.filter(description='Null notes').exists())

    def test_area_and_room_must_belong_to_same_property(self):
        other_prop = Property.objects.create(name='Hotel Other')
        other_prop.users.add(self.user)
        other_room = Room.objects.create(name='909', room_type='Standard')
        other_room.properties.add(other_prop)

        _login(self.client, self.user)
        resp = self.client.post('/api/v1/jobs/', {
            'description': 'Mismatch',
            'remarks': '',
            'priority': 'medium',
            'status': 'pending',
            'room_id': other_room.room_id,
            'topic_data': {'title': self.topic.title},
            'area_id': self.area.id,
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertFalse(Job.objects.filter(description='Mismatch').exists())

    def test_room_id_create_rejects_inaccessible_room(self):
        other_user = User.objects.create_user(username='other-tech', password='pw12345!')
        other_prop = Property.objects.create(name='Hotel Other Tenant')
        other_prop.users.add(other_user)
        other_room = Room.objects.create(name='808', room_type='Standard')
        other_room.properties.add(other_prop)

        _login(self.client, self.user)
        resp = self.client.post('/api/v1/jobs/', {
            'description': 'Cross tenant room',
            'remarks': '',
            'priority': 'medium',
            'status': 'pending',
            'room_id': other_room.room_id,
            'topic_data': {'title': self.topic.title},
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.assertFalse(Job.objects.filter(description='Cross tenant room').exists())


class JobCommentTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username='owner', password='pw12345!')
        self.intruder = User.objects.create_user(username='intruder', password='pw12345!')

        self.tenant = Tenant.objects.create(name='Hotel Y Tenant', owner=self.owner)
        self.other_tenant = Tenant.objects.create(name='Hotel Z Tenant', owner=self.intruder)
        self.prop = Property.objects.create(name='Hotel Y', tenant=self.tenant)
        self.prop.users.add(self.owner)
        self.other_prop = Property.objects.create(name='Hotel Z', tenant=self.other_tenant)
        self.other_prop.users.add(self.intruder)

        self.room = Room.objects.create(name='202', room_type='Suite')
        self.room.properties.add(self.prop)
        self.topic = Topic.objects.create(title='Electrical')

        _login(self.client, self.owner)
        resp = self.client.post('/api/v1/jobs/', {
            'description': 'Lights flickering',
            'remarks': 'Initial report',
            'priority': 'low',
            'status': 'pending',
            'room_id': self.room.room_id,
            'topic_data': {'title': self.topic.title},
        }, format='json')
        assert resp.status_code == status.HTTP_201_CREATED, resp.content
        self.job_id = resp.data['job_id']

    def test_create_and_list_comments_chronologically(self):
        _login(self.client, self.owner)
        comments = [
            ('First', '10111111-1111-4111-8111-111111111111'),
            ('Second', '20222222-2222-4222-8222-222222222222'),
            ('Third', '30333333-3333-4333-8333-333333333333'),
        ]
        for text, request_id in comments:
            r = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {
                'comment': text,
                'client_comment_request_id': request_id,
            }, format='json')
            self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.content)

        r = self.client.get(f'/api/v1/jobs/{self.job_id}/comments/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        comments = r.data['results']
        self.assertEqual([c['comment'] for c in comments], ['First', 'Second', 'Third'])
        self.assertEqual(comments[0]['author_username'], 'owner')

    def test_lost_response_replay_with_same_request_id_creates_one_comment(self):
        """A replay after an uncertain response must resolve the first write."""
        _login(self.client, self.owner)
        payload = {
            'comment': 'Response was lost after this write',
            'client_comment_request_id': '9af1da9c-47e0-49cd-9708-10e7a8858ed5',
        }

        initial = self.client.post(
            f'/api/v1/jobs/{self.job_id}/comments/', payload, format='json'
        )
        replay = self.client.post(
            f'/api/v1/jobs/{self.job_id}/comments/', payload, format='json'
        )

        self.assertEqual(initial.status_code, status.HTTP_201_CREATED, initial.content)
        self.assertEqual(
            JobComment.objects.filter(
                job__job_id=self.job_id,
                comment=payload['comment'],
            ).count(),
            1,
        )
        self.assertEqual(replay.status_code, status.HTTP_200_OK, replay.content)
        self.assertEqual(replay.data['id'], initial.data['id'])

    def test_fresh_request_returns_canonical_identity_and_author(self):
        _login(self.client, self.owner)
        request_id = 'ec5a64fd-e230-4600-b888-7afe2beabe44'

        response = self.client.post(
            f'/api/v1/jobs/{self.job_id}/comments/',
            {
                'comment': 'Canonical author wins',
                'client_comment_request_id': request_id,
                'author_id': self.intruder.pk,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data['client_comment_request_id'], request_id)
        self.assertEqual(response.data['author_id'], self.owner.pk)
        self.assertEqual(JobComment.objects.filter(job__job_id=self.job_id).count(), 1)

    def test_same_request_id_with_different_body_is_rejected(self):
        _login(self.client, self.owner)
        request_id = '2a703d4a-d681-4905-961c-97c969bf2234'
        endpoint = f'/api/v1/jobs/{self.job_id}/comments/'
        first = self.client.post(endpoint, {
            'comment': 'Original body',
            'client_comment_request_id': request_id,
        }, format='json')
        conflict = self.client.post(endpoint, {
            'comment': 'Changed body',
            'client_comment_request_id': request_id,
        }, format='json')

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.content)
        self.assertEqual(conflict.status_code, status.HTTP_400_BAD_REQUEST, conflict.content)
        self.assertEqual(JobComment.objects.filter(job__job_id=self.job_id).count(), 1)
        self.assertEqual(
            JobComment.objects.get(job__job_id=self.job_id).comment,
            'Original body',
        )

    def test_same_request_id_on_different_authorized_job_is_independent(self):
        second_job = Job.objects.create(
            user=self.owner,
            description='Second authorized job',
            remarks='',
        )
        second_job.rooms.add(self.room)
        request_id = '3bbda302-48c7-457f-b2a8-fc2f737ec3d2'
        _login(self.client, self.owner)

        first = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {
            'comment': 'Job A comment',
            'client_comment_request_id': request_id,
        }, format='json')
        second = self.client.post(f'/api/v1/jobs/{second_job.job_id}/comments/', {
            'comment': 'Job B comment',
            'client_comment_request_id': request_id,
        }, format='json')

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.content)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.content)
        self.assertNotEqual(first.data['id'], second.data['id'])
        self.assertEqual(JobComment.objects.filter(client_comment_request_id=request_id).count(), 2)

    def test_same_request_id_for_different_owner_does_not_disclose_comment(self):
        other_room = Room.objects.create(name='303', room_type='Suite')
        other_room.properties.add(self.other_prop)
        other_job = Job.objects.create(
            user=self.intruder,
            description='Other tenant job',
            remarks='',
        )
        other_job.rooms.add(other_room)
        request_id = '8052fae0-c6c8-4c2e-a479-b1906947e6f5'

        _login(self.client, self.owner)
        owner_response = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {
            'comment': 'Owner private comment',
            'client_comment_request_id': request_id,
        }, format='json')
        _login(self.client, self.intruder)
        intruder_response = self.client.post(f'/api/v1/jobs/{other_job.job_id}/comments/', {
            'comment': 'Independent intruder comment',
            'client_comment_request_id': request_id,
        }, format='json')

        self.assertEqual(owner_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(intruder_response.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(owner_response.data['id'], intruder_response.data['id'])
        self.assertEqual(intruder_response.data['author_id'], self.intruder.pk)

    def test_foreign_job_authorization_precedes_request_id_lookup(self):
        request_id = '0ac437a8-b0ae-4ebc-bacf-95f76bad0b6c'
        _login(self.client, self.owner)
        created = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {
            'comment': 'Must not be disclosed',
            'client_comment_request_id': request_id,
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        _login(self.client, self.intruder)
        denied = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {
            'comment': 'Must not be disclosed',
            'client_comment_request_id': request_id,
        }, format='json')

        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotContains(denied, 'Must not be disclosed', status_code=404)
        self.assertEqual(JobComment.objects.filter(client_comment_request_id=request_id).count(), 1)

    def test_distinct_request_ids_allow_intentional_identical_comments(self):
        _login(self.client, self.owner)
        endpoint = f'/api/v1/jobs/{self.job_id}/comments/'
        for request_id in (
            'c5be536d-0d37-413f-a1bd-54052f6db4ae',
            'ee56fe41-7979-4281-8b97-f7ef8661d77c',
        ):
            response = self.client.post(endpoint, {
                'comment': 'Intentionally repeated text',
                'client_comment_request_id': request_id,
            }, format='json')
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

        self.assertEqual(
            JobComment.objects.filter(comment='Intentionally repeated text').count(),
            2,
        )

    def test_historical_null_request_ids_remain_valid(self):
        JobComment.objects.create(job_id=Job.objects.get(job_id=self.job_id).pk, author=self.owner, comment='Legacy one')
        JobComment.objects.create(job_id=Job.objects.get(job_id=self.job_id).pk, author=self.owner, comment='Legacy two')

        self.assertEqual(
            JobComment.objects.filter(client_comment_request_id__isnull=True).count(),
            2,
        )

    def test_database_constraint_rejects_duplicate_non_null_identity(self):
        job = Job.objects.get(job_id=self.job_id)
        request_id = 'c7941c66-97a7-47d4-af4d-e1bac78a9862'
        JobComment.objects.create(
            job=job,
            author=self.owner,
            comment='First constrained row',
            client_comment_request_id=request_id,
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            JobComment.objects.create(
                job=job,
                author=self.owner,
                comment='Racing duplicate',
                client_comment_request_id=request_id,
            )

    def test_empty_comment_rejected(self):
        _login(self.client, self.owner)
        r = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {
            'comment': '   ',
            'client_comment_request_id': 'a5b4695d-f541-4f67-a8c6-94625aa0093a',
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_new_comment_without_request_identity_is_rejected(self):
        _login(self.client, self.owner)

        response = self.client.post(
            f'/api/v1/jobs/{self.job_id}/comments/',
            {'comment': 'Missing immutable identity'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(JobComment.objects.filter(job__job_id=self.job_id).count(), 0)

    def test_cross_tenant_user_cannot_see_or_comment(self):
        # owner posts a comment
        _login(self.client, self.owner)
        self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {
            'comment': 'private',
            'client_comment_request_id': 'b365541e-3014-4b6a-9074-6528cd658b84',
        }, format='json')

        # intruder from different property must not access
        _login(self.client, self.intruder)
        r = self.client.get(f'/api/v1/jobs/{self.job_id}/comments/')
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

        r = self.client.post(f'/api/v1/jobs/{self.job_id}/comments/', {
            'comment': 'hack',
            'client_comment_request_id': 'd2a6b594-359e-4159-980a-a119dc0c66d4',
        }, format='json')
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)
        # Confirm DB unchanged
        self.assertEqual(JobComment.objects.filter(comment='hack').count(), 0)


class JobCommentConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = User.objects.create_user(username='comment-racer', password='pw12345!')
        self.tenant = Tenant.objects.create(name='Concurrency Tenant', owner=self.owner)
        self.prop = Property.objects.create(name='Concurrency Hotel', tenant=self.tenant)
        self.prop.users.add(self.owner)
        self.room = Room.objects.create(name='C-101', room_type='Plant')
        self.room.properties.add(self.prop)
        self.job = Job.objects.create(
            user=self.owner,
            description='Concurrent comment target',
            remarks='',
        )
        self.job.rooms.add(self.room)

    def test_concurrent_same_id_requests_create_one_row_without_integrity_error(self):
        barrier = Barrier(2)
        endpoint = f'/api/v1/jobs/{self.job.job_id}/comments/'
        payload = {
            'comment': 'One logical concurrent comment',
            'client_comment_request_id': 'fb7f59b0-e9f7-42ec-835f-30fd606e6648',
        }

        def post_comment():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=self.owner)
                barrier.wait(timeout=5)
                response = client.post(endpoint, payload, format='json')
                return response.status_code, response.data
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: post_comment(), range(2)))

        self.assertEqual(sorted(code for code, _ in results), [200, 201])
        self.assertEqual({body['id'] for _, body in results}, {
            JobComment.objects.get(client_comment_request_id=payload['client_comment_request_id']).pk
        })
        self.assertEqual(
            JobComment.objects.filter(
                client_comment_request_id=payload['client_comment_request_id']
            ).count(),
            1,
        )
