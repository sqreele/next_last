"""Role and tenant boundaries for inventory stock management and consumption."""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Inventory, Property, Tenant, TenantMembership


User = get_user_model()


class InventoryStockAuthorizationTests(APITestCase):
    manage_roles = ('owner', 'admin', 'manager')
    consume_roles = ('owner', 'admin', 'manager', 'supervisor', 'technician')
    denied_roles = ('supervisor', 'technician', 'viewer', 'billing')

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Inventory stock authorization tenant')
        self.property = Property.objects.create(name='Inventory stock property', tenant=self.tenant)
        self.other_tenant = Tenant.objects.create(name='Other inventory stock tenant')
        self.other_property = Property.objects.create(name='Other inventory stock property', tenant=self.other_tenant)
        self.users = {}
        for role in (*self.manage_roles, *self.denied_roles):
            user = User.objects.create_user(username=f'inventory-stock-{role}', password='pw12345!')
            membership = TenantMembership.objects.create(user=user, tenant=self.tenant, role=role)
            if role not in self.manage_roles:
                membership.properties.add(self.property)
            self.users[role] = user
        self.inactive = User.objects.create_user(username='inventory-stock-inactive', password='pw12345!')
        inactive = TenantMembership.objects.create(user=self.inactive, tenant=self.tenant, role='manager', is_active=False)
        inactive.properties.add(self.property)
        self.superuser = User.objects.create_superuser('inventory-stock-root', 'inventory-root@example.com', 'pw12345!')
        self.item = self._item('Managed stock', self.property, 10)
        self.other_item = self._item('Foreign stock', self.other_property, 10)

    def _item(self, name, property_obj, quantity):
        return Inventory.objects.create(
            name=name, property=property_obj, quantity=quantity, min_quantity=1,
        )

    def _create_payload(self, name='Created stock'):
        return {
            'name': name, 'property_id': self.property.property_id,
            'quantity': 3, 'min_quantity': 1,
        }

    def _detail(self, item=None):
        item = item or self.item
        return f'/api/v1/inventory/{item.item_id}/'

    def test_manage_stock_create_restock_patch_and_delete_matrix(self):
        for role, user in self.users.items():
            with self.subTest(operation='frontend_capability_contract', role=role):
                self.client.force_authenticate(user)
                response = self.client.get(
                    '/api/v1/inventory/capabilities/',
                    {'property_id': self.property.property_id},
                    secure=True,
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
                self.assertEqual(response.data['can_manage_inventory_stock'], role in self.manage_roles)
                self.assertEqual(response.data['can_consume_inventory'], role in self.consume_roles)

            with self.subTest(operation='create', role=role):
                self.client.force_authenticate(user)
                response = self.client.post('/api/v1/inventory/', self._create_payload(f'{role} created'), format='json', secure=True)
                self.assertEqual(response.status_code, status.HTTP_201_CREATED if role in self.manage_roles else status.HTTP_403_FORBIDDEN, response.content)

            with self.subTest(operation='restock', role=role):
                self.client.force_authenticate(user)
                response = self.client.post(f'{self._detail() }restock/', {'quantity': 1}, format='json', secure=True)
                self.assertEqual(response.status_code, status.HTTP_200_OK if role in self.manage_roles else status.HTTP_403_FORBIDDEN, response.content)

            with self.subTest(operation='quantity_patch', role=role):
                self.client.force_authenticate(user)
                response = self.client.patch(self._detail(), {'quantity': 99, 'max_quantity': 100}, format='json', secure=True)
                self.assertEqual(response.status_code, status.HTTP_200_OK if role in self.manage_roles else status.HTTP_403_FORBIDDEN, response.content)

            disposable = self._item(f'{role} delete', self.property, 1)
            with self.subTest(operation='delete', role=role):
                self.client.force_authenticate(user)
                response = self.client.delete(self._detail(disposable), secure=True)
                self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT if role in self.manage_roles else status.HTTP_403_FORBIDDEN, response.content)

    def test_consume_matrix_and_positive_quantity_guards(self):
        for role, user in self.users.items():
            item = self._item(f'{role} consume', self.property, 10)
            self.client.force_authenticate(user)
            response = self.client.post(f'{self._detail(item)}consume/', {'quantity': 2}, format='json', secure=True)
            self.assertEqual(response.status_code, status.HTTP_201_CREATED if role in self.consume_roles else status.HTTP_403_FORBIDDEN, response.content)
            item.refresh_from_db()
            self.assertEqual(item.quantity, 8 if role in self.consume_roles else 10)

        self.client.force_authenticate(self.users['technician'])
        for value in (0, -2, 11):
            with self.subTest(quantity=value):
                response = self.client.post(f'{self._detail()}consume/', {'quantity': value}, format='json', secure=True)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 10)
        alternate = self.client.post(f'{self._detail()}use/', {'quantity': -2}, format='json', secure=True)
        self.assertEqual(alternate.status_code, status.HTTP_400_BAD_REQUEST)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 10)

    def test_cross_tenant_inactive_unauthenticated_and_superuser(self):
        self.client.force_authenticate(self.users['manager'])
        self.assertEqual(self.client.post(
            f'{self._detail(self.other_item)}restock/', {'quantity': 1}, format='json', secure=True,
        ).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post(
            f'{self._detail(self.other_item)}consume/', {'quantity': 1}, format='json', secure=True,
        ).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post('/api/v1/inventory/', {
            **self._create_payload('forged'), 'property_id': self.other_property.property_id,
        }, format='json', secure=True).status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(self.inactive)
        self.assertEqual(self.client.post(f'{self._detail()}restock/', {'quantity': 1}, format='json', secure=True).status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.post(f'{self._detail()}restock/', {'quantity': 1}, format='json', secure=True).status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.superuser)
        self.assertEqual(self.client.post(f'{self._detail()}restock/', {'quantity': 1}, format='json', secure=True).status_code, status.HTTP_200_OK)
