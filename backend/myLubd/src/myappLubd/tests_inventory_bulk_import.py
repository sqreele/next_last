"""Tests for the inventory bulk-import endpoint."""

from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import Inventory, Property


User = get_user_model()


GOOD_CSV = (
    'name,category,quantity,min_quantity,unit,unit_price\n'
    'LED bulb 9W,consumables,50,10,pcs,2.50\n'
    'AC filter,parts,12,4,pcs,8.00\n'
)


def _csv_file(text):
    buf = BytesIO(text.encode('utf-8'))
    buf.name = 'inventory.csv'
    return buf


class InventoryBulkImportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel A')
        self.prop.users.add(self.user)
        self.client.force_authenticate(user=self.user)

    def _post(self, payload, **extra):
        return self.client.post(
            f'/api/v1/inventory/bulk-import/?property_id={self.prop.id}',
            payload,
            **extra,
        )

    def test_template_endpoint_returns_csv(self):
        resp = self.client.get('/api/v1/inventory/import-template/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.content.decode('utf-8')
        self.assertIn('name', body.split('\n', 1)[0])
        self.assertIn('quantity', body.split('\n', 1)[0])

    def test_happy_path_creates_items(self):
        resp = self._post(
            {'file': _csv_file(GOOD_CSV)},
            format='multipart',
        )
        self.assertIn(resp.status_code, (status.HTTP_201_CREATED, status.HTTP_207_MULTI_STATUS), resp.content)
        self.assertEqual(resp.data['created_count'], 2)
        self.assertEqual(resp.data['error_count'], 0)
        self.assertEqual(Inventory.objects.count(), 2)
        items = list(Inventory.objects.order_by('name'))
        self.assertEqual(items[0].name, 'AC filter')
        self.assertEqual(items[0].property, self.prop)
        self.assertEqual(items[0].quantity, 12)

    def test_partial_failure_reports_per_row(self):
        bad_csv = (
            'name,category,quantity,min_quantity,unit\n'
            'Good item,parts,10,2,pcs\n'
            ',parts,5,1,pcs\n'  # missing name
            'Bad qty,parts,not-a-number,1,pcs\n'
            'Negative,parts,-3,0,pcs\n'
        )
        resp = self._post(
            {'file': _csv_file(bad_csv)},
            format='multipart',
        )
        self.assertEqual(resp.status_code, status.HTTP_207_MULTI_STATUS, resp.content)
        self.assertEqual(resp.data['created_count'], 1)
        self.assertEqual(resp.data['error_count'], 3)
        self.assertEqual(Inventory.objects.count(), 1)
        row_numbers = {err['row'] for err in resp.data['errors']}
        self.assertEqual(row_numbers, {3, 4, 5})

    def test_csv_via_json_body(self):
        resp = self._post(
            {'csv': GOOD_CSV},
            format='json',
        )
        self.assertIn(resp.status_code, (status.HTTP_201_CREATED, status.HTTP_207_MULTI_STATUS), resp.content)
        self.assertEqual(resp.data['created_count'], 2)

    def test_missing_payload_returns_400(self):
        resp = self._post({}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Inventory.objects.exists())

    def test_user_without_property_access_cannot_import(self):
        outsider = User.objects.create_user(username='nobody', password='pw12345!')
        self.client.force_authenticate(user=outsider)
        resp = self._post(
            {'file': _csv_file(GOOD_CSV)},
            format='multipart',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Inventory.objects.exists())

    def test_cross_tenant_property_id_in_row_is_rejected(self):
        other = Property.objects.create(name='Other')
        bad = (
            'name,category,quantity,min_quantity,unit,property_id\n'
            f'Cross-tenant,parts,1,0,pcs,{other.id}\n'
        )
        resp = self.client.post(
            '/api/v1/inventory/bulk-import/',  # no default property
            {'file': _csv_file(bad)},
            format='multipart',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Inventory.objects.exists())
