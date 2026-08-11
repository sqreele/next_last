import os
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Inventory, Property, PushSubscription


User = get_user_model()


class NotificationViewRegressionTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(username='notification-user', password='pw12345!')
        self.other_user = User.objects.create_user(username='notification-other', password='pw12345!')
        self.client.force_authenticate(user=self.user)

    @staticmethod
    def subscription_payload(endpoint='https://push.example/subscription', suffix='current'):
        return {
            'endpoint': endpoint,
            'keys': {'p256dh': f'p256dh-{suffix}', 'auth': f'auth-{suffix}'},
        }

    @staticmethod
    def create_subscription(user, endpoint, suffix='existing', is_active=True):
        return PushSubscription.objects.create(
            user=user,
            endpoint=endpoint,
            p256dh=f'p256dh-{suffix}',
            auth=f'auth-{suffix}',
            is_active=is_active,
        )

    def test_push_subscribe_creates_endpoint_for_authenticated_user(self):
        response = self.client.post(
            '/api/v1/push/subscribe/', self.subscription_payload(), format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data['created'], True)
        subscription = PushSubscription.objects.get(endpoint='https://push.example/subscription')
        self.assertEqual(subscription.user, self.user)
        self.assertTrue(subscription.is_active)

    def test_same_user_resubscribe_updates_keys_and_reactivates(self):
        endpoint = 'https://push.example/own-inactive'
        subscription = self.create_subscription(
            self.user, endpoint, suffix='stale', is_active=False
        )

        response = self.client.post(
            '/api/v1/push/subscribe/',
            self.subscription_payload(endpoint, suffix='fresh'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['created'], False)
        subscription.refresh_from_db()
        self.assertEqual(subscription.user, self.user)
        self.assertEqual(subscription.p256dh, 'p256dh-fresh')
        self.assertEqual(subscription.auth, 'auth-fresh')
        self.assertTrue(subscription.is_active)

    def test_cross_user_subscribe_cannot_change_owner_keys_or_active_state(self):
        endpoint = 'https://push.example/foreign-inactive'
        subscription = self.create_subscription(
            self.other_user, endpoint, suffix='foreign', is_active=False
        )

        response = self.client.post(
            '/api/v1/push/subscribe/',
            self.subscription_payload(endpoint, suffix='attacker'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.content)
        self.assertEqual(
            response.data, {'error': 'Push subscription endpoint is already registered.'}
        )
        subscription.refresh_from_db()
        self.assertEqual(subscription.user, self.other_user)
        self.assertEqual(subscription.p256dh, 'p256dh-foreign')
        self.assertEqual(subscription.auth, 'auth-foreign')
        self.assertFalse(subscription.is_active)

    def test_push_unsubscribe_deactivates_own_endpoint(self):
        endpoint = 'https://push.example/own-active'
        subscription = self.create_subscription(self.user, endpoint)

        response = self.client.post(
            '/api/v1/push/unsubscribe/', {'endpoint': endpoint}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data, {'deactivated': 1})
        subscription.refresh_from_db()
        self.assertFalse(subscription.is_active)

    def test_cross_user_unsubscribe_cannot_deactivate_foreign_endpoint(self):
        endpoint = 'https://push.example/foreign-active'
        subscription = self.create_subscription(self.other_user, endpoint)

        response = self.client.post(
            '/api/v1/push/unsubscribe/', {'endpoint': endpoint}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.content)
        self.assertEqual(
            response.data, {'error': 'Push subscription endpoint is already registered.'}
        )
        subscription.refresh_from_db()
        self.assertTrue(subscription.is_active)

    def _assert_inventory_push_targets_only_property_user(self, target_user, other_user, name):
        property_obj = Property.objects.create(name=name)
        property_obj.users.add(target_user)
        target_sub = self.create_subscription(
            target_user, f'https://push.example/{name}/target'
        )
        self.create_subscription(other_user, f'https://push.example/{name}/other')
        item = Inventory.objects.create(
            name=f'{name} part',
            quantity=20,
            min_quantity=10,
            property=property_obj,
        )

        vapid = {
            'VAPID_PRIVATE_KEY': 'private-key',
            'NEXT_PUBLIC_VAPID_PUBLIC_KEY': 'public-key',
            'VAPID_CONTACT_EMAIL': 'security@example.com',
        }
        with patch.dict(os.environ, vapid), patch(
            'myappLubd.push.send_push_to_subscriptions', return_value=1
        ) as send_mock:
            item.quantity = 5
            item.save()

        self.assertEqual(send_mock.call_count, 1)
        selected_subscriptions = list(send_mock.call_args.args[0])
        self.assertEqual([sub.pk for sub in selected_subscriptions], [target_sub.pk])

    def test_property_a_delivery_excludes_property_b_subscription(self):
        self._assert_inventory_push_targets_only_property_user(
            self.user, self.other_user, 'Property A'
        )

    def test_property_b_delivery_excludes_property_a_subscription(self):
        self._assert_inventory_push_targets_only_property_user(
            self.other_user, self.user, 'Property B'
        )

    def test_overdue_notifications_preserve_empty_result_contract(self):
        response = self.client.get('/api/v1/notifications/overdue/?property_id=missing')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data, {'count': 0, 'results': []})

    def test_push_subscribe_rejects_incomplete_browser_subscription(self):
        response = self.client.post(
            '/api/v1/push/subscribe/',
            {'endpoint': 'https://push.example/subscription'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(
            response.data,
            {'error': 'endpoint and keys.{p256dh,auth} are required.'},
        )

    def test_push_public_key_returns_configuration_contract(self):
        response = self.client.get('/api/v1/push/public-key/')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(set(response.data), {'public_key', 'configured'})
        self.assertEqual(response.data['configured'], bool(response.data['public_key']))
