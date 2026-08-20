"""B.5 Room canonical-write and legacy-M2M compatibility regression tests."""

from django.contrib.auth import get_user_model
from django.contrib import admin
from django.test import RequestFactory
from rest_framework import status
from rest_framework.test import APITestCase

from .admin import RoomAdmin
from .models import Job, Property, Room, Tenant, TenantMembership


User = get_user_model()


class RoomPropertyWriteEnforcementTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='room-writer', password='pw12345!')
        self.chinatown = Property.objects.create(name='Room Write Chinatown')
        self.siam = Property.objects.create(name='Room Write Siam')
        self.chinatown.users.add(self.user)
        self.client.force_authenticate(self.user)

    def create_room(self, name='RW-101', **payload):
        data = {'name': name, 'room_type': 'Standard', **payload}
        return self.client.post('/api/v1/rooms/', data, format='json')

    def assert_parity(self, room, property_obj):
        room.refresh_from_db()
        self.assertEqual(room.property_id, property_obj.pk)
        self.assertEqual(list(room.properties.values_list('pk', flat=True)), [property_obj.pk])

    def test_api_create_properties_sets_both_representations(self):
        response = self.create_room(properties=[self.chinatown.pk])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        room = Room.objects.get(name='RW-101')
        self.assert_parity(room, self.chinatown)
        self.assertEqual(response.data['properties'], [self.chinatown.pk])

    def test_api_create_accepts_property_id_and_matching_both_inputs(self):
        response = self.create_room('RW-102', property_id=str(self.chinatown.pk))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assert_parity(Room.objects.get(name='RW-102'), self.chinatown)

        response = self.create_room(
            'RW-103', property_id=self.chinatown.property_id, properties=[self.chinatown.pk],
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assert_parity(Room.objects.get(name='RW-103'), self.chinatown)

    def test_api_create_rejects_missing_multi_mismatched_or_unauthorized_property(self):
        cases = [
            ({}, 'RW-MISSING'),
            ({'property_id': None}, 'RW-NULL'),
            ({'properties': []}, 'RW-EMPTY'),
            ({'properties': [self.chinatown.pk, self.siam.pk]}, 'RW-MULTI'),
            ({'property_id': str(self.chinatown.pk), 'properties': [self.siam.pk]}, 'RW-DISAGREE'),
            ({'properties': [self.siam.pk]}, 'RW-UNAUTHORIZED'),
        ]
        for payload, name in cases:
            response = self.create_room(name, **payload)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
            self.assertFalse(Room.objects.filter(name=name).exists())

    def test_api_update_preserves_or_rejects_ownership_changes(self):
        room = Room.objects.create(name='RW-UPDATE', room_type='Standard', property=self.chinatown)
        room.properties.set([self.chinatown])

        response = self.client.patch(
            f'/api/v1/rooms/{room.room_id}/', {'room_type': 'Suite'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assert_parity(room, self.chinatown)

        response = self.client.patch(
            f'/api/v1/rooms/{room.room_id}/', {'properties': [self.chinatown.pk]}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        for payload in (
            {'properties': []},
            {'properties': [self.siam.pk]},
            {'property_id': str(self.siam.pk)},
            {'property_id': None},
        ):
            response = self.client.patch(f'/api/v1/rooms/{room.room_id}/', payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
            self.assert_parity(room, self.chinatown)

    def test_historical_job_room_cannot_be_relocated(self):
        room = Room.objects.create(name='RW-HISTORY', room_type='Standard', property=self.chinatown)
        room.properties.set([self.chinatown])
        job = Job.objects.create(user=self.user, property=self.chinatown, description='Historical room job')
        job.rooms.add(room)

        response = self.client.patch(
            f'/api/v1/rooms/{room.room_id}/', {'property_id': str(self.siam.pk)}, format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assert_parity(room, self.chinatown)
        self.assertEqual(job.property_id, room.property_id)

    def test_restricted_staff_cannot_write_other_property(self):
        tenant = Tenant.objects.create(name='Room Write Tenant')
        staff_chinatown = Property.objects.create(name='Staff Chinatown', tenant=tenant)
        staff_siam = Property.objects.create(name='Staff Siam', tenant=tenant)
        staff = User.objects.create_user(username='restricted-room-staff', password='pw12345!', is_staff=True)
        membership = TenantMembership.objects.create(user=staff, tenant=tenant, role='supervisor')
        membership.properties.add(staff_chinatown)
        self.client.force_authenticate(staff)

        allowed = self.create_room('RW-STAFF-OK', properties=[staff_chinatown.pk])
        denied = self.create_room('RW-STAFF-NO', properties=[staff_siam.pk])

        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED, allowed.content)
        self.assertEqual(denied.status_code, status.HTTP_400_BAD_REQUEST, denied.content)
        self.assert_parity(Room.objects.get(name='RW-STAFF-OK'), staff_chinatown)
        self.assertFalse(Room.objects.filter(name='RW-STAFF-NO').exists())

    def test_admin_form_uses_single_canonical_property_and_makes_existing_immutable(self):
        admin_user = User.objects.create_superuser(username='room-admin', password='pw12345!')
        request = RequestFactory().get('/admin/')
        request.user = admin_user
        model_admin = RoomAdmin(Room, admin.site)

        add_form = model_admin.get_form(request)
        self.assertIn('property', add_form.base_fields)
        self.assertNotIn('properties', add_form.base_fields)

        form = add_form(data={
            'name': 'RW-ADMIN-CREATE',
            'room_type': 'Standard',
            'is_active': True,
            'property': self.chinatown.pk,
        })
        self.assertTrue(form.is_valid(), form.errors)
        created = form.save(commit=False)
        model_admin.save_model(request, created, form, change=False)
        model_admin.save_related(request, form, [], change=False)
        self.assert_parity(created, self.chinatown)

        room = Room.objects.create(name='RW-ADMIN', room_type='Standard', property=self.chinatown)
        room.properties.set([self.chinatown])
        self.assertIn('property', model_admin.get_readonly_fields(request, room))
