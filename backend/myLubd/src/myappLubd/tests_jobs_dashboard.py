"""Property boundary, capability, filtering, and payload tests for Jobs dashboard."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Job, Property, Tenant, TenantMembership


User = get_user_model()


class JobsDashboardTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Jobs dashboard tenant')
        self.property_a = Property.objects.create(name='Hotel A', tenant=self.tenant)
        self.property_b = Property.objects.create(name='Hotel B', tenant=self.tenant)
        self.operator = User.objects.create_user(username='dashboard-supervisor')
        self.viewer = User.objects.create_user(username='dashboard-viewer')
        self.outsider = User.objects.create_user(username='dashboard-outsider')
        for user, role, property_obj in (
            (self.operator, 'supervisor', self.property_a),
            (self.viewer, 'viewer', self.property_a),
            (self.outsider, 'viewer', self.property_b),
        ):
            membership = TenantMembership.objects.create(
                user=user, tenant=self.tenant, role=role
            )
            membership.properties.add(property_obj)
        self.pending = Job.objects.create(
            user=self.operator, property=self.property_a,
            description='Leaking sink room 101', remarks='dashboard test',
            status='pending', priority='high',
        )
        self.completed = Job.objects.create(
            user=self.operator, property=self.property_a,
            description='Repaint lobby', remarks='dashboard test',
            status='completed', priority='low',
        )
        self.foreign_job = Job.objects.create(
            user=self.outsider, property=self.property_b,
            description='Other hotel', remarks='dashboard test',
        )

    def get_dashboard(self, user, property_obj=None, **params):
        self.client.force_authenticate(user)
        query = {'property_id': (property_obj or self.property_a).property_id, **params}
        return self.client.get('/api/v1/jobs/dashboard/', query)

    def test_active_property_is_required_and_inaccessible_property_is_forbidden(self):
        self.client.force_authenticate(self.operator)
        self.assertEqual(
            self.client.get('/api/v1/jobs/dashboard/').status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        response = self.get_dashboard(self.operator, self.property_b)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_results_and_counts_are_property_scoped_and_use_external_ids(self):
        response = self.get_dashboard(self.operator)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['property_id'], self.property_a.property_id)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['status_counts']['pending'], 1)
        self.assertEqual(response.data['status_counts']['completed'], 1)
        self.assertTrue(response.data['can_operate'])
        for row in response.data['results']:
            self.assertEqual(row['property_id'], self.property_a.property_id)
            self.assertNotIn('id', row)
            self.assertNotIn('user_email', row)
            self.assertNotIn('user', row)
        self.assertNotIn(self.foreign_job.job_id, {
            row['job_id'] for row in response.data['results']
        })

    def test_viewer_reads_but_receives_no_write_capability(self):
        response = self.get_dashboard(self.viewer)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['can_operate'])
        self.assertFalse(response.data['can_assign'])
        self.assertTrue(all(not row['can_operate'] for row in response.data['results']))

    def test_search_priority_and_pseudo_status_filters_are_server_side(self):
        response = self.get_dashboard(
            self.operator, search='sink', priority='high', status='pending'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row['job_id'] for row in response.data['results']], [self.pending.job_id])

        self.pending.is_defective = True
        self.pending.save(update_fields=['is_defective'])
        response = self.get_dashboard(self.operator, status='defect')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['job_id'], self.pending.job_id)

    def test_invalid_filters_are_rejected(self):
        for params in (
            {'status': 'bogus'}, {'priority': 'urgent'},
            {'date': 'year'}, {'ordering': 'user_email'},
        ):
            with self.subTest(params=params):
                self.assertEqual(
                    self.get_dashboard(self.operator, **params).status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
