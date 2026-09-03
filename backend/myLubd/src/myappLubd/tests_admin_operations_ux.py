from datetime import timedelta
from types import SimpleNamespace

from django.contrib import admin
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import Permission
from django.db import connection
from django.forms import Select
from django.test import RequestFactory, SimpleTestCase, TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from .admin import (
    AuthIdentityAdmin,
    BillingWebhookEventAdmin,
    InvitationStatusFilter,
    InventoryAdmin,
    JobAdmin,
    LowStockFilter,
    PropertyAdmin,
    RoomAdmin,
    TenantInvitationAdmin,
    TenantMembershipAdmin,
    TenantSubscriptionAdmin,
    UserAdmin,
)
from .models import (
    AuthIdentity,
    BillingWebhookEvent,
    Inventory,
    Job,
    Property,
    Room,
    SubscriptionPlan,
    Tenant,
    TenantInvitation,
    TenantMembership,
    TenantSubscription,
    User,
)


class AdminOperationsConfigurationTests(SimpleTestCase):
    def test_priority_admins_are_registered(self):
        self.assertIsInstance(admin.site._registry[TenantInvitation], TenantInvitationAdmin)
        self.assertIsInstance(admin.site._registry[BillingWebhookEvent], BillingWebhookEventAdmin)

    def test_membership_configuration_uses_human_columns_and_relational_loading(self):
        model_admin = TenantMembershipAdmin(TenantMembership, AdminSite())

        self.assertEqual(
            model_admin.list_display,
            ['user', 'email_display', 'tenant', 'role', 'properties_display', 'is_active', 'created_at', 'updated_at'],
        )
        self.assertIn('tenant', model_admin.list_filter)
        self.assertIn(('properties', admin.RelatedOnlyFieldListFilter), model_admin.list_filter)
        self.assertEqual(model_admin.list_select_related, ['user', 'tenant'])
        self.assertIn('user__email', model_admin.search_fields)
        self.assertIn('user__username', model_admin.search_fields)
        self.assertIn('tenant__name', model_admin.search_fields)

    def test_auth_identity_subject_is_diagnostic_only(self):
        model_admin = AuthIdentityAdmin(AuthIdentity, AdminSite())

        self.assertNotIn('subject', model_admin.list_display)
        self.assertIn('subject', model_admin.search_fields)
        self.assertIn('subject', model_admin.readonly_fields)
        provider_fields = dict(model_admin.fieldsets)['Provider identity']['fields']
        self.assertIn('subject', provider_fields)

    def test_subscription_configuration_has_usage_and_operational_dates(self):
        model_admin = TenantSubscriptionAdmin(TenantSubscription, AdminSite())

        self.assertIn('user_usage', model_admin.list_display)
        self.assertIn('property_usage', model_admin.list_display)
        self.assertIn('trial_ends_at', model_admin.list_display)
        self.assertIn('grace_period_ends_at', model_admin.list_display)
        self.assertEqual(model_admin.list_select_related, ['tenant', 'plan'])
        self.assertIn('tenant__name', model_admin.search_fields)
        self.assertIn('tenant__tenant_id', model_admin.search_fields)

    def test_invitation_token_hash_is_never_exposed(self):
        model_admin = TenantInvitationAdmin(TenantInvitation, AdminSite())
        configured_fields = {
            field
            for _title, options in model_admin.fieldsets
            for field in options['fields']
        }

        self.assertNotIn('token_hash', model_admin.list_display)
        self.assertNotIn('token_hash', model_admin.search_fields)
        self.assertNotIn('token_hash', configured_fields)
        self.assertIn('token_hash', model_admin.exclude)
        self.assertIn(InvitationStatusFilter, model_admin.list_filter)

    def test_job_and_inventory_search_and_lists_prioritize_operations(self):
        job_admin = JobAdmin(Job, AdminSite())
        inventory_admin = InventoryAdmin(Inventory, AdminSite())

        self.assertIn('job_id', job_admin.search_fields)
        self.assertIn('user__email', job_admin.search_fields)
        self.assertIn('property__name', job_admin.search_fields)
        self.assertIn('supplier', inventory_admin.search_fields)
        self.assertIn('category', inventory_admin.search_fields)
        self.assertIn(LowStockFilter, inventory_admin.list_filter)
        self.assertIn('category', inventory_admin.list_filter)
        self.assertIn('category', inventory_admin.list_display)
        self.assertNotIn('category', inventory_admin.raw_id_fields)
        self.assertNotIn('item_id', inventory_admin.list_display)
        self.assertNotIn('last_job_by_user', inventory_admin.list_display)
        self.assertNotIn('last_pm_by_user', inventory_admin.list_display)

    def test_inventory_form_prioritizes_category_and_location_context(self):
        inventory_admin = InventoryAdmin(Inventory, AdminSite())
        fieldsets = dict(inventory_admin.fieldsets)

        self.assertEqual(
            [title for title, _options in inventory_admin.fieldsets],
            [
                'Inventory Information',
                'Item Image',
                'Stock',
                'Storage',
                'Related Jobs & Maintenance',
                'Supplier Information',
                'Additional Notes',
                'QR Code',
                'System',
            ],
        )
        self.assertEqual(
            fieldsets['Inventory Information']['fields'],
            (
                'item_id', 'name', 'category', 'property', 'room', 'unit',
                'description', 'status', 'status_display',
            ),
        )
        self.assertEqual(
            fieldsets['Stock']['fields'],
            ('quantity', 'min_quantity', 'max_quantity', 'unit_price'),
        )
        self.assertEqual(
            fieldsets['System']['fields'],
            ('created_by', 'created_at', 'updated_at'),
        )
        self.assertNotIn('category', inventory_admin.readonly_fields)

    def test_primary_lists_hide_legacy_and_raw_ids(self):
        user_admin = UserAdmin(User, AdminSite())
        property_admin = PropertyAdmin(Property, AdminSite())
        room_admin = RoomAdmin(Room, AdminSite())

        self.assertNotIn('get_property_id_display', user_admin.list_display)
        self.assertEqual(property_admin.list_display[0], 'name')
        self.assertNotIn('property_id', property_admin.list_display)
        self.assertEqual(room_admin.list_display[0], 'name')
        self.assertNotIn('room_id', room_admin.list_display)


