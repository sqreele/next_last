from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.db import close_old_connections
from django.test import TransactionTestCase
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from .models import Inventory, Property, User


class InventoryRestockConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.user = User.objects.create_user(
            username='concurrent-stock-user',
            password='pw12345!',
        )
        self.property = Property.objects.create(name='Concurrent Stock Property')
        self.property.users.add(self.user)
        self.inventory = Inventory.objects.create(
            name='Concurrent part',
            quantity=10,
            min_quantity=1,
            property=self.property,
            created_by=self.user,
        )

    def _restock(self, quantity, ready):
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(self.user)
            ready.wait(timeout=5)
            response = client.post(
                f'/api/v1/inventory/{self.inventory.item_id}/restock/',
                {'quantity': quantity},
                format='json',
            )
            return response.status_code, response.data
        finally:
            close_old_connections()

    def test_concurrent_same_item_restock_preserves_both_increments(self):
        ready = Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(self._restock, quantity, ready)
                for quantity in (5, 7)
            ]
            responses = [future.result(timeout=10) for future in futures]

        self.inventory.refresh_from_db()

        self.assertEqual([status_code for status_code, _ in responses], [200, 200])
        self.assertEqual(self.inventory.quantity, 22)
        self.assertIsNotNone(self.inventory.last_restocked)

        response_quantities = sorted(data['quantity'] for _, data in responses)
        self.assertIn(response_quantities[0], (15, 17))
        self.assertEqual(response_quantities[1], self.inventory.quantity)

        final_response = next(
            data for _, data in responses if data['quantity'] == self.inventory.quantity
        )
        self.assertEqual(
            parse_datetime(final_response['last_restocked']),
            self.inventory.last_restocked,
        )
