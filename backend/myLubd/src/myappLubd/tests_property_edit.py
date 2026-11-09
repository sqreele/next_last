"""Property edits respect Company roles, grants and immutable identity."""
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Property, Tenant, TenantMembership


class PropertyEditTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='property-manager')
        self.company = Tenant.objects.create(name='Property edit Company')
        self.other = Tenant.objects.create(name='Foreign Company')
        self.prop = Property.objects.create(name='Editable hotel', tenant=self.company)
        self.foreign = Property.objects.create(name='Foreign hotel', tenant=self.other)
        self.member = TenantMembership.objects.create(user=self.user, tenant=self.company, role='manager')
        self.client.force_authenticate(self.user)
        self.url = reverse('myappLubd:property-detail', args=[self.prop.property_id])

    def test_manager_can_edit_name_and_description_without_changing_identity(self):
        original = self.prop.property_id
        self.assertTrue(self.client.get(self.url, secure=True).data['can_edit'])
        response = self.client.patch(self.url, {'name': 'Renamed hotel', 'description': 'Updated description'}, format='json', secure=True)
        self.assertEqual(response.status_code, 200, response.data)
        self.prop.refresh_from_db()
        self.assertEqual((self.prop.name, self.prop.description), ('Renamed hotel', 'Updated description'))
        self.assertEqual((self.prop.property_id, self.prop.tenant_id), (original, self.company.pk))

    def test_manager_cannot_edit_foreign_property(self):
        response = self.client.patch(reverse('myappLubd:property-detail', args=[self.foreign.property_id]), {'name': 'Stolen'}, format='json', secure=True)
        self.assertEqual(response.status_code, 403)
        self.foreign.refresh_from_db()
        self.assertEqual(self.foreign.name, 'Foreign hotel')

    def test_technician_has_no_edit_capability(self):
        self.member.role = 'technician'
        self.member.save()
        self.member.properties.add(self.prop)
        self.assertFalse(self.client.get(self.url, secure=True).data['can_edit'])
        response = self.client.patch(self.url, {'name': 'Denied'}, format='json', secure=True)
        self.assertEqual(response.status_code, 403)

    def test_property_admin_can_only_edit_granted_property(self):
        self.member.role = 'property_admin'
        self.member.save()
        self.assertEqual(self.client.patch(self.url, {'name': 'Denied'}, format='json', secure=True).status_code, 403)
        self.member.properties.add(self.prop)
        self.assertTrue(self.client.get(self.url, secure=True).data['can_edit'])
        self.assertEqual(self.client.patch(self.url, {'description': 'Allowed'}, format='json', secure=True).status_code, 200)

    def test_inactive_manager_cannot_edit(self):
        self.member.is_active = False
        self.member.save()
        self.assertEqual(self.client.patch(self.url, {'name': 'Denied'}, format='json', secure=True).status_code, 403)

    def test_property_id_is_read_only_and_ownership_transfer_rejected(self):
        original = self.prop.property_id
        response = self.client.patch(self.url, {'property_id': 'replacement'}, format='json', secure=True)
        self.assertEqual(response.status_code, 200)
        self.prop.refresh_from_db()
        self.assertEqual(self.prop.property_id, original)
        response = self.client.patch(self.url, {'tenant': self.other.pk}, format='json', secure=True)
        self.assertEqual(response.status_code, 400)

    def test_invalid_name_is_rejected(self):
        response = self.client.patch(self.url, {'name': ''}, format='json', secure=True)
        self.assertEqual(response.status_code, 400)