class AdminOperationsDisplayTests(TestCase):
    def setUp(self):
        self.request = RequestFactory().get('/admin/')
        self.request.user = User.objects.create_superuser(
            username='operations-admin',
            email='operations@example.com',
            password='pw12345!',
        )
        self.plan = SubscriptionPlan.objects.create(
            code='operations',
            name='Operations',
            max_users=5,
            max_properties=3,
        )
        self.tenant = Tenant.objects.create(name='Operations Tenant')
        self.subscription = TenantSubscription.objects.create(
            tenant=self.tenant,
            plan=self.plan,
            status='active',
        )
        self.client.force_login(self.request.user)

    def test_membership_labels_and_property_prefetch_are_bounded(self):
        for index in range(3):
            user = User.objects.create_user(
                username=f'member-{index}',
                email=f'member-{index}@example.com',
            )
            membership = TenantMembership.objects.create(
                tenant=self.tenant,
                user=user,
                role='technician',
            )
            property_obj = Property.objects.create(
                tenant=self.tenant,
                name=f'Property {index}',
            )
            membership.properties.add(property_obj)

        model_admin = TenantMembershipAdmin(TenantMembership, AdminSite())
        with CaptureQueriesContext(connection) as queries:
            memberships = list(model_admin.get_queryset(self.request).order_by('pk'))
            labels = [
                (model_admin.email_display(item), model_admin.properties_display(item))
                for item in memberships
            ]

        self.assertEqual(len(queries), 2)
        self.assertEqual(labels[0], ('member-0@example.com', 'Property 0'))

        with CaptureQueriesContext(connection) as render_queries:
            response = self.client.get(
                reverse('admin:myappLubd_tenantmembership_changelist'),
                secure=True,
            )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'member-0@example.com')
        self.assertContains(response, 'Property 0')
        property_grant_queries = [
            query for query in render_queries
            if 'myappLubd_tenantmembership_properties' in query['sql']
        ]
        # One query populates the related-only filter and one prefetches all
        # displayed grants; the number is independent of result-row count.
        self.assertLessEqual(len(property_grant_queries), 2)

    def test_subscription_usage_columns_use_annotated_counts(self):
        for index in range(2):
            Property.objects.create(tenant=self.tenant, name=f'Usage Property {index}')
        for index in range(4):
            user = User.objects.create_user(username=f'usage-user-{index}')
            TenantMembership.objects.create(
                tenant=self.tenant,
                user=user,
                role='viewer',
                is_active=index < 3,
            )

        model_admin = TenantSubscriptionAdmin(TenantSubscription, AdminSite())
        with CaptureQueriesContext(connection) as queries:
            subscription = model_admin.get_queryset(self.request).get(pk=self.subscription.pk)
            user_usage = model_admin.user_usage(subscription)
            property_usage = model_admin.property_usage(subscription)

        self.assertEqual(len(queries), 1)
        self.assertEqual(user_usage, '3 / 5 users')
        self.assertEqual(property_usage, '2 / 3 properties')

        with CaptureQueriesContext(connection) as render_queries:
            response = self.client.get(
                reverse('admin:myappLubd_tenantsubscription_changelist'),
                secure=True,
            )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '3 / 5 users')
        self.assertContains(response, '2 / 3 properties')
        annotated_result_queries = [
            query for query in render_queries
            if 'COUNT(DISTINCT' in query['sql']
            and 'myappLubd_tenantsubscription' in query['sql']
        ]
        self.assertEqual(len(annotated_result_queries), 1)

    def test_invitation_status_and_count_are_safe_computed_values(self):
        inviter = User.objects.create_user(username='inviter', email='inviter@example.com')
        invitation = TenantInvitation(
            tenant=self.tenant,
            email='invitee@example.com',
            role='viewer',
            invited_by=inviter,
            expires_at=timezone.now() + timedelta(days=2),
        )
        invitation.issue_token()
        invitation.save()
        invitation.properties.add(Property.objects.create(tenant=self.tenant, name='Invite Property'))

        model_admin = TenantInvitationAdmin(TenantInvitation, AdminSite())
        result = model_admin.get_queryset(self.request).get(pk=invitation.pk)

        self.assertEqual(model_admin.property_count(result), 1)
        self.assertEqual(model_admin.status_display(result), 'Pending')
        self.assertFalse(model_admin.has_add_permission(self.request))
        self.assertFalse(model_admin.has_change_permission(self.request, result))
        self.assertFalse(model_admin.has_delete_permission(self.request, result))

    def test_stock_filter_uses_database_threshold_comparisons(self):
        property_obj = Property.objects.create(tenant=self.tenant, name='Stock Property')
        Inventory.objects.create(
            name='Low item', property=property_obj, quantity=2, min_quantity=5,
        )
        Inventory.objects.create(
            name='Out item', property=property_obj, quantity=0, min_quantity=5,
        )
        Inventory.objects.create(
            name='Boundary item', property=property_obj, quantity=5, min_quantity=5,
        )
        Inventory.objects.create(
            name='Above item', property=property_obj, quantity=6, min_quantity=5,
        )
        model_admin = InventoryAdmin(Inventory, AdminSite())

        expected = {
            'low': {'Low item'},
            'out': {'Out item'},
            'at_or_above': {'Boundary item', 'Above item'},
        }
        for value, names in expected.items():
            with self.subTest(value=value):
                request = RequestFactory().get('/admin/', {'stock_level': value})
                stock_filter = LowStockFilter(
                    request,
                    {'stock_level': value},
                    Inventory,
                    model_admin,
                )
                result = stock_filter.queryset(request, Inventory.objects.all())
                self.assertSetEqual(set(result.values_list('name', flat=True)), names)

    def test_inventory_add_form_has_editable_category_choices(self):
        response = self.client.get(
            reverse('admin:myappLubd_inventory_add'),
            secure=True,
        )

        self.assertEqual(response.status_code, 200)
        form = response.context['adminform'].form
        self.assertIn('category', form.fields)
        category_field = form.fields['category']
        self.assertFalse(category_field.disabled)
        self.assertIsInstance(category_field.widget, Select)
        self.assertEqual(
            Inventory.CATEGORY_CHOICES,
            [
                ('tools', 'Tools'),
                ('parts', 'Parts'),
                ('supplies', 'Supplies'),
                ('equipment', 'Equipment'),
                ('consumables', 'Consumables'),
                ('safety', 'Safety Equipment'),
                ('other', 'Other'),
            ],
        )
        self.assertEqual(
            list(category_field.choices),
            list(Inventory._meta.get_field('category').formfield().choices),
        )
        self.assertContains(response, 'name="category"')
        for value, label in Inventory.CATEGORY_CHOICES:
            self.assertContains(response, f'value="{value}"')
            self.assertContains(response, str(label))

    def test_inventory_category_filter_limits_changelist(self):
        Inventory.objects.create(name='Tools item', category='tools')
        Inventory.objects.create(name='Parts item', category='parts')

        response = self.client.get(
            reverse('admin:myappLubd_inventory_changelist'),
            {'category': 'tools'},
            secure=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertQuerySetEqual(
            response.context['cl'].queryset,
            ['Tools item'],
            transform=lambda item: item.name,
        )

    def test_inventory_category_search_uses_choice_value_contains_lookup(self):
        Inventory.objects.create(name='Wrench', category='tools')
        Inventory.objects.create(name='Replacement belt', category='parts')

        response = self.client.get(
            reverse('admin:myappLubd_inventory_changelist'),
            {'q': 'tool'},
            secure=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertQuerySetEqual(
            response.context['cl'].queryset,
            ['Wrench'],
            transform=lambda item: item.name,
        )

    def test_invitation_status_filter_matches_model_status_rules(self):
        now = timezone.now()
        accepted_user = User.objects.create_user(username='accepted-user')
        invitations = {}
        values = {
            'pending': {'expires_at': now + timedelta(days=1)},
            'expired': {'expires_at': now - timedelta(days=1)},
            'revoked': {
                'expires_at': now + timedelta(days=1),
                'revoked_at': now,
            },
            'accepted': {
                'expires_at': now + timedelta(days=1),
                'accepted_at': now,
                'accepted_by': accepted_user,
            },
        }
        for status_name, overrides in values.items():
            invitation = TenantInvitation(
                tenant=self.tenant,
                email=f'{status_name}@example.com',
                role='viewer',
                **overrides,
            )
            invitation.issue_token()
            invitation.save()
            invitations[status_name] = invitation

        model_admin = TenantInvitationAdmin(TenantInvitation, AdminSite())
        for status_name, invitation in invitations.items():
            with self.subTest(status=status_name):
                request = RequestFactory().get(
                    '/admin/', {'invitation_status': status_name},
                )
                status_filter = InvitationStatusFilter(
                    request,
                    {'invitation_status': status_name},
                    TenantInvitation,
                    model_admin,
                )
                result = status_filter.queryset(
                    request, TenantInvitation.objects.all(),
                )
                self.assertQuerySetEqual(result, [invitation], transform=lambda item: item)

    def test_diagnostic_details_are_viewable_without_mutation_permissions(self):
        viewer = User.objects.create_user(username='diagnostic-viewer', is_staff=True)
        viewer.user_permissions.add(
            Permission.objects.get(codename='view_tenantinvitation'),
            Permission.objects.get(codename='view_billingwebhookevent'),
        )
        invitation = TenantInvitation(
            tenant=self.tenant,
            email='diagnostic@example.com',
            role='viewer',
            expires_at=timezone.now() + timedelta(days=1),
        )
        raw_token = invitation.issue_token()
        invitation.save()
        event = BillingWebhookEvent.objects.create(
            provider='stripe',
            event_id='evt_diagnostic',
            event_type='customer.subscription.updated',
            status='processed',
        )
        self.client.force_login(viewer)

        invitation_response = self.client.get(
            reverse('admin:myappLubd_tenantinvitation_change', args=[invitation.pk]),
            secure=True,
        )
        event_response = self.client.get(
            reverse('admin:myappLubd_billingwebhookevent_change', args=[event.pk]),
            secure=True,
        )

        self.assertEqual(invitation_response.status_code, 200)
        self.assertContains(invitation_response, 'diagnostic@example.com')
        self.assertNotContains(invitation_response, invitation.token_hash)
        self.assertNotContains(invitation_response, raw_token)
        self.assertEqual(event_response.status_code, 200)
        self.assertContains(event_response, 'evt_diagnostic')


class TenantSubscriptionPermissionRegressionTests(SimpleTestCase):
    def test_existing_platform_authority_permissions_are_unchanged(self):
        model_admin = TenantSubscriptionAdmin(TenantSubscription, AdminSite())
        superuser_request = SimpleNamespace(user=SimpleNamespace(is_superuser=True))
        staff_request = SimpleNamespace(user=SimpleNamespace(is_superuser=False))

        self.assertTrue(model_admin.has_add_permission(superuser_request))
        self.assertTrue(model_admin.has_change_permission(superuser_request))
        self.assertTrue(model_admin.has_delete_permission(superuser_request))
        self.assertFalse(model_admin.has_add_permission(staff_request))
        self.assertFalse(model_admin.has_change_permission(staff_request))
        self.assertFalse(model_admin.has_delete_permission(staff_request))
