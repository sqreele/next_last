"""Regression coverage for the required canonical Job.property field."""

from django.contrib.auth import get_user_model
from django.core.exceptions import FieldDoesNotExist
from django.db import IntegrityError, transaction
from django.db.models import ForeignKey, ManyToManyField
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Job, Property, Room, Tenant, TenantMembership, UserProfile


User = get_user_model()


class JobPropertySchemaTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='job-property-user', password='pw12345!')
        tenant = Tenant.objects.create(name='Job Property Tenant')
        self.property = Property.objects.create(name='Job Property Hotel', tenant=tenant)
        TenantMembership.objects.create(user=self.user, tenant=tenant, role='technician').properties.add(self.property)
        self.room = Room.objects.create(name='JP-101', room_type='Standard', property=self.property)

    def test_database_rejects_job_without_property(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Job.objects.create(
                    user=self.user,
                    updated_by=self.user,
                    description='Invalid propertyless job',
                    remarks='',
                )

    def test_canonical_relations_exist_and_legacy_relations_remain_removed(self):
        self.assertIsInstance(Job._meta.get_field('property'), ForeignKey)
        self.assertFalse(Job._meta.get_field('property').null)
        self.assertIsInstance(Job._meta.get_field('rooms'), ManyToManyField)
        self.assertIsInstance(Room._meta.get_field('property'), ForeignKey)
        self.assertFalse(Room._meta.get_field('property').null)
        self.assertIsInstance(TenantMembership._meta.get_field('properties'), ManyToManyField)

        for model, field_name in (
            (Room, 'properties'),
            (Property, 'users'),
            (UserProfile, 'properties'),
        ):
            with self.subTest(model=model.__name__, field=field_name):
                with self.assertRaises(FieldDoesNotExist):
                    model._meta.get_field(field_name)

    def test_model_can_reference_property_without_changing_location_relations(self):
        job = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            property=self.property,
            description='Direct property job',
            remarks='',
        )

        self.assertEqual(job.property, self.property)
        self.assertFalse(job.rooms.exists())
        self.assertIsNone(job.area_id)

    def test_existing_api_create_path_populates_property_from_room(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            '/api/v1/jobs/',
            {
                'description': 'Existing serializer contract',
                'remarks': 'Existing API behavior',
                'status': 'pending',
                'priority': 'medium',
                'room_id': self.room.room_id,
                'topic_data': {'title': 'Job property schema topic'},
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        job = Job.objects.get(job_id=response.data['job_id'])
        self.assertEqual(job.property_id, self.property.id)
        self.assertIn(self.room, job.rooms.all())
