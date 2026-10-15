import json
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Area, Job, Property, Room, Tenant, TenantMembership, Topic


User = get_user_model()


def image_upload(name):
    payload = BytesIO()
    Image.new('RGB', (8, 8), (20, 40, 60)).save(payload, format='PNG')
    return SimpleUploadedFile(name, payload.getvalue(), content_type='image/png')


class CreateJobContractTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='create-contract-user')
        tenant = Tenant.objects.create(name='Create contract tenant')
        self.property = Property.objects.create(name='New Property', tenant=tenant)
        TenantMembership.objects.create(
            user=self.user,
            tenant=tenant,
            role='manager',
        ).properties.add(self.property)
        self.area = Area.objects.create(property=self.property, name='Lobby')
        self.room = Room.objects.create(
            property=self.property,
            name='101',
            room_type='Standard',
        )
        self.visible_topic = Topic.objects.create(title='Visible first-job topic')
        Topic.objects.create(title='Hidden topic', is_visible_in_create_job=False)
        self.client.force_authenticate(self.user)

    def payload(self, **overrides):
        payload = {
            'description': 'Create contract job',
            'remarks': '',
            'status': 'pending',
            'priority': 'medium',
            'property_id': self.property.property_id,
            'area_id': self.area.pk,
            'topic_data': {'title': self.visible_topic.title},
        }
        payload.update(overrides)
        return payload

    def test_critical_priority_is_supported(self):
        response = self.client.post(
            '/api/v1/jobs/',
            self.payload(priority='critical'),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(Job.objects.get(job_id=response.data['job_id']).priority, 'critical')

    def test_create_requires_room_or_area(self):
        response = self.client.post(
            '/api/v1/jobs/',
            self.payload(area_id=None),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertIn('non_field_errors', response.data)

    def test_new_property_receives_visible_topic_catalogue(self):
        response = self.client.get(
            f'/api/v1/topics/?property={self.property.property_id}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        titles = [item['title'] for item in response.data]
        self.assertIn(self.visible_topic.title, titles)
        self.assertNotIn('Hidden topic', titles)

    def test_completed_create_preserves_before_and_after_image_types(self):
        payload = self.payload(
            status='completed',
            topic_data=json.dumps({'title': self.visible_topic.title}),
            before_images=image_upload('before.png'),
            after_images=image_upload('after.png'),
        )
        response = self.client.post('/api/v1/jobs/', payload, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        job = Job.objects.get(job_id=response.data['job_id'])
        self.assertEqual(
            set(job.job_images.values_list('image_type', flat=True)),
            {'before', 'after'},
        )

    def test_pending_create_rejects_after_images(self):
        response = self.client.post(
            '/api/v1/jobs/',
            self.payload(
                topic_data=json.dumps({'title': self.visible_topic.title}),
                after_images=image_upload('after.png'),
            ),
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertIn('after_images', response.data)
