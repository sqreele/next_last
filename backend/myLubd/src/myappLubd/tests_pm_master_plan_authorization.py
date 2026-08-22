"""Property, role, and workflow coverage for PM master plans."""

from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Machine, PMMasterPlan, PreventiveMaintenance, Property, Tenant, TenantMembership, Topic
from .services import PreventiveMaintenanceService


User = get_user_model()


class PMMasterPlanAuthorizationTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Plan authorization tenant')
        self.property_a = Property.objects.create(name='Plan Property A', tenant=self.tenant)
        self.property_b = Property.objects.create(name='Plan Property B', tenant=self.tenant)

        self.operator_a = User.objects.create_user(username='plan-operator-a', password='pw12345!')
        membership_a = TenantMembership.objects.create(
            user=self.operator_a,
            tenant=self.tenant,
            role='technician',
        )
        membership_a.properties.add(self.property_a)

        self.operator_all = User.objects.create_user(username='plan-operator-all', password='pw12345!')
        membership_all = TenantMembership.objects.create(
            user=self.operator_all,
            tenant=self.tenant,
            role='technician',
        )
        membership_all.properties.add(self.property_a, self.property_b)

        self.viewer = User.objects.create_user(username='plan-viewer', password='pw12345!')
        viewer_membership = TenantMembership.objects.create(
            user=self.viewer,
            tenant=self.tenant,
            role='viewer',
        )
        viewer_membership.properties.add(self.property_a)
        self.outsider = User.objects.create_user(username='plan-outsider', password='pw12345!')

        self.machine_a = Machine.objects.create(
            machine_id='PLAN-MACHINE-A',
            name='Plan machine A',
            property=self.property_a,
        )
        self.machine_b = Machine.objects.create(
            machine_id='PLAN-MACHINE-B',
            name='Plan machine B',
            property=self.property_b,
        )
        self.topic = Topic.objects.create(title='Plan safety checks')

        self.plan_a = self._make_plan('Plan A', self.operator_a, [self.machine_a])
        self.plan_b = self._make_plan('Plan B', self.operator_all, [self.machine_b])
        self.mixed_plan = self._make_plan(
            'Historical mixed plan',
            self.operator_all,
            [self.machine_a, self.machine_b],
        )
        self.empty_plan = self._make_plan('Historical empty plan', self.operator_all, [])

    def _make_plan(self, title, creator, machines, **overrides):
        values = {
            'title': title,
            'start_date': timezone.now() + timedelta(days=1),
            'frequency': 'monthly',
            'lead_time_days': 7,
            'created_by': creator,
        }
        values.update(overrides)
        plan = PMMasterPlan.objects.create(**values)
        plan.machines.set(machines)
        return plan

    def _plan_payload(self, machine_ids, **overrides):
        payload = {
            'title': 'Created plan',
            'machine_ids': machine_ids,
            'topic_ids': [self.topic.pk],
            'start_date': (timezone.now() + timedelta(days=2)).isoformat(),
            'frequency': 'monthly',
            'lead_time_days': 7,
            'active': True,
        }
        payload.update(overrides)
        return payload

    def test_list_detail_and_projection_are_property_scoped_and_hide_malformed_plans(self):
        self.client.force_authenticate(self.operator_a)

        listing = self.client.get(
            '/api/v1/preventive-maintenance/plans/',
            {'property_id': self.property_a.property_id},
            secure=True,
        )
        self.assertEqual(listing.status_code, status.HTTP_200_OK, listing.content)
        self.assertEqual({row['plan_id'] for row in listing.data}, {self.plan_a.plan_id})

        detail = self.client.get(
            f'/api/v1/preventive-maintenance/plans/{self.plan_a.plan_id}/',
            {'property_id': self.property_a.property_id},
            secure=True,
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertEqual(detail.data['plan_id'], self.plan_a.plan_id)
        self.assertEqual(detail.data['property_id'], self.property_a.property_id)
        self.assertTrue(detail.data['can_operate'])
        self.assertTrue({
            'plan_id', 'property_id', 'machines', 'topics', 'procedure_template',
            'assigned_to', 'frequency', 'custom_days', 'start_date',
            'next_due_date', 'last_completed_date', 'active', 'generated_pm_id',
            'generated_pm_status', 'can_operate',
        }.issubset(detail.data.keys()))

        foreign_detail = self.client.get(
            f'/api/v1/preventive-maintenance/plans/{self.plan_b.plan_id}/',
            {'property_id': self.property_a.property_id},
            secure=True,
        )
        self.assertEqual(foreign_detail.status_code, status.HTTP_404_NOT_FOUND)

        numeric_detail = self.client.get(
            f'/api/v1/preventive-maintenance/plans/{self.plan_a.pk}/',
            {'property_id': self.property_a.property_id},
            secure=True,
        )
        self.assertEqual(numeric_detail.status_code, status.HTTP_404_NOT_FOUND)

        for malformed_plan in (self.mixed_plan, self.empty_plan):
            malformed_detail = self.client.get(
                f'/api/v1/preventive-maintenance/plans/{malformed_plan.plan_id}/',
                {'property_id': self.property_a.property_id},
                secure=True,
            )
            self.assertEqual(malformed_detail.status_code, status.HTTP_404_NOT_FOUND)

        before_count = PreventiveMaintenance.objects.count()
        projection = self.client.get(
            '/api/v1/preventive-maintenance/projection/',
            {'property_id': self.property_a.property_id, 'days': 30},
            secure=True,
        )
        self.assertEqual(projection.status_code, status.HTTP_200_OK, projection.content)
        self.assertEqual({item['plan_id'] for item in projection.data['items']}, {self.plan_a.plan_id})
        self.assertEqual(PreventiveMaintenance.objects.count(), before_count)

    def test_mixed_and_zero_machine_plans_are_hidden_without_a_property_filter(self):
        self.client.force_authenticate(self.operator_all)

        listing = self.client.get(
            '/api/v1/preventive-maintenance/plans/',
            secure=True,
        )

        self.assertEqual(listing.status_code, status.HTTP_200_OK, listing.content)
        self.assertEqual(
            {row['plan_id'] for row in listing.data},
            {self.plan_a.plan_id, self.plan_b.plan_id},
        )

    def test_plan_detail_requires_authentication_and_active_property(self):
        detail_url = f'/api/v1/preventive-maintenance/plans/{self.plan_a.plan_id}/'

        self.assertEqual(
            self.client.get(detail_url, secure=True).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.operator_a)
        missing_property = self.client.get(detail_url, secure=True)
        self.assertEqual(missing_property.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('property_id', missing_property.data)

    def test_create_requires_same_property_operable_machines_and_valid_topics(self):
        self.client.force_authenticate(self.operator_a)

        created = self.client.post(
            f'/api/v1/preventive-maintenance/plans/?property_id={self.property_a.property_id}',
            self._plan_payload([self.machine_a.machine_id]),
            format='json',
            secure=True,
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        self.assertEqual(created.data['property_id'], self.property_a.property_id)

        cross_property = self.client.post(
            f'/api/v1/preventive-maintenance/plans/?property_id={self.property_a.property_id}',
            self._plan_payload([self.machine_a.machine_id, self.machine_b.machine_id]),
            format='json',
            secure=True,
        )
        self.assertEqual(cross_property.status_code, status.HTTP_400_BAD_REQUEST)

        unauthorized = self.client.post(
            f'/api/v1/preventive-maintenance/plans/?property_id={self.property_a.property_id}',
            self._plan_payload([self.machine_b.machine_id]),
            format='json',
            secure=True,
        )
        self.assertEqual(unauthorized.status_code, status.HTTP_400_BAD_REQUEST)

        invalid_assignee = self.client.post(
            f'/api/v1/preventive-maintenance/plans/?property_id={self.property_a.property_id}',
            self._plan_payload([self.machine_a.machine_id], assigned_to=self.outsider.pk),
            format='json',
            secure=True,
        )
        self.assertEqual(invalid_assignee.status_code, status.HTTP_400_BAD_REQUEST)

        plan_count = PMMasterPlan.objects.count()
        invalid_topics = self.client.post(
            '/api/v1/preventive-maintenance/plans/',
            self._plan_payload([self.machine_a.machine_id], topic_ids=[999999]),
            format='json',
            secure=True,
        )
        self.assertEqual(invalid_topics.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PMMasterPlan.objects.count(), plan_count)

    def test_viewer_can_read_but_cannot_create_update_or_delete(self):
        self.client.force_authenticate(self.viewer)
        detail_url = (
            f'/api/v1/preventive-maintenance/plans/{self.plan_a.plan_id}/'
            f'?property_id={self.property_a.property_id}'
        )

        detail = self.client.get(detail_url, secure=True)
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertFalse(detail.data['can_operate'])
        self.assertEqual(
            self.client.post(
                '/api/v1/preventive-maintenance/plans/',
                self._plan_payload([self.machine_a.machine_id]),
                format='json',
                secure=True,
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.patch(detail_url, {'title': 'Forbidden'}, format='json', secure=True).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(detail_url, secure=True).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_operator_update_revalidates_machines_and_recalculates_schedule(self):
        self.client.force_authenticate(self.operator_all)
        detail_url = (
            f'/api/v1/preventive-maintenance/plans/{self.plan_a.plan_id}/'
            f'?property_id={self.property_a.property_id}'
        )
        new_start = timezone.now() + timedelta(days=12)

        updated = self.client.patch(
            detail_url,
            {
                'title': 'Updated Plan A',
                'start_date': new_start.isoformat(),
                'machine_ids': [self.machine_a.machine_id],
            },
            format='json',
            secure=True,
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.content)
        self.assertEqual(updated.data['title'], 'Updated Plan A')
        self.assertEqual(updated.data['next_due_date'][:10], new_start.date().isoformat())

        empty_machines = self.client.patch(
            detail_url,
            {'machine_ids': []},
            format='json',
            secure=True,
        )
        self.assertEqual(empty_machines.status_code, status.HTTP_400_BAD_REQUEST)

        cross_property = self.client.patch(
            detail_url,
            {'machine_ids': [self.machine_b.machine_id]},
            format='json',
            secure=True,
        )
        self.assertEqual(cross_property.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_is_scoped_and_preserves_generated_pm_records(self):
        generated = PreventiveMaintenance.objects.create(
            master_plan=self.plan_a,
            occurrence_due_date=self.plan_a.start_date,
            pmtitle=self.plan_a.title,
            scheduled_date=self.plan_a.start_date,
            created_by=self.operator_a,
        )
        generated.machines.set([self.machine_a])
        self.client.force_authenticate(self.operator_a)

        response = self.client.delete(
            f'/api/v1/preventive-maintenance/plans/{self.plan_a.plan_id}/'
            f'?property_id={self.property_a.property_id}',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT, response.content)
        generated.refresh_from_db()
        self.assertIsNone(generated.master_plan_id)

        foreign_delete = self.client.delete(
            f'/api/v1/preventive-maintenance/plans/{self.plan_b.plan_id}/'
            f'?property_id={self.property_a.property_id}',
            secure=True,
        )
        self.assertEqual(foreign_delete.status_code, status.HTTP_404_NOT_FOUND)

    def test_materialization_requires_active_operable_property_and_is_isolated(self):
        self.client.force_authenticate(self.operator_all)

        missing_property = self.client.post(
            '/api/v1/preventive-maintenance/materialize-plans/',
            {},
            format='json',
            secure=True,
        )
        self.assertEqual(missing_property.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            '/api/v1/preventive-maintenance/materialize-plans/',
            {'property_id': self.property_a.property_id},
            format='json',
            secure=True,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        generated_plans = set(
            PreventiveMaintenance.objects.exclude(master_plan=None)
            .values_list('master_plan__plan_id', flat=True)
        )
        self.assertEqual(generated_plans, {self.plan_a.plan_id})
        self.assertEqual(response.data['property_id'], self.property_a.property_id)

    def test_annual_frequency_clamps_leap_day(self):
        leap_day = timezone.make_aware(datetime(2024, 2, 29, 9, 30))
        next_due = PreventiveMaintenanceService.calculate_next_due_date(
            'annual',
            None,
            leap_day,
        )
        self.assertEqual(next_due.date().isoformat(), '2025-02-28')
