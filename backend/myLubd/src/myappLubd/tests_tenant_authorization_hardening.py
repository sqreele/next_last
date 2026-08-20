"""Focused regression coverage for the canonical tenant/property guard."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from django.utils import timezone

from .models import Area, Inventory, Job, Machine, PreventiveMaintenance, Property, Room, Tenant, TenantMembership
from .tenancy import get_accessible_properties


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
        self.staff_manager = User.objects.create_user(username='staff-manager', password='pw12345!', is_staff=True)
        self.staff_without_membership = User.objects.create_user(username='staff-no-membership', password='pw12345!', is_staff=True)
        self.staff_inactive = User.objects.create_user(username='staff-inactive', password='pw12345!', is_staff=True)
        self.platform_superuser = User.objects.create_superuser(username='platform-superuser', password='pw12345!')
        TenantMembership.objects.create(user=self.staff_technician, tenant=self.tenant_a, role='technician').properties.add(self.property_a1)
        TenantMembership.objects.create(user=self.staff_supervisor, tenant=self.tenant_a, role='supervisor').properties.add(self.property_a2)
        TenantMembership.objects.create(user=self.staff_manager, tenant=self.tenant_a, role='manager')
        inactive_membership = TenantMembership.objects.create(
            user=self.staff_inactive, tenant=self.tenant_a, role='technician', is_active=False
        )
        inactive_membership.properties.add(self.property_a1)

        # A legacy direct grant must never bypass the active tenant membership
        # rule for a tenant-backed property.
        self.property_a2.users.add(self.user)
        self.property_b.users.add(self.user)

        self.room_a1 = Room.objects.create(name='A1-101', room_type='Standard')
        self.room_a1.properties.add(self.property_a1)
        self.room_b = Room.objects.create(name='B1-101', room_type='Standard')
        self.room_b.properties.add(self.property_b)
        self.room_a2 = Room.objects.create(name='A2-101', room_type='Standard')
        self.room_a2.properties.add(self.property_a2)
        self.job_b = Job.objects.create(
            user=self.other,
            property=self.property_b,
            description='Tenant B job',
            remarks='',
            status='pending',
            priority='medium',
        )
        self.job_b.rooms.add(self.room_b)
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

    def test_staff_without_active_membership_has_no_tenant_property_access(self):
        self.assertFalse(get_accessible_properties(self.staff_without_membership).exists())
        self.assertFalse(get_accessible_properties(self.staff_inactive).exists())

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

    def test_ai_chat_requires_authentication(self):
        response = self.client.post('/api/v1/ai/chat/', {'message': 'hello'}, format='json', secure=True)
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_authenticated_user_can_reach_ai_chat(self):
        self.client.force_authenticate(self.user)
        # Empty messages are rejected before the external provider is created.
        response = self.client.post('/api/v1/ai/chat/', {}, format='json', secure=True)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
