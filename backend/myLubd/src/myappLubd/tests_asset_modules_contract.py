"""Canonical Property, role, identity, and stock-safety contracts for asset modules."""

from concurrent.futures import ThreadPoolExecutor

from django.contrib.auth import get_user_model
from django.db import close_old_connections
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import (
    Area,
    Inventory,
    InventoryUsage,
    Job,
    Machine,
    PreventiveMaintenance,
    Property,
    Tenant,
    TenantMembership,
    UtilityConsumption,
)


User = get_user_model()


def grant(user, tenant, role, *properties):
    membership = TenantMembership.objects.create(user=user, tenant=tenant, role=role)
    membership.properties.add(*properties)
    return membership


def results(response):
    return response.data.get('results', response.data) if isinstance(response.data, dict) else response.data


class MachineContractTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Machine tenant')
        self.other_tenant = Tenant.objects.create(name='Other machine tenant')
        self.prop = Property.objects.create(name='Machine hotel', tenant=self.tenant)
        self.other_prop = Property.objects.create(name='Other machine hotel', tenant=self.other_tenant)
        self.tech = User.objects.create_user(username='machine-tech')
        self.viewer = User.objects.create_user(username='machine-viewer')
        self.outsider = User.objects.create_user(username='machine-outsider')
        grant(self.tech, self.tenant, 'technician', self.prop)
        grant(self.viewer, self.tenant, 'viewer', self.prop)
        grant(self.outsider, self.other_tenant, 'technician', self.other_prop)
        self.machine = Machine.objects.create(name='Pump A', property=self.prop)
        self.other_machine = Machine.objects.create(name='Pump B', property=self.other_prop)

    def login(self, user):
        self.client.force_authenticate(user)

    def test_property_scoped_list_uses_external_identity(self):
        self.login(self.tech)
        response = self.client.get('/api/v1/machines/', {'property_id': self.prop.property_id})
        self.assertEqual([row['machine_id'] for row in results(response)], [self.machine.machine_id])

    def test_unauthorized_detail_is_hidden(self):
        self.login(self.tech)
        response = self.client.get(f'/api/v1/machines/{self.other_machine.machine_id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_authorized_create_resolves_external_property_id(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/machines/', {
            'name': 'AHU A', 'property_id': self.prop.property_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Machine.objects.filter(name='AHU A', property=self.prop).exists())

    def test_unauthorized_create_is_rejected(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/machines/', {
            'name': 'Forged', 'property_id': self.other_prop.property_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Machine.objects.filter(name='Forged').exists())

    def test_cross_property_update_is_rejected(self):
        self.login(self.tech)
        response = self.client.patch(f'/api/v1/machines/{self.machine.machine_id}/', {
            'property_id': self.other_prop.property_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.machine.refresh_from_db()
        self.assertEqual(self.machine.property, self.prop)

    def test_viewer_reads_but_cannot_mutate(self):
        self.login(self.viewer)
        self.assertEqual(self.client.get('/api/v1/machines/').status_code, status.HTTP_200_OK)
        response = self.client.post(
            f'/api/v1/machines/{self.machine.machine_id}/change_status/',
            {'status': 'inactive'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_machine_pm_association_rejects_cross_property_pm(self):
        pm = PreventiveMaintenance.objects.create(
            pmtitle='Other PM', scheduled_date=timezone.now(), frequency='monthly',
            created_by=self.outsider,
        )
        pm.machines.add(self.other_machine)
        self.login(self.tech)
        response = self.client.post(
            f'/api/v1/machines/{self.machine.machine_id}/set_preventive_maintenances/',
            {'preventive_maintenance_ids': [pm.pm_id]}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertFalse(self.machine.preventive_maintenances.exists())

    def test_numeric_property_filter_is_not_an_external_id_fallback(self):
        self.login(self.tech)
        response = self.client.get('/api/v1/machines/', {'property_id': str(self.prop.pk)})
        self.assertEqual(results(response), [])


class AreaContractTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Area contract tenant')
        self.other_tenant = Tenant.objects.create(name='Other area contract tenant')
        self.prop = Property.objects.create(name='Area hotel', tenant=self.tenant)
        self.second = Property.objects.create(name='Area hotel two', tenant=self.tenant)
        self.other = Property.objects.create(name='Other area hotel', tenant=self.other_tenant)
        self.tech = User.objects.create_user(username='area-tech')
        self.viewer = User.objects.create_user(username='area-viewer')
        grant(self.tech, self.tenant, 'technician', self.prop, self.second)
        grant(self.viewer, self.tenant, 'viewer', self.prop)
        self.area = Area.objects.create(property=self.prop, name='Lobby')
        self.second_area = Area.objects.create(property=self.second, name='Roof')

    def login(self, user):
        self.client.force_authenticate(user)

    def test_property_scoped_list(self):
        self.login(self.tech)
        response = self.client.get('/api/v1/areas/', {'property_id': self.prop.property_id})
        self.assertEqual([row['name'] for row in results(response)], ['Lobby'])

    def test_create_uses_active_external_property(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/areas/', {
            'name': 'Plant room', 'property_id': self.prop.property_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['property_uuid'], self.prop.property_id)

    def test_cross_property_create_is_rejected(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/areas/', {
            'name': 'Forged', 'property_id': self.other.property_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_stays_in_operable_scope(self):
        self.login(self.tech)
        response = self.client.patch(f'/api/v1/areas/{self.area.pk}/', {
            'name': 'Main lobby', 'property_id': self.prop.property_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.area.refresh_from_db()
        self.assertEqual(self.area.name, 'Main lobby')

    def test_unauthorized_delete_is_hidden(self):
        outsider = User.objects.create_user(username='area-outsider')
        grant(outsider, self.other_tenant, 'technician', self.other)
        self.login(outsider)
        self.assertEqual(
            self.client.delete(f'/api/v1/areas/{self.area.pk}/').status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_job_area_property_mismatch_is_rejected(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/jobs/', {
            'description': 'Mismatch', 'remarks': '', 'priority': 'medium',
            'status': 'pending', 'property_id': self.second.property_id,
            'area_id': self.area.pk, 'topic_data': {'title': 'Electrical'},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_viewer_is_read_only(self):
        self.login(self.viewer)
        self.assertEqual(self.client.get('/api/v1/areas/').status_code, status.HTTP_200_OK)
        response = self.client.patch(f'/api/v1/areas/{self.area.pk}/', {'name': 'Nope'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class InventoryContractTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Inventory contract tenant')
        self.other_tenant = Tenant.objects.create(name='Other inventory tenant')
        self.prop = Property.objects.create(name='Inventory hotel', tenant=self.tenant)
        self.other = Property.objects.create(name='Other inventory hotel', tenant=self.other_tenant)
        self.tech = User.objects.create_user(username='inventory-tech')
        self.viewer = User.objects.create_user(username='inventory-viewer')
        self.outsider = User.objects.create_user(username='inventory-outsider')
        grant(self.tech, self.tenant, 'technician', self.prop)
        grant(self.viewer, self.tenant, 'viewer', self.prop)
        grant(self.outsider, self.other_tenant, 'technician', self.other)
        self.item = Inventory.objects.create(name='Filter', quantity=10, min_quantity=2, property=self.prop)
        self.other_item = Inventory.objects.create(name='Other filter', quantity=10, property=self.other)
        self.job = Job.objects.create(
            user=self.tech, property=self.prop, description='Replace filter', remarks='',
            status='pending', priority='medium',
        )
        self.other_job = Job.objects.create(
            user=self.outsider, property=self.other, description='Other job', remarks='',
            status='pending', priority='medium',
        )

    def login(self, user):
        self.client.force_authenticate(user)

    def test_property_scoped_list(self):
        self.login(self.tech)
        response = self.client.get('/api/v1/inventory/', {'property_id': self.prop.property_id})
        self.assertEqual([row['item_id'] for row in results(response)], [self.item.item_id])

    def test_unauthorized_item_is_hidden(self):
        self.login(self.tech)
        self.assertEqual(
            self.client.get(f'/api/v1/inventory/{self.other_item.item_id}/').status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_create_resolves_external_property_and_creator(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/inventory/', {
            'name': 'Lamp', 'quantity': 3, 'min_quantity': 1,
            'property_id': self.prop.property_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        created = Inventory.objects.get(name='Lamp')
        self.assertEqual((created.property, created.created_by), (self.prop, self.tech))

    def test_restock_returns_authoritative_quantity_and_timestamp(self):
        self.login(self.tech)
        response = self.client.post(f'/api/v1/inventory/{self.item.item_id}/restock/', {'quantity': 4}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['quantity'], 14)
        self.assertIsNotNone(response.data['last_restocked'])

    def test_consume_updates_stock_and_creates_usage(self):
        self.login(self.tech)
        response = self.client.post(f'/api/v1/inventory/{self.item.item_id}/consume/', {
            'quantity': 3, 'job_id': self.job.job_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.item.refresh_from_db()
        usage = InventoryUsage.objects.get(inventory=self.item)
        self.assertEqual((self.item.quantity, usage.property, usage.job), (7, self.prop, self.job))

    def test_insufficient_quantity_rolls_back(self):
        self.login(self.tech)
        response = self.client.post(f'/api/v1/inventory/{self.item.item_id}/consume/', {'quantity': 11}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.item.refresh_from_db()
        self.assertEqual(self.item.quantity, 10)
        self.assertFalse(InventoryUsage.objects.exists())

    def test_usage_history_is_scoped_to_item(self):
        InventoryUsage.objects.create(inventory=self.item, property=self.prop, quantity=1, consumed_by=self.tech)
        self.login(self.tech)
        response = self.client.get(f'/api/v1/inventory/{self.item.item_id}/usage/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(results(response)[0]['property_id'], self.prop.property_id)

    def test_viewer_cannot_restock_or_consume(self):
        self.login(self.viewer)
        restock = self.client.post(f'/api/v1/inventory/{self.item.item_id}/restock/', {'quantity': 1}, format='json')
        consume = self.client.post(f'/api/v1/inventory/{self.item.item_id}/consume/', {'quantity': 1}, format='json')
        self.assertEqual((restock.status_code, consume.status_code), (403, 403))

    def test_cross_property_job_is_rejected(self):
        self.login(self.tech)
        response = self.client.post(f'/api/v1/inventory/{self.item.item_id}/consume/', {
            'quantity': 1, 'job_id': self.other_job.job_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_property_is_required_on_create(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/inventory/', {'name': 'Ownerless', 'quantity': 1}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class InventoryConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        tenant = Tenant.objects.create(name='Concurrent inventory tenant')
        self.prop = Property.objects.create(name='Concurrent hotel', tenant=tenant)
        self.user = User.objects.create_user(username='concurrent-tech')
        grant(self.user, tenant, 'technician', self.prop)

    def post_in_thread(self, url, quantity):
        close_old_connections()
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.post(url, {'quantity': quantity}, format='json')
        close_old_connections()
        return response.status_code

    def test_concurrent_restock_preserves_both_updates(self):
        item = Inventory.objects.create(name='Concurrent restock', quantity=10, property=self.prop)
        url = f'/api/v1/inventory/{item.item_id}/restock/'
        with ThreadPoolExecutor(max_workers=2) as pool:
            codes = list(pool.map(lambda _: self.post_in_thread(url, 2), range(2)))
        item.refresh_from_db()
        self.assertEqual(codes, [200, 200])
        self.assertEqual(item.quantity, 14)

    def test_concurrent_consume_cannot_overspend_stock(self):
        item = Inventory.objects.create(name='Concurrent consume', quantity=5, property=self.prop)
        url = f'/api/v1/inventory/{item.item_id}/consume/'
        with ThreadPoolExecutor(max_workers=2) as pool:
            codes = list(pool.map(lambda _: self.post_in_thread(url, 3), range(2)))
        item.refresh_from_db()
        self.assertEqual(sorted(codes), [201, 400])
        self.assertEqual(item.quantity, 2)
        self.assertEqual(InventoryUsage.objects.filter(inventory=item).count(), 1)


class UtilityContractTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Utility contract tenant', timezone='Asia/Bangkok')
        self.other_tenant = Tenant.objects.create(name='Other utility tenant')
        self.prop = Property.objects.create(name='Utility hotel', tenant=self.tenant)
        self.other = Property.objects.create(name='Other utility hotel', tenant=self.other_tenant)
        self.tech = User.objects.create_user(username='utility-tech')
        self.viewer = User.objects.create_user(username='utility-viewer')
        grant(self.tech, self.tenant, 'technician', self.prop)
        grant(self.viewer, self.tenant, 'viewer', self.prop)
        self.row = UtilityConsumption.objects.create(property=self.prop, month=1, year=2026, totalkwh=100)
        self.other_row = UtilityConsumption.objects.create(property=self.other, month=1, year=2026, totalkwh=999)

    def login(self, user):
        self.client.force_authenticate(user)

    def test_property_scoped_list(self):
        self.login(self.tech)
        response = self.client.get('/api/v1/utility-consumption/', {'property_id': self.prop.property_id})
        self.assertEqual([row['id'] for row in results(response)], [self.row.pk])

    def test_authorized_create_uses_external_property(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/utility-consumption/', {
            'property_id': self.prop.property_id, 'month': 2, 'year': 2026,
            'totalkwh': 120, 'water': 8,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['property_id'], self.prop.property_id)

    def test_cross_property_create_is_rejected(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/utility-consumption/', {
            'property_id': self.other.property_id, 'month': 2, 'year': 2026,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthorized_update_and_delete_are_hidden(self):
        self.login(self.tech)
        update = self.client.patch(f'/api/v1/utility-consumption/{self.other_row.pk}/', {'water': 1}, format='json')
        delete = self.client.delete(f'/api/v1/utility-consumption/{self.other_row.pk}/')
        self.assertEqual((update.status_code, delete.status_code), (404, 404))

    def test_created_by_is_authoritative(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/utility-consumption/', {
            'property_id': self.prop.property_id, 'month': 3, 'year': 2026,
            'created_by': self.viewer.pk,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(UtilityConsumption.objects.get(pk=response.data['id']).created_by, self.tech)

    def test_negative_measurement_is_rejected(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/utility-consumption/', {
            'property_id': self.prop.property_id, 'month': 4, 'year': 2026, 'water': -1,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_property_month_year_is_rejected(self):
        self.login(self.tech)
        response = self.client.post('/api/v1/utility-consumption/', {
            'property_id': self.prop.property_id, 'month': 1, 'year': 2026,
            'totalkwh': 101,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_month_and_year_round_trip_without_timezone_shift(self):
        self.login(self.tech)
        response = self.client.get(f'/api/v1/utility-consumption/{self.row.pk}/')
        self.assertEqual((response.data['month'], response.data['year']), (1, 2026))

    def test_viewer_reads_but_cannot_mutate(self):
        self.login(self.viewer)
        self.assertEqual(self.client.get('/api/v1/utility-consumption/').status_code, 200)
        response = self.client.patch(f'/api/v1/utility-consumption/{self.row.pk}/', {'water': 2}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
