"""B.6 canonical Room.property read, scope, and compatibility regressions."""

from django.contrib.auth import get_user_model
from django.contrib import admin
from django.core.cache import cache
from django.test import RequestFactory
from rest_framework import status
from rest_framework.test import APITestCase

from .admin import FloorFilter, JobAdmin, RoomFilter
from .models import Job, Property, Room, Tenant, TenantMembership
from .services import PropertyService
from .views import _resolve_room


User = get_user_model()


class RoomPropertyReadCutoverTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.tenant = Tenant.objects.create(name='Room Read Tenant')
        self.chinatown = Property.objects.create(name='Room Read Chinatown', tenant=self.tenant)
        self.siam = Property.objects.create(name='Room Read Siam', tenant=self.tenant)
        self.chinatown_room = self.room('RR-CH-101', self.chinatown)
        self.siam_room = self.room('RR-SI-101', self.siam)

        self.chinatown_user = self.user('room-read-chinatown', self.chinatown, role='supervisor')
        self.siam_user = self.user('room-read-siam', self.siam, role='supervisor')
        self.tenant_manager = self.user('room-read-manager', None, role='manager')
        self.staff_chinatown = self.user('room-read-staff', self.chinatown, role='supervisor', is_staff=True)
        self.no_membership = User.objects.create_user(username='room-read-none', password='pw12345!')
        self.superuser = User.objects.create_superuser(username='room-read-superuser', password='pw12345!')

    def room(self, name, property_obj):
        room = Room.objects.create(name=name, room_type='Standard', property=property_obj)
        room.properties.set([property_obj])
        return room

    def user(self, username, property_obj, *, role, is_staff=False):
        user = User.objects.create_user(username=username, password='pw12345!', is_staff=is_staff)
        membership = TenantMembership.objects.create(user=user, tenant=self.tenant, role=role)
        if property_obj is not None:
            membership.properties.add(property_obj)
        return user

    @staticmethod
    def pks(queryset):
        return set(queryset.values_list('room_id', flat=True))

    def test_legacy_and_direct_property_scopes_have_exact_parity(self):
        for scope in ([self.chinatown], [self.siam], [self.chinatown, self.siam], []):
            legacy = self.pks(Room.objects.filter(properties__in=scope).distinct())
            direct = self.pks(Room.objects.filter(property__in=scope))
            self.assertEqual(legacy, direct)

    def test_room_list_and_detail_enforce_canonical_property_scope(self):
        self.client.force_authenticate(self.siam_user)
        response = self.client.get('/api/v1/rooms/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual({row['room_id'] for row in response.data}, {self.siam_room.room_id})
        self.assertEqual(response.data[0]['properties'], [self.siam.pk])

        foreign = self.client.get(f'/api/v1/rooms/{self.chinatown_room.room_id}/')
        self.assertEqual(foreign.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_no_membership_and_superuser_access_shapes(self):
        self.client.force_authenticate(self.staff_chinatown)
        staff_rows = self.client.get('/api/v1/rooms/')
        self.assertEqual({row['room_id'] for row in staff_rows.data}, {self.chinatown_room.room_id})
        self.assertEqual(
            self.client.get(f'/api/v1/rooms/{self.siam_room.room_id}/').status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.client.force_authenticate(self.no_membership)
        self.assertEqual(self.client.get('/api/v1/rooms/').data, [])

        self.client.force_authenticate(self.superuser)
        super_rows = self.client.get('/api/v1/rooms/')
        self.assertEqual(
            {row['room_id'] for row in super_rows.data},
            {self.chinatown_room.room_id, self.siam_room.room_id},
        )

    def test_tenant_wide_user_and_property_service_use_canonical_fk(self):
        self.client.force_authenticate(self.tenant_manager)
        response = self.client.get('/api/v1/rooms/')
        self.assertEqual(
            {row['room_id'] for row in response.data},
            {self.chinatown_room.room_id, self.siam_room.room_id},
        )
        self.assertEqual(
            {room.room_id for room in PropertyService.get_property_rooms(self.chinatown.property_id, self.tenant_manager)},
            {self.chinatown_room.room_id},
        )

    def test_ai_room_resolver_is_scoped_by_canonical_property(self):
        room, error = _resolve_room(self.chinatown_room.name, self.chinatown)
        self.assertIsNone(error)
        self.assertEqual(room.pk, self.chinatown_room.pk)

        room, error = _resolve_room(self.chinatown_room.name, self.siam)
        self.assertIsNone(room)
        self.assertIsNotNone(error)

    def test_direct_scope_ignores_conflicting_legacy_membership(self):
        canonical_siam = Room.objects.create(
            name='RR-LEGACY-CONFLICT',
            room_type='Standard',
            property=self.siam,
        )
        canonical_siam.properties.set([self.chinatown])

        self.assertIn(canonical_siam.pk, self.pks(Room.objects.filter(properties=self.chinatown)))
        self.assertNotIn(canonical_siam.pk, self.pks(Room.objects.filter(property=self.chinatown)))

    def test_admin_room_ownership_filters_use_canonical_property(self):
        canonical_siam = Room.objects.create(
            name='901',
            room_type='Standard',
            property=self.siam,
        )
        canonical_siam.properties.set([self.chinatown])
        job = Job.objects.create(
            user=self.siam_user,
            property=self.siam,
            description='Admin canonical room filter',
        )
        job.rooms.add(canonical_siam)
        request = RequestFactory().get('/admin/', {'property': self.chinatown.pk})

        self.assertEqual(FloorFilter.lookups(object(), request, None), [])
        self.assertEqual(RoomFilter.lookups(object(), request, None), [])
        summary = JobAdmin(Job, admin.site)._get_missing_rooms_summary(request)
        self.assertNotIn(canonical_siam.name, summary['missing_rooms'])
