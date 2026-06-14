from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import (
    Inventory,
    InventoryUsage,
    Job,
    Machine,
    MaintenanceChecklist,
    PreventiveMaintenance,
    Property,
    Room,
)


User = get_user_model()


class MaintenanceDepthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='engineer', password='pw12345!')
        self.prop = Property.objects.create(name='Hotel Depth')
        self.prop.users.add(self.user)
        self.room = Room.objects.create(name='D-101', room_type='Standard')
        self.room.properties.add(self.prop)
        self.job = Job.objects.create(
            user=self.user,
            description='Replace lamp driver',
            remarks='',
            status='pending',
            priority='medium',
        )
        self.job.rooms.set([self.room])
        self.inventory = Inventory.objects.create(
            name='LED driver',
            category='parts',
            quantity=5,
            min_quantity=1,
            unit='pcs',
            unit_price='120.00',
            property=self.prop,
            created_by=self.user,
        )
        self.machine = Machine.objects.create(
            name='Fan coil unit',
            category='HVAC',
            property=self.prop,
            warranty_start_date=timezone.now().date() - timedelta(days=10),
            warranty_end_date=timezone.now().date() + timedelta(days=30),
            expected_replacement_date=timezone.now().date() + timedelta(days=365),
        )

    def _login(self):
        self.client.force_authenticate(user=self.user)

    def test_machine_lifecycle_state_tracks_warranty(self):
        self.assertTrue(self.machine.is_under_warranty)
        self.assertEqual(self.machine.lifecycle_state, 'under_warranty')

        self.machine.expected_replacement_date = timezone.now().date() - timedelta(days=1)
        self.machine.save(update_fields=['expected_replacement_date'])
        self.assertEqual(self.machine.lifecycle_state, 'replacement_due')

    def test_inventory_consume_creates_usage_record_and_decrements_stock(self):
        self._login()
        resp = self.client.post(
            f'/api/v1/inventory/{self.inventory.item_id}/consume/',
            {
                'quantity': 2,
                'job_id': self.job.job_id,
                'notes': 'Used in guest room repair',
            },
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 3)
        usage = InventoryUsage.objects.get(inventory=self.inventory)
        self.assertEqual(usage.job, self.job)
        self.assertEqual(usage.quantity, 2)
        self.assertEqual(str(usage.total_cost), '240.00')

    def test_pm_complete_records_checklist_and_consumes_inventory(self):
        self._login()
        pm = PreventiveMaintenance.objects.create(
            pmtitle='Monthly FCU cleaning',
            scheduled_date=timezone.now(),
            frequency='monthly',
            status='pending',
            created_by=self.user,
            assigned_to=self.user,
        )
        pm.machines.add(self.machine)

        resp = self.client.post(
            f'/api/v1/preventive-maintenance/{pm.pm_id}/complete/',
            {
                'checklist_items': [
                    {'item': 'Clean filter', 'is_completed': True},
                    {'item': 'Check vibration', 'is_completed': True},
                ],
                'inventory_usage': [
                    {'item_id': self.inventory.item_id, 'quantity': 1, 'notes': 'Replacement driver'}
                ],
                'notes': 'Completed during morning shift.',
            },
            format='json',
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        pm.refresh_from_db()
        self.inventory.refresh_from_db()
        self.machine.refresh_from_db()

        self.assertIsNotNone(pm.completed_date)
        self.assertEqual(pm.status, 'completed')
        self.assertEqual(self.inventory.quantity, 4)
        self.assertEqual(MaintenanceChecklist.objects.filter(maintenance=pm, is_completed=True).count(), 2)
        self.assertTrue(InventoryUsage.objects.filter(preventive_maintenance=pm, quantity=1).exists())
        self.assertIsNotNone(self.machine.last_maintenance_date)

    def test_inventory_consume_rejects_insufficient_stock(self):
        self._login()
        resp = self.client.post(
            f'/api/v1/inventory/{self.inventory.item_id}/consume/',
            {'quantity': 99, 'job_id': self.job.job_id},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, 5)
