"""Role and Property isolation coverage for every Job API write path."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Area, Job, Property, Room, Tenant, TenantMembership


User = get_user_model()


class JobWriteAuthorizationTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Job write authorization tenant')
        self.property = Property.objects.create(name='Job write hotel', tenant=self.tenant)
        self.other_property = Property.objects.create(
            name='Other job write hotel', tenant=self.tenant
        )
        self.room = Room.objects.create(
            name='JOB-AUTH-101', room_type='Standard', property=self.property
        )
        self.other_room = Room.objects.create(
            name='JOB-AUTH-201', room_type='Standard', property=self.other_property
        )
        self.area = Area.objects.create(property=self.property, name='Job auth lobby')
        self.other_area = Area.objects.create(
            property=self.other_property, name='Job auth roof'
        )

        self.users = {}
        for role in (
            'owner', 'admin', 'manager', 'supervisor', 'technician', 'viewer', 'billing'
        ):
            user = User.objects.create_user(username=f'job-auth-{role}')
            membership = TenantMembership.objects.create(
                user=user, tenant=self.tenant, role=role
            )
            if role in {'supervisor', 'technician', 'viewer', 'billing'}:
                membership.properties.add(self.property)
            self.users[role] = user

        self.superuser = User.objects.create_superuser(
            username='job-auth-break-glass', email='break-glass@example.com', password='pw12345!'
        )

    def payload(self, property_obj=None, room=None, area=None, **overrides):
        property_obj = property_obj or self.property
        data = {
            'description': 'Authorized Job write',
            'remarks': 'Job write authorization test',
            'status': 'pending',
            'priority': 'medium',
            'property_id': property_obj.property_id,
            'room_ids': [(room or self.room).room_id],
            'area_id': (area or self.area).pk,
            'topic_data': {'title': 'Job write authorization topic'},
        }
        data.update(overrides)
        return data

    def login(self, user):
        self.client.force_authenticate(user)

    def create_as(self, user, **overrides):
        self.login(user)
        response = self.client.post('/api/v1/jobs/', self.payload(**overrides), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        return Job.objects.get(job_id=response.data['job_id'])

    def assert_operator_lifecycle(self, role):
        user = self.users[role]
        job = self.create_as(user, description=f'{role} lifecycle')

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/', {'remarks': f'updated by {role}'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/update_status/',
            {'status': 'in_progress'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        response = self.client.post(
            f'/api/v1/jobs/{job.job_id}/comments/?property_id={job.property.property_id}',
            {'comment': f'{role} comment'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

        response = self.client.delete(f'/api/v1/jobs/{job.job_id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT, response.content)
        self.assertFalse(Job.objects.filter(pk=job.pk).exists())

    def test_owner_can_create_update_status_comment_and_delete(self):
        self.assert_operator_lifecycle('owner')

    def test_admin_can_mutate(self):
        self.assert_operator_lifecycle('admin')

    def test_manager_can_mutate(self):
        self.assert_operator_lifecycle('manager')

    def test_supervisor_with_explicit_property_grant_can_mutate(self):
        self.assert_operator_lifecycle('supervisor')

    def test_technician_with_explicit_property_grant_can_mutate(self):
        self.assert_operator_lifecycle('technician')

    def test_viewer_can_read_but_cannot_create_update_status_comment_or_delete(self):
        job = self.create_as(self.users['owner'], description='Viewer read-only job')
        self.login(self.users['viewer'])

        self.assertEqual(
            self.client.get(f'/api/v1/jobs/{job.job_id}/').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.post('/api/v1/jobs/', self.payload(), format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.patch(
                f'/api/v1/jobs/{job.job_id}/', {'remarks': 'forged'}, format='json'
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.patch(
                f'/api/v1/jobs/{job.job_id}/update_status/',
                {'status': 'in_progress'},
                format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                f'/api/v1/jobs/{job.job_id}/comments/?property_id={job.property.property_id}',
                {'comment': 'forged'},
                format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(f'/api/v1/jobs/{job.job_id}/').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        job.refresh_from_db()
        self.assertEqual(job.remarks, 'Job write authorization test')
        self.assertEqual(job.status, 'pending')
        self.assertFalse(job.comments.exists())

    def test_billing_can_read_but_cannot_mutate(self):
        job = self.create_as(self.users['owner'], description='Billing read-only job')
        self.login(self.users['billing'])

        self.assertEqual(
            self.client.get(f'/api/v1/jobs/{job.job_id}/').status_code,
            status.HTTP_200_OK,
        )
        responses = (
            self.client.post('/api/v1/jobs/', self.payload(), format='json'),
            self.client.patch(
                f'/api/v1/jobs/{job.job_id}/', {'remarks': 'forged'}, format='json'
            ),
            self.client.patch(
                f'/api/v1/jobs/{job.job_id}/update_status/',
                {'status': 'in_progress'},
                format='json',
            ),
            self.client.post(
                f'/api/v1/jobs/{job.job_id}/comments/?property_id={job.property.property_id}',
                {'comment': 'forged'},
                format='json',
            ),
            self.client.delete(f'/api/v1/jobs/{job.job_id}/'),
        )
        for response in responses:
            with self.subTest(method=response.request.get('REQUEST_METHOD')):
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self.assertTrue(Job.objects.filter(pk=job.pk).exists())

    def test_unauthorized_property_create_is_rejected(self):
        self.login(self.users['supervisor'])
        response = self.client.post(
            '/api/v1/jobs/',
            self.payload(
                property_obj=self.other_property,
                room=self.other_room,
                area=self.other_area,
            ),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self.assertFalse(Job.objects.filter(description='Authorized Job write').exists())

    def test_cross_property_rooms_are_rejected(self):
        self.login(self.users['manager'])
        response = self.client.post(
            '/api/v1/jobs/',
            self.payload(room=self.other_room),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertFalse(Job.objects.filter(description='Authorized Job write').exists())

    def test_cross_property_area_is_rejected(self):
        self.login(self.users['manager'])
        response = self.client.post(
            '/api/v1/jobs/',
            self.payload(area=self.other_area),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertFalse(Job.objects.filter(description='Authorized Job write').exists())

    def test_job_detail_remains_readable_for_every_granted_read_only_role(self):
        job = self.create_as(self.users['owner'], description='Granted detail job')
        for role in ('viewer', 'billing'):
            with self.subTest(role=role):
                self.login(self.users[role])
                response = self.client.get(f'/api/v1/jobs/{job.job_id}/')
                self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
                self.assertEqual(response.data['property_id'], self.property.property_id)

    def test_my_jobs_read_is_limited_to_accessible_properties(self):
        viewer = self.users['viewer']
        visible = Job.objects.create(
            user=viewer,
            updated_by=viewer,
            property=self.property,
            description='Visible assigned job',
            remarks='Visible',
        )
        hidden = Job.objects.create(
            user=viewer,
            updated_by=viewer,
            property=self.other_property,
            description='Revoked property job',
            remarks='Hidden',
        )
        self.login(viewer)

        response = self.client.get(
            f'/api/v1/jobs/my_jobs/?property_id={self.property.property_id}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['property_id'], self.property.property_id)
        self.assertFalse(response.data['can_operate'])
        job_ids = {row['job_id'] for row in response.data['results']}
        self.assertIn(visible.job_id, job_ids)
        self.assertNotIn(hidden.job_id, job_ids)

    def test_my_jobs_requires_an_accessible_external_property(self):
        viewer = self.users['viewer']
        foreign_tenant = Tenant.objects.create(name='Foreign My Jobs tenant')
        foreign_property = Property.objects.create(
            name='Foreign My Jobs hotel',
            tenant=foreign_tenant,
        )
        Job.objects.create(
            user=viewer,
            updated_by=viewer,
            property=foreign_property,
            description='Cross-tenant assigned job',
            remarks='Must remain hidden',
        )
        self.login(viewer)

        missing = self.client.get('/api/v1/jobs/my_jobs/')
        inaccessible = self.client.get(
            f'/api/v1/jobs/my_jobs/?property_id={self.other_property.property_id}'
        )
        numeric_fallback = self.client.get(
            f'/api/v1/jobs/my_jobs/?property_id={self.property.pk}'
        )
        cross_tenant = self.client.get(
            f'/api/v1/jobs/my_jobs/?property_id={foreign_property.property_id}'
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(inaccessible.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(numeric_fallback.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(cross_tenant.status_code, status.HTTP_403_FORBIDDEN)

    def test_my_jobs_filters_counts_and_pagination_remain_property_scoped(self):
        technician = self.users['technician']
        for index, job_status in enumerate(('pending', 'in_progress', 'completed')):
            Job.objects.create(
                user=technician,
                updated_by=technician,
                property=self.property,
                description=f'Scoped pump job {index}',
                remarks='Visible',
                status=job_status,
                priority='high',
            )
        Job.objects.create(
            user=technician,
            updated_by=technician,
            property=self.other_property,
            description='Scoped pump job outside grant',
            remarks='Hidden',
            status='pending',
            priority='high',
        )
        self.login(technician)

        response = self.client.get(
            '/api/v1/jobs/my_jobs/',
            {
                'property_id': self.property.property_id,
                'search': 'pump',
                'priority': 'high',
                'status': 'pending',
                'page': 1,
                'page_size': 1,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['total_pages'], 1)
        self.assertEqual(response.data['status_counts']['total'], 3)
        self.assertEqual(response.data['status_counts']['pending'], 1)
        self.assertTrue(response.data['can_operate'])
        self.assertTrue(
            all(
                row['property_id'] == self.property.property_id
                for row in response.data['results']
            )
        )

    def test_my_jobs_rejects_invalid_filters(self):
        self.login(self.users['technician'])
        base = f'/api/v1/jobs/my_jobs/?property_id={self.property.property_id}'

        for query in ('status=overdue', 'priority=critical', 'date=quarter'):
            with self.subTest(query=query):
                response = self.client.get(f'{base}&{query}')
                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                    response.content,
                )

    def test_standard_update_cannot_change_assignee(self):
        job = self.create_as(self.users['manager'], description='Immutable assignee job')
        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/',
            {'user': self.users['technician'].pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        job.refresh_from_db()
        self.assertEqual(job.user, self.users['manager'])

    def test_superuser_break_glass_can_mutate_without_membership(self):
        job = self.create_as(self.superuser, description='Break-glass lifecycle')
        response = self.client.patch(
            f'/api/v1/jobs/{job.job_id}/', {'remarks': 'break-glass update'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        response = self.client.delete(f'/api/v1/jobs/{job.job_id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT, response.content)
        self.assertFalse(Job.objects.filter(pk=job.pk).exists())
