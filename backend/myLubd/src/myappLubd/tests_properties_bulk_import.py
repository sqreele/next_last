"""Tests for the property bulk-import endpoint."""

from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import Property


User = get_user_model()


GOOD_CSV = (
    'name,property_id,description\n'
    'Hotel Phuket Beach,,Beach resort 80 rooms\n'
    'Hotel Bangkok Central,,Downtown 120 rooms\n'
)


def _csv_file(text):
    buf = BytesIO(text.encode('utf-8'))
    buf.name = 'properties.csv'
    return buf


class PropertyBulkImportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(username='owner', password='pw12345!', is_staff=True)
        self.regular = User.objects.create_user(username='alice', password='pw12345!')

    def _post(self, payload, **extra):
        return self.client.post('/api/v1/properties/bulk-import/', payload, **extra)

    def test_template_returns_csv_header(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get('/api/v1/properties/import-template/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.content.decode('utf-8')
        header = body.split('\n', 1)[0]
        for field in ('name', 'property_id', 'description'):
            self.assertIn(field, header)

    def test_staff_can_import_and_gets_attached(self):
        self.client.force_authenticate(user=self.staff)
        resp = self._post({'file': _csv_file(GOOD_CSV)}, format='multipart')
        self.assertIn(resp.status_code, (status.HTTP_201_CREATED, status.HTTP_207_MULTI_STATUS), resp.content)
        self.assertEqual(resp.data['created_count'], 2)
        self.assertEqual(resp.data['error_count'], 0)
        self.assertEqual(Property.objects.count(), 2)
        for prop in Property.objects.all():
            self.assertIn(self.staff, prop.users.all())
            self.assertTrue(prop.property_id, 'property_id should be auto-generated when blank.')

    def test_regular_user_is_forbidden(self):
        self.client.force_authenticate(user=self.regular)
        resp = self._post({'file': _csv_file(GOOD_CSV)}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Property.objects.exists())

    def test_reuploading_same_sheet_reattaches_existing(self):
        self.client.force_authenticate(user=self.staff)
        # First run creates everything; second run with another user as the
        # actor must attach the existing rows to them instead of creating
        # duplicates.
        self._post({'file': _csv_file(GOOD_CSV)}, format='multipart')
        other_staff = User.objects.create_user(username='owner2', password='pw12345!', is_staff=True)
        self.client.force_authenticate(user=other_staff)
        resp = self._post({'file': _csv_file(GOOD_CSV)}, format='multipart')
        self.assertEqual(Property.objects.count(), 2)
        self.assertEqual(resp.data['created_count'], 0)
        self.assertEqual(resp.data['attached_count'], 2)
        for prop in Property.objects.all():
            self.assertIn(other_staff, prop.users.all())

    def test_missing_name_is_reported_per_row(self):
        self.client.force_authenticate(user=self.staff)
        bad = 'name,description\n,Missing name row\nValid Hotel,Has a name\n'
        resp = self._post({'file': _csv_file(bad)}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_207_MULTI_STATUS, resp.content)
        self.assertEqual(resp.data['created_count'], 1)
        self.assertEqual(resp.data['error_count'], 1)
        self.assertEqual(resp.data['errors'][0]['row'], 2)


class PropertyExportTests(TestCase):
    """The /export action mirrors the import schema so a round-trip works.

    Tenant scoping is enforced via get_queryset-style logic in the action:
    regular users see only their accessible properties, staff sees all."""

    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(username='owner', password='pw12345!', is_staff=True)
        self.alice = User.objects.create_user(username='alice', password='pw12345!')
        self.prop_a = Property.objects.create(name='Hotel Alice', description='Alice resort')
        self.prop_a.users.add(self.alice)
        self.prop_b = Property.objects.create(name='Hotel Bob', description='Bob resort')
        # Bob's property has nobody attached except staff visibility.

    def test_regular_user_only_sees_their_properties(self):
        self.client.force_authenticate(user=self.alice)
        resp = self.client.get('/api/v1/properties/export/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.content.decode('utf-8')
        # Header + one data row for Alice's property; Bob's must NOT appear.
        lines = [line for line in body.split('\n') if line.strip()]
        self.assertEqual(len(lines), 2, lines)
        self.assertIn('Hotel Alice', lines[1])
        self.assertNotIn('Hotel Bob', body)

    def test_staff_sees_all_properties(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get('/api/v1/properties/export/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.content.decode('utf-8')
        self.assertIn('Hotel Alice', body)
        self.assertIn('Hotel Bob', body)

    def test_export_header_matches_import_schema(self):
        self.client.force_authenticate(user=self.staff)
        resp = self.client.get('/api/v1/properties/export/')
        header = resp.content.decode('utf-8').split('\n', 1)[0]
        # The first three columns must match what bulk_import accepts so a
        # round-trip is trivial (room_count/user_count/created_at are extra
        # context-only fields).
        for field in ('name', 'property_id', 'description'):
            self.assertIn(field, header)

    def test_unauthenticated_request_is_rejected(self):
        resp = self.client.get('/api/v1/properties/export/')
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
