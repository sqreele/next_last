"""Write-path invariants for canonical Job.property."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Area, Job, Machine, PreventiveMaintenance, Property, Room, Tenant, TenantMembership
from .services import JobService


User = get_user_model()


class JobPropertyWriteApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='job-property-writer', password='pw12345!')
        self.tenant = Tenant.objects.create(name='Job property write tenant')
        self.chinatown = Property.objects.create(name='Chinatown', tenant=self.tenant)
        self.siam = Property.objects.create(name='Siam', tenant=self.tenant)
        membership = TenantMembership.objects.create(user=self.user, tenant=self.tenant, role='manager')
        membership.properties.add(self.chinatown, self.siam)
        self.chinatown_area = Area.objects.create(property=self.chinatown, name='Lobby')
        self.chinatown_area_2 = Area.objects.create(property=self.chinatown, name='Roof')
        self.siam_area = Area.objects.create(property=self.siam, name='Restaurant')
        self.chinatown_room = Room.objects.create(
            name='WE-C-101', room_type='Standard', property=self.chinatown,
        )
        self.chinatown_room.properties.add(self.chinatown)
        self.chinatown_room_2 = Room.objects.create(
            name='WE-C-102', room_type='Standard', property=self.chinatown,
        )
        self.chinatown_room_2.properties.add(self.chinatown)
        self.siam_room = Room.objects.create(
            name='WE-S-101', room_type='Standard', property=self.siam,
        )
        self.siam_room.properties.add(self.siam)
        self.client.force_authenticate(self.user)

    def payload(self, **overrides):
        data = {
            'description': 'Canonical write test',
            'remarks': 'test',
            'status': 'pending',
            'priority': 'medium',
            'topic_data': {'title': 'Canonical write topic'},
        }
        data.update(overrides)
        return data

    def create_job(self, **overrides):
        response = self.client.post('/api/v1/jobs/', self.payload(**overrides), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        return Job.objects.get(job_id=response.data['job_id'])

    def test_create_property_only(self):
        job = self.create_job(property_id=self.chinatown.property_id)
        self.assertEqual(job.property_id, self.chinatown.id)

    def test_create_area_only_and_rooms_only(self):
        area_job = self.create_job(area_id=self.chinatown_area.id)
        room_job = self.create_job(room_id=self.chinatown_room.room_id)
        self.assertEqual(area_job.property_id, self.chinatown.id)
        self.assertEqual(room_job.property_id, self.chinatown.id)

    def test_create_matching_property_area_and_room(self):
        job = self.create_job(
            property_id=self.chinatown.property_id,
            area_id=self.chinatown_area.id,
            room_id=self.chinatown_room.room_id,
        )
        self.assertEqual(job.property_id, self.chinatown.id)

    def test_create_rejects_missing_or_cross_property_location(self):
        for payload in (
            self.payload(),
            self.payload(property_id=self.chinatown.property_id, area_id=self.siam_area.id),
            self.payload(property_id=self.chinatown.property_id, room_id=self.siam_room.room_id),
            self.payload(area_id=self.chinatown_area.id, room_id=self.siam_room.room_id),
        ):
            response = self.client.post('/api/v1/jobs/', payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)

    def test_updates_preserve_immutable_property_and_reject_foreign_locations(self):
        job = self.create_job(area_id=self.chinatown_area.id, room_id=self.chinatown_room.room_id)

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/', {'area_id': self.chinatown_area_2.id}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/', {'room_ids': [self.chinatown_room_2.room_id]}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        for payload in (
            {'area_id': self.siam_area.id},
            {'room_ids': [self.siam_room.room_id]},
            {'property_id': self.siam.property_id},
        ):
            response = self.client.patch(f'/api/v1/jobs/{job.job_id}/', payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)

        response = self.client.patch(f'/api/v1/jobs/{job.job_id}/', {'status': 'in_progress'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        job.refresh_from_db()
        self.assertEqual(job.property_id, self.chinatown.id)
        self.assertEqual(job.area_id, self.chinatown_area_2.id)
        self.assertEqual(set(job.rooms.values_list('room_id', flat=True)), {self.chinatown_room_2.room_id})

    def test_staff_cannot_bypass_cross_property_integrity(self):
        staff = User.objects.create_user(username='job-property-staff', password='pw12345!', is_staff=True)
        self.client.force_authenticate(staff)
        response = self.client.post(
            '/api/v1/jobs/',
            self.payload(property_id=self.chinatown.property_id, room_id=self.siam_room.room_id),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)


class JobPropertyWriteServiceAndPmTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='job-property-service', password='pw12345!')
        self.property = Property.objects.create(name='Service property')
        self.room = Room.objects.create(
            name='WE-SVC-101', room_type='Standard', property=self.property,
        )
        self.room.properties.add(self.property)

    def test_legacy_service_populates_property(self):
        job = JobService.create_job(self.user, {
            'description': 'Service job',
            'remarks': 'test',
            'room_id': self.room.room_id,
            'topic_data': {'title': 'Service topic'},
        })
        self.assertEqual(job.property_id, self.property.id)

    def test_pm_materialization_populates_machine_property(self):
        machine = Machine.objects.create(name='PM property machine', property=self.property)
        pm = PreventiveMaintenance.objects.create(
            pmtitle='Property PM',
            scheduled_date=timezone.now() - timedelta(minutes=1),
            created_by=self.user,
        )
        pm.machines.add(machine)

        call_command('materialize_due_pm_jobs')

        pm.refresh_from_db()
        self.assertIsNotNone(pm.job_id)
        self.assertEqual(pm.job.property_id, self.property.id)

    def test_model_validation_rejects_property_area_mismatch(self):
        other = Property.objects.create(name='Other property')
        foreign_area = Area.objects.create(property=other, name='Foreign area')
        job = Job(
            user=self.user,
            updated_by=self.user,
            property=self.property,
            area=foreign_area,
            description='Invalid',
            remarks='test',
        )
        with self.assertRaises(ValidationError):
            job.full_clean()
