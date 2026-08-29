"""Query and serializer regressions for the unpaginated jobs endpoint."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from . import serializers as serializer_module
from .models import Job, JobComment, Property, Room, Tenant, TenantMembership, Topic
from .serializers import JobSerializer
from .views import JobViewSet


User = get_user_model()


class JobsAllSerializationPerformanceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Jobs all performance tenant')
        cls.property = Property.objects.create(
            name='Jobs all performance property',
            tenant=cls.tenant,
        )
        cls.owner = User.objects.create_user(
            username='jobs-all-owner',
            first_name='Jobs',
            last_name='Owner',
        )
        TenantMembership.objects.create(
            user=cls.owner,
            tenant=cls.tenant,
            role='owner',
        )
        cls.second_user = User.objects.create_user(
            username='jobs-all-second',
            first_name='Second',
            last_name='Technician',
        )
        second_membership = TenantMembership.objects.create(
            user=cls.second_user,
            tenant=cls.tenant,
            role='technician',
        )
        second_membership.properties.add(cls.property)
        cls.room_one = Room.objects.create(
            name='PERF-101', room_type='Standard', property=cls.property,
        )
        cls.room_two = Room.objects.create(
            name='PERF-102', room_type='Standard', property=cls.property,
        )
        cls.topic_one = Topic.objects.create(title='Performance topic one')
        cls.topic_two = Topic.objects.create(title='Performance topic two')

    def request(self, **params):
        raw_request = APIRequestFactory().get('/api/v1/jobs/all/', params)
        force_authenticate(raw_request, user=self.owner)
        return Request(raw_request)

    def optimized_queryset(self, request=None):
        view = JobViewSet()
        view.request = request or self.request(
            property_id=self.property.property_id,
        )
        view.action = 'all'
        view.kwargs = {}
        view.format_kwarg = None
        return view.get_queryset().order_by('id')

    def create_jobs(self, count, *, user=None, updated_by=None, prefix='scale'):
        user = user or self.owner
        if updated_by is None:
            updated_by = self.owner
        return Job.objects.bulk_create([
            Job(
                job_id=f'j{prefix[:9]}{index:06d}',
                property=self.property,
                user=user,
                updated_by=updated_by,
                description=f'Performance job {index}',
                remarks='Query regression',
            )
            for index in range(count)
        ])

    def serialize(self, queryset, request=None):
        return JobSerializer(
            queryset,
            many=True,
            context={'request': request or self.request()},
        ).data

    def serialization_query_count(self, limit):
        request = self.request(property_id=self.property.property_id)
        queryset = self.optimized_queryset(request)[:limit]
        with CaptureQueriesContext(connection) as queries:
            data = self.serialize(queryset, request)
        self.assertEqual(len(data), limit)
        return len(queries)

    def test_user_profiles_are_eager_loaded_with_nullable_and_missing_profiles(self):
        profiled = self.create_jobs(
            4, user=self.second_user, updated_by=self.owner, prefix='profiled',
        )
        nullable = self.create_jobs(
            1, user=self.second_user, updated_by=None, prefix='nullable',
        )[0]
        # bulk_create receives an explicit updated_by default from the helper;
        # set this one row null to exercise the nullable relation.
        Job.objects.filter(pk=nullable.pk).update(updated_by=None)
        missing_profile_user = User.objects.create_user(
            username='jobs-all-no-profile', first_name='No', last_name='Profile',
        )
        missing_profile_user.userprofile.delete()
        missing = self.create_jobs(
            1, user=missing_profile_user, updated_by=None, prefix='missing',
        )[0]
        Job.objects.filter(pk=missing.pk).update(updated_by=None)

        request = self.request(property_id=self.property.property_id)
        with CaptureQueriesContext(connection) as queries:
            rows = self.serialize(self.optimized_queryset(request), request)

        self.assertEqual(len(rows), len(profiled) + 2)
        self.assertEqual(
            sum('myappLubd_userprofile' in query['sql'] for query in queries),
            1,
        )
        by_job_id = {row['job_id']: row for row in rows}
        self.assertEqual(
            by_job_id[nullable.job_id]['updated_by_name'],
            'Unknown Technician',
        )
        self.assertIsNone(by_job_id[missing.job_id]['profile_image'])
        self.assertEqual(by_job_id[missing.job_id]['user_name'], 'No Profile')

    def test_annotated_comments_count_is_exact_across_m2m_joins(self):
        zero, one, many = self.create_jobs(3, prefix='comments')
        JobComment.objects.create(job=one, author=self.owner, comment='one')
        for index in range(3):
            JobComment.objects.create(
                job=many, author=self.owner, comment=f'comment {index}',
            )
        for job in (zero, one, many):
            job.rooms.add(self.room_one, self.room_two)
            job.topics.add(self.topic_one, self.topic_two)

        request = self.request(
            property_id=self.property.property_id,
            room_name='PERF-',
        )
        rows = self.serialize(self.optimized_queryset(request), request)

        self.assertEqual(
            {row['job_id']: row['comments_count'] for row in rows},
            {zero.job_id: 0, one.job_id: 1, many.job_id: 3},
        )

    def test_comments_count_falls_back_for_non_annotated_job_instances(self):
        job = self.create_jobs(1, prefix='fallback')[0]
        JobComment.objects.create(job=job, author=self.owner, comment='first')
        JobComment.objects.create(job=job, author=self.owner, comment='second')

        self.assertEqual(JobSerializer().get_comments_count(job), 2)

    def test_jobs_all_response_contract_is_unchanged(self):
        job = self.create_jobs(1, prefix='contract')[0]
        JobComment.objects.create(job=job, author=self.owner, comment='contract')
        raw_request = APIRequestFactory().get(
            '/api/v1/jobs/all/',
            {'property_id': self.property.property_id},
        )
        force_authenticate(raw_request, user=self.owner)

        response = JobViewSet.as_view({'get': 'all'})(raw_request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {'count', 'results'})
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['job_id'], job.job_id)
        self.assertEqual(response.data['results'][0]['comments_count'], 1)

    def test_accessible_properties_are_computed_once_for_one_assigned_user(self):
        self.create_jobs(10, user=self.second_user, prefix='oneuser')
        request = self.request(property_id=self.property.property_id)

        with patch(
            'myappLubd.serializers.get_accessible_properties',
            wraps=serializer_module.get_accessible_properties,
        ) as accessible_properties:
            rows = self.serialize(self.optimized_queryset(request), request)

        self.assertEqual(len(rows), 10)
        self.assertEqual(accessible_properties.call_count, 1)

    def test_accessible_properties_are_computed_once_per_distinct_assigned_user(self):
        self.create_jobs(3, user=self.owner, prefix='firstuser')
        self.create_jobs(3, user=self.second_user, prefix='seconduser')
        request = self.request(property_id=self.property.property_id)

        with patch(
            'myappLubd.serializers.get_accessible_properties',
            wraps=serializer_module.get_accessible_properties,
        ) as accessible_properties:
            rows = self.serialize(self.optimized_queryset(request), request)

        self.assertEqual(len(rows), 6)
        self.assertEqual(accessible_properties.call_count, 2)

    def test_serialization_query_count_does_not_scale_with_job_count(self):
        self.create_jobs(50, prefix='scaling')

        queries_1 = self.serialization_query_count(1)
        queries_10 = self.serialization_query_count(10)
        queries_50 = self.serialization_query_count(50)

        self.assertLessEqual(queries_10 - queries_1, 2)
        self.assertLessEqual(queries_50 - queries_10, 2)
