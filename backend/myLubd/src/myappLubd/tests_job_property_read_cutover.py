"""Parity and authorization coverage for direct Job.property read scoping."""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework.test import APITestCase

from .models import Job, Property, Room, Tenant, TenantMembership
from .views import _ai_accessible_properties, get_maintenance_summary


User = get_user_model()


class JobPropertyReadCutoverTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Read cutover tenant')
        self.chinatown = Property.objects.create(name='Chinatown', tenant=self.tenant)
        self.siam = Property.objects.create(name='Siam', tenant=self.tenant)
        self.siam_user = User.objects.create_user(username='siam-supervisor', password='pw')
        self.chinatown_user = User.objects.create_user(username='chinatown-supervisor', password='pw')
        self.staff = User.objects.create_user(username='restricted-staff', password='pw', is_staff=True)
        self.superuser = User.objects.create_superuser(username='break-glass', password='pw')
        for user, property_obj in ((self.siam_user, self.siam), (self.chinatown_user, self.chinatown), (self.staff, self.chinatown)):
            membership = TenantMembership.objects.create(user=user, tenant=self.tenant, role='supervisor')
            membership.properties.add(property_obj)
        self.chinatown_room = Room.objects.create(name='RC-C', room_type='Standard')
        self.chinatown_room.properties.add(self.chinatown)
        self.siam_room = Room.objects.create(name='RC-S', room_type='Standard')
        self.siam_room.properties.add(self.siam)
        self.chinatown_job = Job.objects.create(user=self.chinatown_user, property=self.chinatown, description='C', remarks='x')
        self.chinatown_job.rooms.add(self.chinatown_room)
        self.siam_job = Job.objects.create(user=self.siam_user, property=self.siam, description='S', remarks='x')
        self.siam_job.rooms.add(self.siam_room)

    def legacy_ids(self, properties):
        return set(Job.objects.filter(
            Q(rooms__properties__in=properties) | Q(area__property__in=properties)
        ).distinct().values_list('pk', flat=True))

    def direct_ids(self, properties):
        return set(Job.objects.filter(property__in=properties).values_list('pk', flat=True))

    def test_legacy_direct_parity_for_property_shapes(self):
        for properties in ([self.chinatown], [self.siam], [self.chinatown, self.siam], []):
            self.assertEqual(self.legacy_ids(properties), self.direct_ids(properties))

    def test_locationless_canonical_job_is_expected_direct_only(self):
        """A manually resolved Job remains visible through canonical ownership."""
        locationless = Job.objects.create(
            user=self.chinatown_user,
            property=self.chinatown,
            description='Approved locationless legacy job',
            remarks='x',
        )

        legacy = self.legacy_ids([self.chinatown])
        direct = self.direct_ids([self.chinatown])

        expected_canonical_only = direct - legacy
        self.assertEqual(expected_canonical_only, {locationless.pk})
        self.assertEqual(legacy - direct, set())

    def test_ai_summary_uses_server_controlled_canonical_property_scope(self):
        locationless = Job.objects.create(
            user=self.chinatown_user,
            property=self.chinatown,
            description='AI-visible locationless canonical job',
            remarks='x',
        )
        token = _ai_accessible_properties.set(
            Property.objects.filter(pk=self.chinatown.pk)
        )
        try:
            allowed = get_maintenance_summary(property_name=self.chinatown.property_id)
            denied = get_maintenance_summary(property_name=self.siam.property_id)
        finally:
            _ai_accessible_properties.reset(token)

        self.assertEqual(allowed['total_jobs'], 2)
        self.assertNotIn('error', allowed)
        self.assertEqual(denied['error'], 'PROPERTY_NOT_FOUND')
        self.assertTrue(Job.objects.filter(pk=locationless.pk, property=self.chinatown).exists())

    def test_supervisor_and_restricted_staff_are_property_scoped(self):
        for user, expected in ((self.siam_user, {self.siam_job.job_id}), (self.chinatown_user, {self.chinatown_job.job_id}), (self.staff, {self.chinatown_job.job_id})):
            self.client.force_authenticate(user)
            response = self.client.get('/api/v1/jobs/')
            rows = response.data.get('results', response.data)
            self.assertEqual({row['job_id'] for row in rows}, expected)

    def test_foreign_detail_is_hidden_and_superuser_is_global(self):
        self.client.force_authenticate(self.siam_user)
        self.assertEqual(self.client.get(f'/api/v1/jobs/{self.chinatown_job.job_id}/').status_code, 404)
        self.client.force_authenticate(self.superuser)
        response = self.client.get('/api/v1/jobs/')
        rows = response.data.get('results', response.data)
        self.assertEqual({row['job_id'] for row in rows}, {self.chinatown_job.job_id, self.siam_job.job_id})
