"""Security and tenant-boundary tests for LINE group pairing."""

import base64
import hashlib
import hmac
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import close_old_connections
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import LineGroupPairing, Property, Tenant, TenantMembership
from .notifications.line_webhook import (
    complete_group_pairing,
    generate_pairing_code,
    verify_line_signature,
)


User = get_user_model()
CHANNEL_SECRET = 'line-webhook-test-secret'


def signature_for(raw_body):
    return base64.b64encode(
        hmac.new(CHANNEL_SECRET.encode(), raw_body, hashlib.sha256).digest()
    ).decode()


@override_settings(LINE_CHANNEL_SECRET=CHANNEL_SECRET, LINE_PAIRING_EXPIRY_MINUTES=15)
class LineGroupPairingTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Siam Tenant')
        self.other_tenant = Tenant.objects.create(name='Chinatown Tenant')
        self.property = Property.objects.create(name='Lub d Bangkok Siam', tenant=self.tenant)
        self.other_property = Property.objects.create(
            name='Lub d Bangkok Chinatown', tenant=self.other_tenant
        )
        self.users = {}
        for role in ('owner', 'admin', 'manager', 'technician', 'viewer', 'billing'):
            user = User.objects.create_user(username=f'line-{role}')
            membership = TenantMembership.objects.create(
                user=user, tenant=self.tenant, role=role
            )
            if role in {'technician', 'viewer', 'billing'}:
                membership.properties.add(self.property)
            self.users[role] = user
        self.inactive_manager = User.objects.create_user(username='inactive-line-manager')
        TenantMembership.objects.create(
            user=self.inactive_manager,
            tenant=self.tenant,
            role='manager',
            is_active=False,
        )
        self.foreign_manager = User.objects.create_user(username='foreign-line-manager')
        TenantMembership.objects.create(
            user=self.foreign_manager, tenant=self.other_tenant, role='manager'
        )

    def pairing_url(self, property_obj=None):
        prop = property_obj or self.property
        return f'/api/v1/properties/{prop.property_id}/line/pairing/'

    def issue_pairing(self, role='manager'):
        self.client.force_authenticate(self.users[role])
        response = self.client.post(self.pairing_url(), {}, format='json', secure=True)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        return response

    def webhook_body(self, *, command, group_id='Cgroup-A', source_type='group'):
        source = {'type': source_type}
        if source_type == 'group':
            source['groupId'] = group_id
        elif source_type == 'room':
            source['roomId'] = group_id
        else:
            source['userId'] = group_id
        return json.dumps({
            'destination': 'bot-destination',
            'events': [{
                'type': 'message',
                'webhookEventId': 'event-1',
                'source': source,
                'message': {'id': 'message-1', 'type': 'text', 'text': command},
            }],
        }, separators=(',', ':')).encode()

    def post_webhook(self, raw_body, signature=None):
        headers = {}
        if signature is not None:
            headers['HTTP_X_LINE_SIGNATURE'] = signature
        return self.client.post(
            '/api/v1/integrations/line/webhook/',
            data=raw_body,
            content_type='application/json',
            secure=True,
            **headers,
        )

    def test_valid_signature_is_accepted_and_raw_body_is_exact(self):
        raw = b'{ "events" : [] }\n'
        self.assertTrue(verify_line_signature(raw, signature_for(raw)))
        response = self.post_webhook(raw, signature_for(raw))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_changed_raw_body_invalidates_signature(self):
        raw = b'{"events":[]}'
        changed = raw + b'\n'
        response = self.post_webhook(changed, signature_for(raw))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_and_missing_signatures_are_rejected(self):
        raw = b'{"events":[]}'
        for supplied in ('invalid', '%%%not-base64%%%', '', None):
            with self.subTest(signature=supplied):
                response = self.post_webhook(raw, supplied)
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_body_and_unexpected_event_shapes_fail_safely(self):
        empty = b''
        response = self.post_webhook(empty, signature_for(empty))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        for payload in ({'events': {}}, {'events': [None, {}, {'type': 'follow'}]}):
            with self.subTest(payload=payload):
                raw = json.dumps(payload).encode()
                response = self.post_webhook(raw, signature_for(raw))
                expected = (
                    status.HTTP_400_BAD_REQUEST
                    if isinstance(payload['events'], dict)
                    else status.HTTP_200_OK
                )
                self.assertEqual(response.status_code, expected)
                self.property.refresh_from_db()
                self.assertFalse(self.property.line_destination_id)

    @patch('myappLubd.line_integration.parse_verified_payload')
    def test_payload_is_not_processed_before_signature_verification(self, parse_payload):
        response = self.post_webhook(b'not-json', 'invalid')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        parse_payload.assert_not_called()

    def test_malformed_verified_json_is_safe_bad_request(self):
        raw = b'not-json'
        response = self.post_webhook(raw, signature_for(raw))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_admin_manager_can_create_pairing(self):
        for role in ('owner', 'admin', 'manager'):
            with self.subTest(role=role):
                response = self.issue_pairing(role)
                self.assertIn('pairing_command', response.data)
                self.client.post(
                    f'/api/v1/properties/{self.property.property_id}/line/pairing/revoke/',
                    {}, format='json', secure=True,
                )

    def test_technician_viewer_and_billing_cannot_create_pairing(self):
        for role in ('technician', 'viewer', 'billing'):
            with self.subTest(role=role):
                self.client.force_authenticate(self.users[role])
                response = self.client.post(self.pairing_url(), {}, format='json', secure=True)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(LineGroupPairing.objects.exists())

    def test_inactive_manager_cannot_manage_line_integration(self):
        self.client.force_authenticate(self.inactive_manager)
        for method, path in (
            ('post', self.pairing_url()),
            ('post', f'/api/v1/properties/{self.property.property_id}/line/pairing/revoke/'),
            ('post', f'/api/v1/properties/{self.property.property_id}/line/disconnect/'),
            ('get', f'/api/v1/properties/{self.property.property_id}/line/status/'),
        ):
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path, {}, format='json', secure=True)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cross_tenant_user_cannot_create_pairing_and_no_fallback_occurs(self):
        self.client.force_authenticate(self.foreign_manager)
        for path in (
            self.pairing_url(),
            f'/api/v1/properties/{self.property.property_id}/line/pairing/revoke/',
            f'/api/v1/properties/{self.property.property_id}/line/disconnect/',
        ):
            with self.subTest(path=path):
                response = self.client.post(path, {}, format='json', secure=True)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(LineGroupPairing.objects.exists())

    def test_pairing_secret_is_hash_only_at_rest_and_response_is_safe(self):
        response = self.issue_pairing()
        code = response.data['pairing_code']
        pairing = LineGroupPairing.objects.get()
        self.assertNotEqual(pairing.token_hash, code)
        self.assertEqual(pairing.token_hash, LineGroupPairing.hash_token(code))
        self.assertNotIn(code, str(pairing.__dict__))
        serialized = json.dumps(response.data, default=str)
        self.assertNotIn(pairing.token_hash, serialized)
        self.assertNotIn(CHANNEL_SECRET, serialized)
        self.assertNotIn('groupId', serialized)

    def test_new_code_revokes_previous_unused_code(self):
        first = self.issue_pairing().data['pairing_code']
        second = self.issue_pairing().data['pairing_code']
        self.assertNotEqual(first, second)
        rows = list(LineGroupPairing.objects.order_by('created_at'))
        self.assertIsNotNone(rows[0].revoked_at)
        self.assertIsNone(rows[1].revoked_at)

    def test_expired_and_revoked_pairings_are_rejected(self):
        for state_name in ('expired', 'revoked'):
            with self.subTest(state=state_name):
                response = self.issue_pairing()
                pairing = LineGroupPairing.objects.latest('created_at')
                if state_name == 'expired':
                    pairing.expires_at = timezone.now() - timedelta(seconds=1)
                    pairing.save(update_fields=['expires_at'])
                else:
                    pairing.revoked_at = timezone.now()
                    pairing.save(update_fields=['revoked_at'])
                result = complete_group_pairing(
                    token=response.data['pairing_code'], group_id=f'C-{state_name}'
                )
                self.assertEqual(result.outcome, state_name)
                self.property.refresh_from_db()
                self.assertEqual(self.property.line_destination_id, '')

    def test_only_exact_group_text_command_can_bind(self):
        invalid_events = (
            ('user', 'STAYMAINT LINK {code}'),
            ('room', 'STAYMAINT LINK {code}'),
            ('group', 'staymaint link {code}'),
            ('group', 'STAYMAINT LINK {code} '),
            ('group', 'prefix STAYMAINT LINK {code}'),
        )
        for source_type, template in invalid_events:
            with self.subTest(source_type=source_type, template=template):
                issued = self.issue_pairing()
                code = issued.data['pairing_code']
                raw = self.webhook_body(
                    command=template.format(code=code), source_type=source_type
                )
                response = self.post_webhook(raw, signature_for(raw))
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.property.refresh_from_db()
                self.assertEqual(self.property.line_destination_id, '')

    def test_verified_group_command_binds_exact_property_and_enables_notifications(self):
        issued = self.issue_pairing()
        raw = self.webhook_body(command=issued.data['pairing_command'], group_id='C-SIAM-1234')
        response = self.post_webhook(raw, signature_for(raw))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'ok': True})
        self.property.refresh_from_db()
        self.other_property.refresh_from_db()
        self.assertEqual(self.property.line_destination_id, 'C-SIAM-1234')
        self.assertTrue(self.property.line_notifications_enabled)
        self.assertEqual(self.other_property.line_destination_id, '')
        pairing = LineGroupPairing.objects.get()
        self.assertIsNotNone(pairing.used_at)
        self.assertEqual(pairing.bound_destination_suffix, '1234')

    def test_used_pairing_is_idempotent_for_same_group_and_closed_for_another(self):
        issued = self.issue_pairing()
        code = issued.data['pairing_code']
        first = complete_group_pairing(token=code, group_id='C-original-1111')
        repeated = complete_group_pairing(token=code, group_id='C-original-1111')
        conflict = complete_group_pairing(token=code, group_id='C-attacker-2222')
        self.assertEqual(first.outcome, 'paired')
        self.assertEqual(repeated.outcome, 'idempotent')
        self.assertEqual(conflict.outcome, 'conflict')
        self.property.refresh_from_db()
        self.assertEqual(self.property.line_destination_id, 'C-original-1111')

    def test_already_bound_property_cannot_issue_or_consume_pairing(self):
        issued = self.issue_pairing()
        self.property.line_destination_id = 'C-existing-9999'
        self.property.line_notifications_enabled = True
        self.property.save(update_fields=['line_destination_id', 'line_notifications_enabled'])
        result = complete_group_pairing(
            token=issued.data['pairing_code'], group_id='C-new-0000'
        )
        self.assertEqual(result.outcome, 'already_bound')
        response = self.client.post(self.pairing_url(), {}, format='json', secure=True)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.property.refresh_from_db()
        self.assertEqual(self.property.line_destination_id, 'C-existing-9999')

    def test_revoke_endpoint_invalidates_code(self):
        issued = self.issue_pairing()
        response = self.client.post(
            f'/api/v1/properties/{self.property.property_id}/line/pairing/revoke/',
            {}, format='json', secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['revoked'], 1)
        result = complete_group_pairing(
            token=issued.data['pairing_code'], group_id='C-revoked-1234'
        )
        self.assertEqual(result.outcome, 'revoked')

    def test_disconnect_is_explicit_and_clears_destination(self):
        self.property.line_destination_id = 'C-connected-4321'
        self.property.line_notifications_enabled = True
        self.property.save(update_fields=['line_destination_id', 'line_notifications_enabled'])
        self.client.force_authenticate(self.users['manager'])
        response = self.client.post(
            f'/api/v1/properties/{self.property.property_id}/line/disconnect/',
            {}, format='json', secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.property.refresh_from_db()
        self.assertEqual(self.property.line_destination_id, '')
        self.assertFalse(self.property.line_notifications_enabled)
        self.assertNotIn('C-connected-4321', str(response.data))

    def test_status_returns_only_masked_destination(self):
        self.property.line_destination_id = 'C-sensitive-connected-A1B2'
        self.property.line_notifications_enabled = True
        self.property.save(update_fields=['line_destination_id', 'line_notifications_enabled'])
        self.client.force_authenticate(self.users['manager'])
        response = self.client.get(
            f'/api/v1/properties/{self.property.property_id}/line/status/', secure=True
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['connected'])
        self.assertEqual(response.data['destination_suffix'], 'A1B2')
        self.assertNotIn('C-sensitive-connected-A1B2', str(response.data))

    def test_logs_mask_group_and_never_include_token_or_payload(self):
        issued = self.issue_pairing()
        code = issued.data['pairing_code']
        group_id = 'C-sensitive-full-group-A1B2'
        raw = self.webhook_body(command=issued.data['pairing_command'], group_id=group_id)
        with self.assertLogs('myappLubd.notifications.line_webhook', level='INFO') as captured:
            response = self.post_webhook(raw, signature_for(raw))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        logs = '\n'.join(captured.output)
        self.assertIn('***A1B2', logs)
        self.assertNotIn(group_id, logs)
        self.assertNotIn(code, logs)
        self.assertNotIn(raw.decode(), logs)

    def test_ambiguous_hash_fails_closed(self):
        code = generate_pairing_code()
        for prop, creator in (
            (self.property, self.users['manager']),
            (self.other_property, self.foreign_manager),
        ):
            pairing = LineGroupPairing(
                property=prop,
                created_by=creator,
                expires_at=timezone.now() + timedelta(minutes=15),
            )
            pairing.set_token(code)
            pairing.save()
        result = complete_group_pairing(token=code, group_id='C-ambiguous')
        self.assertEqual(result.outcome, 'invalid')
        self.property.refresh_from_db()
        self.other_property.refresh_from_db()
        self.assertFalse(self.property.line_destination_id)
        self.assertFalse(self.other_property.line_destination_id)


@override_settings(LINE_CHANNEL_SECRET=CHANNEL_SECRET, LINE_PAIRING_EXPIRY_MINUTES=15)
class LineGroupPairingConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.user = User.objects.create_user(username='line-race-manager')
        self.tenant = Tenant.objects.create(name='LINE race tenant')
        self.property = Property.objects.create(name='LINE race property', tenant=self.tenant)
        TenantMembership.objects.create(
            user=self.user, tenant=self.tenant, role='manager'
        )
        self.code = generate_pairing_code()
        pairing = LineGroupPairing(
            property=self.property,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        pairing.set_token(self.code)
        pairing.save()

    def test_simultaneous_different_groups_cannot_both_bind(self):
        barrier = Barrier(2)

        def attempt(group_id):
            close_old_connections()
            try:
                barrier.wait(timeout=5)
                result = complete_group_pairing(token=self.code, group_id=group_id)
                return group_id, result.outcome
            finally:
                close_old_connections()

        groups = ('C-race-group-1111', 'C-race-group-2222')
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(attempt, groups))

        self.assertEqual({outcome for _, outcome in results}, {'paired', 'conflict'})
        winner = next(group for group, outcome in results if outcome == 'paired')
        self.property.refresh_from_db()
        pairing = LineGroupPairing.objects.get()
        self.assertEqual(self.property.line_destination_id, winner)
        self.assertTrue(self.property.line_notifications_enabled)
        self.assertIsNotNone(pairing.used_at)
