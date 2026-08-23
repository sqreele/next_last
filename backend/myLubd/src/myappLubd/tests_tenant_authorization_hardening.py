"""Focused regression coverage for the canonical tenant/property guard."""

import csv
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from django.utils import timezone

from .models import Area, Inventory, Job, Machine, PreventiveMaintenance, Property, Room, Tenant, TenantMembership, UserProfile
from .serializers import UserProfileSerializer
from .tenancy import (
    can_manage_membership_property_grants,
    get_accessible_properties,
    get_property_summary_recipients,
)
from .management.commands.send_daily_summary import Command as DailySummaryCommand
from .management.commands.send_pending_jobs_summary import Command as PendingJobsSummaryCommand
from .management.commands.send_property_jobs_summary import Command as PropertyJobsSummaryCommand


User = get_user_model()


class TenantPropertyAuthorizationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tenant-a-user', password='pw12345!')
        self.manager = User.objects.create_user(username='tenant-a-manager', password='pw12345!')
        self.other = User.objects.create_user(username='tenant-b-user', password='pw12345!')
        self.tenant_a = Tenant.objects.create(name='Tenant A')
        self.tenant_b = Tenant.objects.create(name='Tenant B')
        self.property_a1 = Property.objects.create(name='A1', tenant=self.tenant_a)
        self.property_a2 = Property.objects.create(name='A2', tenant=self.tenant_a)
        self.property_b = Property.objects.create(name='B1', tenant=self.tenant_b)
        self.membership = TenantMembership.objects.create(
            user=self.user, tenant=self.tenant_a, role='technician'
        )
        self.membership.properties.add(self.property_a1)
        TenantMembership.objects.create(user=self.manager, tenant=self.tenant_a, role='manager')
        TenantMembership.objects.create(user=self.other, tenant=self.tenant_b, role='technician').properties.add(self.property_b)
        self.staff_technician = User.objects.create_user(username='staff-technician', password='pw12345!', is_staff=True)
        self.staff_supervisor = User.objects.create_user(username='staff-supervisor', password='pw12345!', is_staff=True)
        self.staff_admin = User.objects.create_user(username='staff-admin', password='pw12345!', is_staff=True)
        self.staff_manager = User.objects.create_user(username='staff-manager', password='pw12345!', is_staff=True)
        self.staff_without_membership = User.objects.create_user(username='staff-no-membership', password='pw12345!', is_staff=True)
        self.staff_inactive = User.objects.create_user(username='staff-inactive', password='pw12345!', is_staff=True)
        self.platform_superuser = User.objects.create_superuser(username='platform-superuser', password='pw12345!')
        TenantMembership.objects.create(user=self.staff_technician, tenant=self.tenant_a, role='technician').properties.add(self.property_a1)
        TenantMembership.objects.create(user=self.staff_supervisor, tenant=self.tenant_a, role='supervisor').properties.add(self.property_a2)
        TenantMembership.objects.create(user=self.staff_admin, tenant=self.tenant_a, role='admin')
        TenantMembership.objects.create(user=self.staff_manager, tenant=self.tenant_a, role='manager')
        inactive_membership = TenantMembership.objects.create(
            user=self.staff_inactive, tenant=self.tenant_a, role='technician', is_active=False
        )
        inactive_membership.properties.add(self.property_a1)

        self.room_a1 = Room.objects.create(name='A1-101', room_type='Standard', property=self.property_a1)
        self.room_b = Room.objects.create(name='B1-101', room_type='Standard', property=self.property_b)
        self.room_a2 = Room.objects.create(name='A2-101', room_type='Standard', property=self.property_a2)
        self.job_b = Job.objects.create(
            user=self.other,
            property=self.property_b,
            description='Tenant B job',
            remarks='',
            status='pending',
            priority='medium',
        )
        self.job_b.rooms.add(self.room_b)
        self.job_a2 = Job.objects.create(
            user=self.manager,
            property=self.property_a2,
            description='Tenant A2 job',
            remarks='',
            status='pending',
            priority='medium',
        )
        self.job_a2.rooms.add(self.room_a2)
        self.area_b = Area.objects.create(name='Tenant B Lobby', property=self.property_b)
        self.machine_b = Machine.objects.create(name='Tenant B AC', property=self.property_b)
        self.machine_a1 = Machine.objects.create(name='Tenant A1 AC', property=self.property_a1)
        self.machine_a2 = Machine.objects.create(name='Tenant A2 AC', property=self.property_a2)
        self.inventory_a1 = Inventory.objects.create(name='A1 stock', property=self.property_a1, quantity=5, min_quantity=1)
        self.inventory_a2 = Inventory.objects.create(name='A2 stock', property=self.property_a2, quantity=5, min_quantity=1)
        self.inventory_b = Inventory.objects.create(name='B stock', property=self.property_b, quantity=5, min_quantity=1)
        self.pm_a1 = PreventiveMaintenance.objects.create(pmtitle='A1 PM', scheduled_date=timezone.now(), created_by=self.user)
        self.pm_a1.machines.add(self.machine_a1)
        self.pm_a2 = PreventiveMaintenance.objects.create(pmtitle='A2 PM', scheduled_date=timezone.now(), created_by=self.user)
        self.pm_a2.machines.add(self.machine_a2)
        self.pm_b = PreventiveMaintenance.objects.create(pmtitle='B PM', scheduled_date=timezone.now(), created_by=self.other)
        self.pm_b.machines.add(self.machine_b)

    def test_restricted_member_only_sees_explicit_property_and_manager_is_tenant_wide(self):
        self.assertEqual(
            set(get_accessible_properties(self.user).values_list('id', flat=True)),
            {self.property_a1.id},
        )

    def test_staff_restricted_roles_remain_property_scoped(self):
        self.assertEqual(
            set(get_accessible_properties(self.staff_technician).values_list('id', flat=True)), {self.property_a1.id}
        )
        self.assertEqual(
            set(get_accessible_properties(self.staff_supervisor).values_list('id', flat=True)), {self.property_a2.id}
        )

    def test_staff_manager_is_tenant_wide_by_role_not_staff_flag(self):
        self.assertEqual(
            set(get_accessible_properties(self.staff_manager).values_list('id', flat=True)),
            {self.property_a1.id, self.property_a2.id},
        )

    def _property_ids_from_response(self, response):
        payload = response.data
        rows = payload.get('results', payload) if isinstance(payload, dict) else payload
        return {row['property_id'] for row in rows}

    def test_staff_technician_endpoints_follow_explicit_property_grant(self):
        self.client.force_authenticate(self.staff_technician)

        properties = self.client.get(reverse('myappLubd:property-list'), secure=True)
        self.assertEqual(properties.status_code, status.HTTP_200_OK, properties.content)
        self.assertEqual(self._property_ids_from_response(properties), {self.property_a1.property_id})

        machines = self.client.get(reverse('myappLubd:machine-list'), secure=True)
        self.assertEqual(machines.status_code, status.HTTP_200_OK, machines.content)
        machine_rows = machines.data.get('results', machines.data)
        self.assertEqual({row['machine_id'] for row in machine_rows}, {self.machine_a1.machine_id})

        inventory = self.client.get(reverse('myappLubd:inventory-list'), secure=True)
        self.assertEqual(inventory.status_code, status.HTTP_200_OK, inventory.content)
        inventory_rows = inventory.data.get('results', inventory.data)
        self.assertEqual({row['item_id'] for row in inventory_rows}, {self.inventory_a1.item_id})

        preventive_maintenance = self.client.get(reverse('myappLubd:preventive-maintenance-list'), secure=True)
        self.assertEqual(preventive_maintenance.status_code, status.HTTP_200_OK, preventive_maintenance.content)
        pm_rows = preventive_maintenance.data.get('results', preventive_maintenance.data)
        self.assertEqual({row['pm_id'] for row in pm_rows}, {self.pm_a1.pm_id})

    def test_staff_supervisor_endpoint_scope_is_not_widened(self):
        self.client.force_authenticate(self.staff_supervisor)
        response = self.client.get(reverse('myappLubd:property-list'), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(self._property_ids_from_response(response), {self.property_a2.property_id})

    def test_admin_membership_is_tenant_wide_but_not_cross_tenant(self):
        self.client.force_authenticate(self.staff_admin)
        response = self.client.get(reverse('myappLubd:property-list'), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(
            self._property_ids_from_response(response),
            {self.property_a1.property_id, self.property_a2.property_id},
        )

        foreign = self.client.get(
            reverse('myappLubd:property-detail', kwargs={'property_id': self.property_b.property_id}),
            secure=True,
        )
        self.assertEqual(foreign.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_staff_membership_has_no_endpoint_property_scope(self):
        self.client.force_authenticate(self.staff_inactive)
        response = self.client.get(reverse('myappLubd:property-list'), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(self._property_ids_from_response(response), set())

    def test_superuser_endpoint_scope_remains_platform_wide(self):
        self.client.force_authenticate(self.platform_superuser)
        response = self.client.get(reverse('myappLubd:property-list'), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(
            self._property_ids_from_response(response),
            {self.property_a1.property_id, self.property_a2.property_id, self.property_b.property_id},
        )

    def test_summary_recipients_use_active_memberships_not_legacy_links(self):
        self.assertEqual(
            set(get_property_summary_recipients(self.property_a1).values_list('pk', flat=True)),
            {
                self.user.pk, self.manager.pk, self.staff_technician.pk,
                self.staff_manager.pk, self.staff_admin.pk,
            },
        )
        self.assertEqual(
            set(get_property_summary_recipients(self.property_a2).values_list('pk', flat=True)),
            {self.manager.pk, self.staff_manager.pk, self.staff_supervisor.pk, self.staff_admin.pk},
        )
        self.assertFalse(get_property_summary_recipients(self.property_b).filter(pk=self.user.pk).exists())
        self.assertFalse(get_property_summary_recipients(self.property_a1).filter(pk=self.staff_inactive.pk).exists())

    def test_profile_serializer_uses_canonical_access(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.user)

        property_ids = {row['property_id'] for row in UserProfileSerializer(profile).data['properties']}
        self.assertEqual(property_ids, {self.property_a1.property_id})

    def test_profile_properties_contract_matches_canonical_access_for_all_scopes(self):
        tenant_c = Tenant.objects.create(name='Tenant C')
        property_c = Property.objects.create(name='C1', tenant=tenant_c)
        TenantMembership.objects.create(
            user=self.user, tenant=tenant_c, role='viewer'
        ).properties.add(property_c)
        owner = User.objects.create_user(username='tenant-a-owner', password='pw12345!')
        TenantMembership.objects.create(user=owner, tenant=self.tenant_a, role='owner')

        users = (
            self.user,
            self.staff_technician,
            self.staff_supervisor,
            self.staff_admin,
            self.staff_manager,
            owner,
            self.staff_without_membership,
            self.staff_inactive,
            self.platform_superuser,
        )
        for user in users:
            with self.subTest(user=user.username):
                profile, _ = UserProfile.objects.get_or_create(user=user)
                serializer = UserProfileSerializer(profile)
                expected = list(
                    get_accessible_properties(user).values_list('property_id', flat=True)
                )
                actual = [row['property_id'] for row in serializer.data['properties']]
                self.assertEqual(actual, expected)
                self.assertTrue(serializer.fields['properties'].read_only)

        profile = UserProfile.objects.get(user=self.user)
        property_row = UserProfileSerializer(profile).data['properties'][0]
        self.assertEqual(
            set(property_row),
            {
                'id', 'tenant', 'tenant_name', 'timezone', 'property_id', 'name',
                'description', 'created_at', 'rooms', 'is_preventivemaintenance',
            },
        )

    def test_profile_me_api_keeps_membership_derived_properties_contract(self):
        UserProfile.objects.get_or_create(user=self.staff_supervisor)
        self.client.force_authenticate(self.staff_supervisor)

        response = self.client.get(
            reverse('myappLubd:user-profile-me'), secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertIn('properties', response.data)
        self.assertEqual(
            [row['property_id'] for row in response.data['properties']],
            [self.property_a2.property_id],
        )

    def test_direct_profile_property_endpoints_are_retired(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(self.user)
        for route_name in ('user-profile-add-property', 'user-profile-remove-property'):
            response = self.client.post(
                reverse('myappLubd:' + route_name, kwargs={'pk': profile.pk}),
                {'property_id': self.property_a1.property_id},
                format='json',
                secure=True,
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
            self.assertIn('Direct property grants are retired', str(response.data))

    def test_property_export_uses_canonical_authorized_user_counts(self):
        self.client.force_authenticate(self.staff_admin)
        response = self.client.get('/api/v1/properties/export/', secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        rows = {
            row['property_id']: row
            for row in csv.DictReader(StringIO(response.content.decode('utf-8-sig')))
        }
        self.assertEqual(rows[self.property_a1.property_id]['user_count'], '5')
        self.assertEqual(rows[self.property_a2.property_id]['user_count'], '4')

    def test_staff_without_active_membership_has_no_tenant_property_access(self):
        self.assertFalse(get_accessible_properties(self.staff_without_membership).exists())
        self.assertFalse(get_accessible_properties(self.staff_inactive).exists())

    def test_user_without_membership_has_no_property_access(self):
        no_membership_user = User.objects.create_user(username='no-membership', password='pw12345!')
        self.assertFalse(get_accessible_properties(no_membership_user).exists())
        self.client.force_authenticate(no_membership_user)
        response = self.client.get(reverse('myappLubd:property-list'), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(self._property_ids_from_response(response), set())

    def test_scoped_membership_without_grants_has_no_property_access(self):
        ungranted_user = User.objects.create_user(username='scoped-no-grants', password='pw12345!')
        TenantMembership.objects.create(user=ungranted_user, tenant=self.tenant_a, role='technician')
        self.assertFalse(get_accessible_properties(ungranted_user).exists())
        self.client.force_authenticate(ungranted_user)
        response = self.client.get(reverse('myappLubd:property-list'), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(self._property_ids_from_response(response), set())

    def _assert_a2_resources_hidden(self, membership):
        membership.refresh_from_db()
        self.assertEqual(
            set(membership.properties.values_list('pk', flat=True)),
            {self.property_a1.pk},
        )
        self.assertEqual(
            self.client.get(
                reverse('myappLubd:job-detail', kwargs={'job_id': self.job_a2.job_id}),
                secure=True,
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get(
                reverse('myappLubd:room-detail', kwargs={'pk': self.room_a2.pk}),
                secure=True,
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get(
                reverse('myappLubd:machine-detail', kwargs={'machine_id': self.machine_a2.machine_id}),
                secure=True,
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_restricted_roles_cannot_self_grant_through_retired_endpoints(self):
        assign_url = reverse('myappLubd:property-assign-properties')
        add_url = reverse(
            'myappLubd:property-add-user',
            kwargs={'property_id': self.property_a2.property_id},
        )

        for role in ('supervisor', 'technician', 'viewer'):
            with self.subTest(role=role):
                user = User.objects.create_user(
                    username=f'restricted-{role}',
                    password='pw12345!',
                    is_staff=True,
                )
                membership = TenantMembership.objects.create(
                    user=user,
                    tenant=self.tenant_a,
                    role=role,
                )
                membership.properties.add(self.property_a1)
                self.client.force_authenticate(user)

                attempts = (
                    (add_url, {}),
                    (assign_url, {'property_ids': [self.property_a2.pk]}),
                    (assign_url, {'property_ids': [self.property_a2.property_id]}),
                )
                for url, payload in attempts:
                    response = self.client.post(
                        url, payload, format='json', secure=True,
                    )
                    self.assertEqual(
                        response.status_code,
                        status.HTTP_403_FORBIDDEN,
                        response.content,
                    )
                    self._assert_a2_resources_hidden(membership)

                response = self.client.patch(
                    reverse(
                        'myappLubd:tenant-membership-detail',
                        kwargs={'pk': membership.pk},
                    ),
                    {'properties': [self.property_a1.pk, self.property_a2.pk]},
                    format='json',
                    secure=True,
                )
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                    response.content,
                )
                self._assert_a2_resources_hidden(membership)

    def test_only_owner_admin_and_superuser_can_manage_membership_property_grants(self):
        actors = {}
        for role in ('owner', 'admin', 'manager', 'billing', 'supervisor', 'technician', 'viewer'):
            actor = User.objects.create_user(
                username=f'grant-actor-{role}',
                password='pw12345!',
                is_staff=True,
            )
            TenantMembership.objects.create(
                user=actor,
                tenant=self.tenant_a,
                role=role,
            )
            actors[role] = actor

        for role, actor in actors.items():
            with self.subTest(role=role):
                self.membership.properties.set([self.property_a1])
                self.client.force_authenticate(actor)
                response = self.client.patch(
                    reverse(
                        'myappLubd:tenant-membership-detail',
                        kwargs={'pk': self.membership.pk},
                    ),
                    {'properties': [self.property_a1.pk, self.property_a2.pk]},
                    format='json',
                    secure=True,
                )
                expected = (
                    status.HTTP_200_OK
                    if role in {'owner', 'admin'}
                    else status.HTTP_403_FORBIDDEN
                )
                self.assertEqual(response.status_code, expected, response.content)
                expected_properties = (
                    {self.property_a1.pk, self.property_a2.pk}
                    if role in {'owner', 'admin'}
                    else {self.property_a1.pk}
                )
                self.assertEqual(
                    set(self.membership.properties.values_list('pk', flat=True)),
                    expected_properties,
                )
                self.assertEqual(
                    can_manage_membership_property_grants(actor, self.tenant_a),
                    role in {'owner', 'admin'},
                )

        self.membership.properties.set([self.property_a1])
        self.client.force_authenticate(self.platform_superuser)
        response = self.client.patch(
            reverse(
                'myappLubd:tenant-membership-detail',
                kwargs={'pk': self.membership.pk},
            ),
            {'properties': [self.property_a2.pk]},
            format='json',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(
            set(self.membership.properties.values_list('pk', flat=True)),
            {self.property_a2.pk},
        )

    def test_admin_cross_tenant_mixed_and_tenantless_grants_do_not_mutate(self):
        tenantless = Property.objects.create(name='Legacy tenantless')
        self.client.force_authenticate(self.staff_admin)
        membership_url = reverse(
            'myappLubd:tenant-membership-detail',
            kwargs={'pk': self.membership.pk},
        )

        for property_ids in (
            [self.property_b.pk],
            [self.property_a2.pk, self.property_b.pk],
            [self.property_a2.pk, 999999999],
            [tenantless.pk],
        ):
            with self.subTest(property_ids=property_ids):
                response = self.client.patch(
                    membership_url,
                    {'properties': property_ids},
                    format='json',
                    secure=True,
                )
                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                    response.content,
                )
                self.membership.refresh_from_db()
                self.assertEqual(
                    set(self.membership.properties.values_list('pk', flat=True)),
                    {self.property_a1.pk},
                )

        response = self.client.patch(
            membership_url,
            {
                'tenant': self.tenant_b.pk,
                'properties': [self.property_a1.pk],
            },
            format='json',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.membership.refresh_from_db()
        self.assertEqual(self.membership.tenant_id, self.tenant_a.pk)
        self.assertEqual(
            set(self.membership.properties.values_list('pk', flat=True)),
            {self.property_a1.pk},
        )

        foreign_membership = TenantMembership.objects.get(
            user=self.other,
            tenant=self.tenant_b,
        )
        response = self.client.patch(
            reverse(
                'myappLubd:tenant-membership-detail',
                kwargs={'pk': foreign_membership.pk},
            ),
            {'properties': [self.property_b.pk]},
            format='json',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.assertEqual(
            set(foreign_membership.properties.values_list('pk', flat=True)),
            {self.property_b.pk},
        )

    def test_property_grants_reject_inactive_target_and_inactive_admin(self):
        membership_url = reverse(
            'myappLubd:tenant-membership-detail',
            kwargs={'pk': self.membership.pk},
        )
        self.membership.is_active = False
        self.membership.save(update_fields=['is_active'])
        self.client.force_authenticate(self.staff_admin)
        response = self.client.patch(
            membership_url,
            {'properties': [self.property_a2.pk]},
            format='json',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(
            set(self.membership.properties.values_list('pk', flat=True)),
            {self.property_a1.pk},
        )

        inactive_admin = User.objects.create_user(
            username='inactive-grant-admin',
            password='pw12345!',
        )
        TenantMembership.objects.create(
            user=inactive_admin,
            tenant=self.tenant_a,
            role='admin',
            is_active=False,
        )
        self.membership.is_active = True
        self.membership.save(update_fields=['is_active'])
        self.client.force_authenticate(inactive_admin)
        response = self.client.patch(
            membership_url,
            {'properties': [self.property_a2.pk]},
            format='json',
            secure=True,
        )
        self.assertIn(
            response.status_code,
            {status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND},
            response.content,
        )
        self.assertEqual(
            set(self.membership.properties.values_list('pk', flat=True)),
            {self.property_a1.pk},
        )

    def test_superuser_remains_explicit_platform_break_glass(self):
        self.assertEqual(
            set(get_accessible_properties(self.platform_superuser).values_list('id', flat=True)),
            {self.property_a1.id, self.property_a2.id, self.property_b.id},
        )

    def test_migration_user_15_and_16_equivalents_remain_scoped_when_staff(self):
        user_15 = User.objects.create_user(username='gxp.siam@lubd.com', password='pw12345!', is_staff=True)
        user_16 = User.objects.create_user(username='parika.k@lubd.com', password='pw12345!', is_staff=True)
        TenantMembership.objects.create(user=user_15, tenant=self.tenant_a, role='supervisor').properties.add(self.property_a2)
        TenantMembership.objects.create(user=user_16, tenant=self.tenant_a, role='supervisor').properties.add(self.property_a1)
        self.assertEqual(set(get_accessible_properties(user_15).values_list('id', flat=True)), {self.property_a2.id})
        self.assertEqual(set(get_accessible_properties(user_16).values_list('id', flat=True)), {self.property_a1.id})
        self.assertEqual(
            set(get_accessible_properties(self.manager).values_list('id', flat=True)),
            {self.property_a1.id, self.property_a2.id},
        )

    def test_guessed_cross_tenant_property_job_area_and_machine_ids_are_not_accessible(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(
            self.client.get(reverse('myappLubd:property-detail', kwargs={'property_id': self.property_b.property_id}), secure=True).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get(reverse('myappLubd:job-detail', kwargs={'job_id': self.job_b.job_id}), secure=True).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get(reverse('myappLubd:area-detail', kwargs={'pk': self.area_b.id}), secure=True).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get(reverse('myappLubd:machine-detail', kwargs={'machine_id': self.machine_b.machine_id}), secure=True).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_foreign_property_payload_and_inactive_membership_are_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse('myappLubd:area-list'), {'name': 'Injected area', 'property_id': self.property_b.id}, format='json', secure=True
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)

        self.membership.is_active = False
        self.membership.save(update_fields=['is_active'])
        self.assertFalse(get_accessible_properties(self.user).exists())
        self.assertEqual(self.client.get(reverse('myappLubd:job-list'), secure=True).data.get('count', 0), 0)

    def test_restricted_user_cannot_retrieve_same_tenant_unpermitted_inventory(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('myappLubd:inventory-detail', kwargs={'item_id': self.inventory_a2.item_id}), secure=True)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_restricted_user_cannot_retrieve_foreign_tenant_inventory(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('myappLubd:inventory-detail', kwargs={'item_id': self.inventory_b.item_id}), secure=True)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_restricted_user_can_retrieve_authorized_inventory(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('myappLubd:inventory-detail', kwargs={'item_id': self.inventory_a1.item_id}), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_restricted_user_cannot_retrieve_same_tenant_unpermitted_pm(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('myappLubd:preventive-maintenance-detail', kwargs={'pm_id': self.pm_a2.pm_id}), secure=True)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_restricted_user_cannot_retrieve_foreign_tenant_pm(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('myappLubd:preventive-maintenance-detail', kwargs={'pm_id': self.pm_b.pm_id}), secure=True)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_restricted_user_can_retrieve_authorized_pm(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('myappLubd:preventive-maintenance-detail', kwargs={'pm_id': self.pm_a1.pm_id}), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_pm_list_uses_scalar_external_property_identity(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse('myappLubd:preventive-maintenance-list'), secure=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        rows = response.data.get('results', response.data)
        row = next(item for item in rows if item['pm_id'] == self.pm_a1.pm_id)
        self.assertEqual(row['property_id'], self.property_a1.property_id)
        self.assertIsInstance(row['property_id'], str)

    def test_pm_stats_are_property_scoped_and_exclude_cancelled_from_open_work(self):
        self.pm_a1.status = 'cancelled'
        self.pm_a1.scheduled_date = timezone.now() + timedelta(days=1)
        self.pm_a1.save(update_fields=['status', 'scheduled_date'])
        self.client.force_authenticate(self.user)

        response = self.client.get(
            reverse('myappLubd:preventive-maintenance-stats'),
            {'property_id': self.property_a1.property_id},
            secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['counts']['total'], 1)
        self.assertEqual(response.data['counts']['cancelled'], 1)
        self.assertEqual(response.data['counts']['pending'], 0)
        self.assertEqual(response.data['upcoming'], [])

        upcoming = self.client.get(
            reverse('myappLubd:preventive-maintenance-upcoming'),
            {'property_id': self.property_a1.property_id, 'days': 7},
            secure=True,
        )
        self.assertEqual(upcoming.status_code, status.HTTP_200_OK, upcoming.content)
        self.assertEqual(upcoming.data['count'], 0)

    def test_pm_stats_aggregate_each_frequency_once_without_machine_inflation(self):
        second_machine = Machine.objects.create(
            name='Tenant A1 Pump', property=self.property_a1
        )
        second_monthly = PreventiveMaintenance.objects.create(
            pmtitle='Second monthly PM',
            frequency='monthly',
            scheduled_date=timezone.now() + timedelta(days=2),
            created_by=self.user,
        )
        second_monthly.machines.add(self.machine_a1, second_machine)
        weekly = PreventiveMaintenance.objects.create(
            pmtitle='Weekly PM',
            frequency='weekly',
            scheduled_date=timezone.now() + timedelta(days=3),
            created_by=self.user,
        )
        weekly.machines.add(self.machine_a1)
        self.client.force_authenticate(self.user)

        response = self.client.get(
            reverse('myappLubd:preventive-maintenance-stats'),
            {'property_id': self.property_a1.property_id},
            secure=True,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['counts']['total'], 3)
        self.assertEqual(
            response.data['frequency_distribution'],
            [
                {'frequency': 'monthly', 'count': 2},
                {'frequency': 'weekly', 'count': 1},
            ],
        )
        self.assertEqual(
            sum(item['count'] for item in response.data['frequency_distribution']),
            response.data['counts']['total'],
        )

    def test_historical_cross_property_pm_is_hidden_from_restricted_reads(self):
        self.pm_a1.machines.add(self.machine_b)
        self.client.force_authenticate(self.user)

        listing = self.client.get(reverse('myappLubd:preventive-maintenance-list'), secure=True)
        rows = listing.data.get('results', listing.data)
        self.assertNotIn(self.pm_a1.pm_id, {row['pm_id'] for row in rows})

        detail = self.client.get(
            reverse('myappLubd:preventive-maintenance-detail', kwargs={'pm_id': self.pm_a1.pm_id}),
            secure=True,
        )
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_viewer_can_read_but_cannot_modify_pm(self):
        viewer = User.objects.create_user(username='pm-viewer', password='pw12345!')
        TenantMembership.objects.create(
            user=viewer, tenant=self.tenant_a, role='viewer'
        ).properties.add(self.property_a1)
        self.client.force_authenticate(viewer)

        detail_url = reverse(
            'myappLubd:preventive-maintenance-detail',
            kwargs={'pm_id': self.pm_a1.pm_id},
        )
        self.assertEqual(self.client.get(detail_url, secure=True).status_code, status.HTTP_200_OK)
        response = self.client.patch(detail_url, {'pmtitle': 'Forbidden edit'}, format='json', secure=True)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

    def test_non_superuser_cannot_use_unscoped_pm_csv_import(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse('myappLubd:preventive-maintenance-import-csv'),
            {},
            format='multipart',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

    def test_ai_chat_requires_authentication(self):
        response = self.client.post('/api/v1/ai/chat/', {'message': 'hello'}, format='json', secure=True)
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_authenticated_user_can_reach_ai_chat(self):
        self.client.force_authenticate(self.user)
        # Empty messages are rejected before the external provider is created.
        response = self.client.post('/api/v1/ai/chat/', {}, format='json', secure=True)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
