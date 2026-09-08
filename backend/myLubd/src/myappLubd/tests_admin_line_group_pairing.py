import re
from datetime import timedelta
from types import SimpleNamespace

from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.messages import get_messages
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .admin import LineGroupPairingAdmin, PropertyAdmin
from .models import LineGroupPairing, Property, Tenant, TenantMembership


User = get_user_model()


@override_settings(LINE_PAIRING_EXPIRY_MINUTES=15)
class PropertyLineAdminTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Siam Tenant')
        self.foreign_tenant = Tenant.objects.create(name='Foreign Tenant')
        self.property = Property.objects.create(
            name='Lub d Bangkok Siam', tenant=self.tenant
        )
        self.foreign_property = Property.objects.create(
            name='Foreign Property', tenant=self.foreign_tenant
        )
        self.users = {}
        for role in ('owner', 'admin', 'manager', 'technician', 'viewer', 'billing'):
            user = User.objects.create_user(
                username=f'line-admin-{role}',
                password='test-password',
                is_staff=True,
            )
            TenantMembership.objects.create(
                tenant=self.tenant,
                user=user,
                role=role,
            )
            self.users[role] = user

        self.inactive_manager = User.objects.create_user(
            username='line-admin-inactive', is_staff=True
        )
        TenantMembership.objects.create(
            tenant=self.tenant,
            user=self.inactive_manager,
            role='manager',
            is_active=False,
        )
        self.foreign_manager = User.objects.create_user(
            username='line-admin-foreign', is_staff=True
        )
        TenantMembership.objects.create(
            tenant=self.foreign_tenant,
            user=self.foreign_manager,
            role='manager',
        )
        self.unscoped_staff = User.objects.create_user(
            username='line-admin-unscoped', is_staff=True
        )
        self.superuser = User.objects.create_superuser(
            username='line-platform-superuser',
            email='superuser@example.com',
            password='test-password',
        )

    def action_url(self, action, property_obj=None):
        return reverse(
            f'admin:myappLubd_property_line_{action}',
            args=((property_obj or self.property).pk,),
        )

    def generate_as(self, user, property_obj=None):
        self.client.force_login(user)
        return self.client.post(self.action_url('generate', property_obj), secure=True)

    @staticmethod
    def command_from(response):
        match = re.search(
            rb'STAYMAINT LINK ([A-Z0-9]+(?:-[A-Z0-9]+)+)',
            response.content,
        )
        return match.group(1).decode('ascii') if match else None

    def test_owner_admin_and_manager_can_generate_pairing(self):
        for role in ('owner', 'admin', 'manager'):
            with self.subTest(role=role):
                response = self.generate_as(self.users[role])
                self.assertEqual(response.status_code, 200)
                self.assertIsNotNone(self.command_from(response))
                pairing = LineGroupPairing.objects.filter(
                    property=self.property,
                    revoked_at__isnull=True,
                ).latest('created_at')
                self.assertEqual(pairing.created_by, self.users[role])
                pairing.revoked_at = timezone.now()
                pairing.save(update_fields=['revoked_at'])

    def test_technician_viewer_and_billing_cannot_generate(self):
        for role in ('technician', 'viewer', 'billing'):
            with self.subTest(role=role):
                response = self.generate_as(self.users[role])
                self.assertEqual(response.status_code, 403)
        self.assertFalse(LineGroupPairing.objects.exists())

    def test_unscoped_inactive_and_foreign_staff_cannot_generate(self):
        for user in (self.unscoped_staff, self.inactive_manager, self.foreign_manager):
            with self.subTest(user=user.username):
                response = self.generate_as(user)
                self.assertEqual(response.status_code, 403)
        self.assertFalse(LineGroupPairing.objects.exists())

    def test_superuser_can_generate_for_property_without_membership(self):
        response = self.generate_as(self.superuser, self.foreign_property)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            LineGroupPairing.objects.filter(
                property=self.foreign_property,
                created_by=self.superuser,
            ).exists()
        )

    def test_plaintext_code_is_returned_once_but_not_persisted_or_audited(self):
        response = self.generate_as(self.users['owner'])
        code = self.command_from(response)
        self.assertIsNotNone(code)

        pairing = LineGroupPairing.objects.get(property=self.property)
        self.assertEqual(pairing.token_hash, LineGroupPairing.hash_token(code))
        self.assertNotEqual(pairing.token_hash, code)
        self.assertNotIn(code, pairing.bound_destination_suffix)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertFalse(
            LogEntry.objects.filter(object_id=str(self.property.pk)).filter(
                change_message__contains=code
            ).exists()
        )
        self.assertNotIn(code, str(dict(self.client.session.items())))
        self.assertEqual(list(get_messages(response.wsgi_request)), [])

        refreshed = self.client.get(self.action_url('generate'), secure=True)
        self.assertNotContains(refreshed, code)
        cache_control = response['Cache-Control']
        self.assertIn('private', cache_control)
        self.assertIn('max-age=0', cache_control)

    def test_generate_requires_post_and_csrf(self):
        self.client.force_login(self.users['owner'])
        confirmation = self.client.get(self.action_url('generate'), secure=True)
        self.assertEqual(confirmation.status_code, 200)
        self.assertFalse(LineGroupPairing.objects.exists())

        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.users['owner'])
        rejected = csrf_client.post(self.action_url('generate'), secure=True)
        self.assertEqual(rejected.status_code, 403)
        self.assertFalse(LineGroupPairing.objects.exists())

        confirmation = csrf_client.get(self.action_url('generate'), secure=True)
        csrf_match = re.search(
            rb'name="csrfmiddlewaretoken" value="([^"]+)"',
            confirmation.content,
        )
        self.assertIsNotNone(csrf_match)
        csrf_token = csrf_match.group(1).decode('ascii')
        accepted = csrf_client.post(
            self.action_url('generate'),
            {'csrfmiddlewaretoken': csrf_token},
            secure=True,
            HTTP_REFERER=f'https://testserver{self.action_url("generate")}',
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(LineGroupPairing.objects.count(), 1)

    def test_active_pairing_must_be_revoked_before_generating_another(self):
        first = self.generate_as(self.users['manager'])
        first_code = self.command_from(first)

        second = self.client.post(self.action_url('generate'), secure=True)
        self.assertEqual(second.status_code, 302)
        self.assertEqual(LineGroupPairing.objects.count(), 1)
        self.assertEqual(
            LineGroupPairing.objects.get().token_hash,
            LineGroupPairing.hash_token(first_code),
        )

    def test_connected_property_rejects_pairing_generation(self):
        self.property.line_destination_id = 'C-private-connected-A1B2'
        self.property.line_notifications_enabled = True
        self.property.save(
            update_fields=['line_destination_id', 'line_notifications_enabled']
        )

        response = self.generate_as(self.users['owner'])

        self.assertEqual(response.status_code, 302)
        self.assertFalse(LineGroupPairing.objects.exists())

    def test_revoke_has_confirmation_and_only_revokes_active_property_pairing(self):
        response = self.generate_as(self.users['admin'])
        pairing = LineGroupPairing.objects.get(property=self.property)
        foreign_pairing = LineGroupPairing.objects.create(
            property=self.foreign_property,
            created_by=self.superuser,
            token_hash='f' * 64,
            expires_at=timezone.now() + timedelta(minutes=15),
        )

        confirmation = self.client.get(self.action_url('revoke'), secure=True)
        self.assertEqual(confirmation.status_code, 200)
        pairing.refresh_from_db()
        self.assertIsNone(pairing.revoked_at)

        revoked = self.client.post(self.action_url('revoke'), secure=True)
        self.assertEqual(revoked.status_code, 302)
        pairing.refresh_from_db()
        foreign_pairing.refresh_from_db()
        self.assertIsNotNone(pairing.revoked_at)
        self.assertIsNone(foreign_pairing.revoked_at)
        self.assertContains(response, 'STAYMAINT LINK')

    def test_disconnect_requires_post_masks_destination_and_preserves_history(self):
        self.property.line_destination_id = 'C-sensitive-destination-A1B2'
        self.property.line_notifications_enabled = True
        self.property.save(update_fields=['line_destination_id', 'line_notifications_enabled'])
        pairing = LineGroupPairing.objects.create(
            property=self.property,
            created_by=self.users['owner'],
            token_hash='a' * 64,
            expires_at=timezone.now() - timedelta(minutes=1),
            used_at=timezone.now() - timedelta(minutes=2),
            bound_destination_suffix='A1B2',
        )
        expired_pairing = LineGroupPairing.objects.create(
            property=self.property,
            created_by=self.users['owner'],
            token_hash='9' * 64,
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.client.force_login(self.users['owner'])

        confirmation = self.client.get(self.action_url('disconnect'), secure=True)
        self.assertEqual(confirmation.status_code, 200)
        self.property.refresh_from_db()
        self.assertEqual(self.property.line_destination_id, 'C-sensitive-destination-A1B2')

        disconnected = self.client.post(self.action_url('disconnect'), secure=True)
        self.assertEqual(disconnected.status_code, 302)
        self.property.refresh_from_db()
        self.assertEqual(self.property.line_destination_id, '')
        self.assertFalse(self.property.line_notifications_enabled)
        self.assertTrue(LineGroupPairing.objects.filter(pk=pairing.pk).exists())
        expired_pairing.refresh_from_db()
        self.assertIsNone(expired_pairing.revoked_at)
        self.assertEqual(expired_pairing.status, 'expired')

    def test_revoke_and_disconnect_enforce_authority_and_tenant_scope(self):
        pairing = LineGroupPairing.objects.create(
            property=self.property,
            created_by=self.users['owner'],
            token_hash='b' * 64,
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        self.property.line_destination_id = 'C-private-connected-A1B2'
        self.property.line_notifications_enabled = True
        self.property.save(
            update_fields=['line_destination_id', 'line_notifications_enabled']
        )

        for user, action in (
            (self.users['technician'], 'revoke'),
            (self.users['viewer'], 'disconnect'),
            (self.users['billing'], 'revoke'),
            (self.inactive_manager, 'disconnect'),
            (self.foreign_manager, 'disconnect'),
            (self.unscoped_staff, 'revoke'),
        ):
            with self.subTest(user=user.username, action=action):
                self.client.force_login(user)
                response = self.client.post(self.action_url(action), secure=True)
                self.assertEqual(response.status_code, 403)

        pairing.refresh_from_db()
        self.property.refresh_from_db()
        self.assertIsNone(pairing.revoked_at)
        self.assertEqual(self.property.line_destination_id, 'C-private-connected-A1B2')
        self.assertTrue(self.property.line_notifications_enabled)

    def test_pairing_status_and_expiry_cover_all_operational_states(self):
        property_admin = admin.site._registry[Property]
        self.assertEqual(property_admin.line_pairing_status(self.property), 'None')
        self.assertIsNone(property_admin.line_pairing_expiry(self.property))

        active = LineGroupPairing.objects.create(
            property=self.property,
            created_by=self.users['owner'],
            token_hash='c' * 64,
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        self.assertEqual(
            property_admin.line_pairing_status(self.property), 'Active pairing'
        )
        self.assertEqual(property_admin.line_pairing_expiry(self.property), active.expires_at)

        active.revoked_at = timezone.now()
        active.save(update_fields=['revoked_at'])
        self.assertEqual(property_admin.line_pairing_status(self.property), 'Revoked')
        self.assertIsNone(property_admin.line_pairing_expiry(self.property))

        used = LineGroupPairing.objects.create(
            property=self.property,
            created_by=self.users['owner'],
            token_hash='d' * 64,
            expires_at=timezone.now() + timedelta(minutes=15),
            used_at=timezone.now(),
            bound_destination_suffix='A1B2',
        )
        self.assertEqual(property_admin.line_pairing_status(self.property), 'Used')

        used.used_at = None
        used.expires_at = timezone.now() - timedelta(seconds=1)
        used.save(update_fields=['used_at', 'expires_at'])
        self.assertEqual(property_admin.line_pairing_status(self.property), 'Expired')

    @override_settings(
        LINE_CHANNEL_SECRET='admin-render-secret-value',
        LINE_CHANNEL_ACCESS_TOKEN='admin-render-access-token',
    )
    def test_rendered_admin_hides_full_destination_hash_and_channel_secrets(self):
        destination = 'C-sensitive-destination-A1B2'
        token_hash = 'e' * 64
        self.property.line_destination_id = destination
        self.property.line_notifications_enabled = True
        self.property.save(
            update_fields=['line_destination_id', 'line_notifications_enabled']
        )
        LineGroupPairing.objects.create(
            property=self.property,
            created_by=self.superuser,
            token_hash=token_hash,
            expires_at=timezone.now() - timedelta(minutes=1),
            bound_destination_suffix='A1B2',
        )
        self.client.force_login(self.superuser)

        for url in (
            reverse('admin:myappLubd_property_changelist'),
            reverse('admin:myappLubd_property_change', args=(self.property.pk,)),
            reverse('admin:myappLubd_linegrouppairing_changelist'),
        ):
            with self.subTest(url=url):
                response = self.client.get(url, secure=True)
                self.assertEqual(response.status_code, 200)
                self.assertNotContains(response, destination)
                self.assertNotContains(response, token_hash)
                self.assertNotContains(response, 'admin-render-secret-value')
                self.assertNotContains(response, 'admin-render-access-token')
        self.assertContains(response, '***A1B2')

    def test_admin_fields_never_expose_destination_or_token_hash(self):
        property_admin = admin.site._registry[self.property.__class__]
        pairing_admin = admin.site._registry[LineGroupPairing]
        self.assertIsInstance(property_admin, PropertyAdmin)
        self.assertIsInstance(pairing_admin, LineGroupPairingAdmin)
        for existing_column in ('tenant', 'is_preventivemaintenance', 'created_at'):
            self.assertIn(existing_column, property_admin.list_display)
        request = SimpleNamespace(user=self.superuser)
        self.assertNotIn(
            'line_destination_id',
            [
                field
                for _title, options in property_admin.get_fieldsets(
                    request, self.property
                )
                for field in options['fields']
            ],
        )
        self.assertNotIn('token_hash', pairing_admin.get_fields(request))
        self.assertEqual(
            property_admin.line_connection_status(
                Property(line_destination_id='C-sensitive-destination-A1B2')
            ),
            'Connected (***A1B2)',
        )
        self.assertEqual(
            property_admin.line_connection_status(Property(line_destination_id='X')),
            'Connected (***)',
        )

    def test_line_group_pairing_admin_is_read_only_scoped_and_suffix_only(self):
        own_pairing = LineGroupPairing.objects.create(
            property=self.property,
            created_by=self.users['owner'],
            token_hash='1' * 64,
            expires_at=timezone.now() + timedelta(minutes=15),
            bound_destination_suffix='A1B2',
        )
        foreign_pairing = LineGroupPairing.objects.create(
            property=self.foreign_property,
            created_by=self.superuser,
            token_hash='2' * 64,
            expires_at=timezone.now() + timedelta(minutes=15),
            bound_destination_suffix='Z9Y8',
        )
        pairing_admin = admin.site._registry[LineGroupPairing]
        request = SimpleNamespace(user=self.users['manager'])

        self.assertEqual(list(pairing_admin.get_queryset(request)), [own_pairing])
        self.assertFalse(pairing_admin.has_add_permission(request))
        self.assertFalse(pairing_admin.has_change_permission(request, own_pairing))
        self.assertFalse(pairing_admin.has_delete_permission(request, own_pairing))
        self.assertFalse(pairing_admin.has_view_permission(request, foreign_pairing))
        self.assertEqual(pairing_admin.safe_destination(own_pairing), '***A1B2')
        self.assertEqual(pairing_admin.status_display(own_pairing), 'Active pairing')

        view_permission = Permission.objects.get(
            content_type__app_label='myappLubd',
            codename='view_linegrouppairing',
        )
        self.users['manager'].user_permissions.add(view_permission)
        self.client.force_login(self.users['manager'])
        response = self.client.get(
            reverse('admin:myappLubd_linegrouppairing_changelist'), secure=True
        )
        self.assertContains(response, '***A1B2')
        self.assertNotContains(response, 'Z9Y8')
        self.assertNotContains(response, own_pairing.token_hash)

        detail = self.client.get(
            reverse('admin:myappLubd_linegrouppairing_change', args=(own_pairing.pk,)),
            secure=True,
        )
        self.assertEqual(detail.status_code, 200)
        self.assertNotContains(detail, own_pairing.token_hash)

        foreign_detail = self.client.get(
            reverse(
                'admin:myappLubd_linegrouppairing_change',
                args=(foreign_pairing.pk,),
            ),
            secure=True,
        )
        self.assertNotEqual(foreign_detail.status_code, 200)
        self.assertNotIn(foreign_pairing.token_hash.encode(), foreign_detail.content)

        arbitrary_edit = self.client.post(
            reverse('admin:myappLubd_linegrouppairing_change', args=(own_pairing.pk,)),
            {'bound_destination_suffix': 'EVIL'},
            secure=True,
        )
        self.assertEqual(arbitrary_edit.status_code, 403)

        add_attempt = self.client.get(
            reverse('admin:myappLubd_linegrouppairing_add'), secure=True
        )
        self.assertEqual(add_attempt.status_code, 403)

        delete_attempt = self.client.post(
            reverse('admin:myappLubd_linegrouppairing_delete', args=(own_pairing.pk,)),
            {'post': 'yes'},
            secure=True,
        )
        self.assertEqual(delete_attempt.status_code, 403)
