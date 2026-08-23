"""Tests for the room bulk-import endpoint."""

from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import Property, Room, Tenant, TenantMembership


User = get_user_model()


GOOD_CSV = (
    'name,room_type,is_active\n'
    'A-101,Standard,true\n'
    'A-102,Standard,true\n'
    'A-201,Suite,true\n'
)


def _csv_file(text):
    buf = BytesIO(text.encode('utf-8'))
    buf.name = 'rooms.csv'
    return buf


class RoomBulkImportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pw12345!')
        tenant = Tenant.objects.create(name='Room Import Tenant')
        self.prop = Property.objects.create(name='Hotel A', tenant=tenant)
        TenantMembership.objects.create(user=self.user, tenant=tenant, role='supervisor').properties.add(self.prop)
        self.client.force_authenticate(user=self.user)

    def _post(self, payload, **extra):
        return self.client.post(
            f'/api/v1/rooms/bulk-import/?property_id={self.prop.id}',
            payload,
            **extra,
        )

    def test_template_endpoint_returns_csv_with_canonical_columns(self):
        resp = self.client.get('/api/v1/rooms/import-template/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.content.decode('utf-8')
        header = body.split('\n', 1)[0]
        self.assertIn('name', header)
        self.assertIn('room_type', header)
        self.assertIn('property_id', header)

    def test_happy_path_creates_rooms_attached_to_property(self):
        resp = self._post(
            {'file': _csv_file(GOOD_CSV)},
            format='multipart',
        )
        self.assertIn(resp.status_code, (status.HTTP_201_CREATED, status.HTTP_207_MULTI_STATUS), resp.content)
        self.assertEqual(resp.data['created_count'], 3)
        self.assertEqual(resp.data['error_count'], 0)
        self.assertEqual(Room.objects.count(), 3)
        for room in Room.objects.all():
            self.assertEqual(room.property_id, self.prop.pk)

    def test_existing_room_for_same_property_is_reused_not_duplicated(self):
        existing = Room.objects.create(name='A-101', room_type='Standard', property=self.prop)
        resp = self._post(
            {'file': _csv_file(GOOD_CSV)},
            format='multipart',
        )
        self.assertIn(resp.status_code, (status.HTTP_201_CREATED, status.HTTP_207_MULTI_STATUS), resp.content)
        self.assertEqual(Room.objects.count(), 3)  # only 2 new
        self.assertEqual(resp.data['attached_count'], 1)
        existing.refresh_from_db()
        self.assertEqual(existing.property, self.prop)

    def test_existing_room_for_different_property_is_a_conflict(self):
        other_prop = Property.objects.create(name='Hotel B')
        existing = Room.objects.create(name='A-101', room_type='Standard', property=other_prop)

        response = self._post({'file': _csv_file(GOOD_CSV)}, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_207_MULTI_STATUS, response.content)
        self.assertEqual(response.data['error_count'], 1)
        self.assertIn('ROOM PROPERTY CONFLICT', response.data['errors'][0]['error'])
        existing.refresh_from_db()
        self.assertEqual(existing.property, other_prop)

    def test_idempotent_on_rerun(self):
        # First run creates everything; second run must not create duplicates
        # nor produce errors.
        self._post({'file': _csv_file(GOOD_CSV)}, format='multipart')
        resp = self._post({'file': _csv_file(GOOD_CSV)}, format='multipart')
        self.assertEqual(Room.objects.count(), 3)
        self.assertEqual(resp.data['created_count'], 0)
        self.assertEqual(resp.data['attached_count'], 3)
        self.assertEqual(resp.data['error_count'], 0)

    def test_partial_failure_reports_per_row(self):
        bad_csv = 'name,room_type\n,Suite\nA-101,Standard\n'
        resp = self._post(
            {'file': _csv_file(bad_csv)},
            format='multipart',
        )
        self.assertEqual(resp.status_code, status.HTTP_207_MULTI_STATUS, resp.content)
        self.assertEqual(resp.data['created_count'], 1)
        self.assertEqual(resp.data['error_count'], 1)
        self.assertEqual(resp.data['errors'][0]['row'], 2)

    def test_user_without_property_access_cannot_import(self):
        outsider = User.objects.create_user(username='nobody', password='pw12345!')
        self.client.force_authenticate(user=outsider)
        resp = self._post({'file': _csv_file(GOOD_CSV)}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Room.objects.exists())

    def test_inactive_room_via_is_active_false(self):
        csv_body = 'name,room_type,is_active\nA-999,Closet,false\n'
        resp = self._post(
            {'file': _csv_file(csv_body)},
            format='multipart',
        )
        self.assertIn(resp.status_code, (status.HTTP_201_CREATED, status.HTTP_207_MULTI_STATUS))
        room = Room.objects.get(name='A-999')
        self.assertFalse(room.is_active)
