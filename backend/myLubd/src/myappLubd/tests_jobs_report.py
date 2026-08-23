"""Authorization, filter, and CSV safety coverage for the Jobs Report."""

import csv
from io import StringIO

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Area, Job, Property, Room, Tenant, TenantMembership, Topic


User = get_user_model()


class JobsReportCsvTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Jobs Report tenant')
        self.property = Property.objects.create(
            name='Jobs Report Hotel',
            tenant=self.tenant,
        )
        self.other_property = Property.objects.create(
            name='Other Report Hotel',
            tenant=self.tenant,
        )
        self.foreign_tenant = Tenant.objects.create(name='Foreign Report tenant')
        self.foreign_property = Property.objects.create(
            name='Foreign Report Hotel',
            tenant=self.foreign_tenant,
        )

        self.owner = User.objects.create_user(
            username='report-owner',
            first_name='Report',
            last_name='Owner',
        )
        TenantMembership.objects.create(
            user=self.owner,
            tenant=self.tenant,
            role='owner',
        )

        self.read_only_users = []
        for role in ('viewer', 'billing'):
            user = User.objects.create_user(username=f'report-{role}')
            membership = TenantMembership.objects.create(
                user=user,
                tenant=self.tenant,
                role=role,
            )
            membership.properties.add(self.property)
            self.read_only_users.append(user)

        self.room = Room.objects.create(
            name='REPORT-101',
            room_type='Standard',
            property=self.property,
        )
        self.area = Area.objects.create(property=self.property, name='Report Lobby')
        self.topic = Topic.objects.create(title='Report pumps')
        self.base_url = '/api/v1/jobs/report-csv/'

    def login(self, user=None):
        self.client.force_authenticate(user or self.owner)

    def create_job(self, *, property_obj=None, description='Report pump', **overrides):
        job = Job.objects.create(
            property=property_obj or self.property,
            user=self.owner,
            updated_by=self.owner,
            description=description,
            remarks=overrides.pop('remarks', 'Report test'),
            status=overrides.pop('status', 'completed'),
            priority=overrides.pop('priority', 'high'),
            completed_at=overrides.pop('completed_at', timezone.now()),
            **overrides,
        )
        if job.property_id == self.property.pk:
            job.rooms.add(self.room)
            job.topics.add(self.topic)
            job.area = self.area
            job.save(update_fields=['area'])
        return job

    def csv_rows(self, response):
        body = b''.join(response.streaming_content).decode('utf-8-sig')
        return list(csv.DictReader(StringIO(body)))

    def test_active_external_property_is_required_and_authorized(self):
        self.create_job()
        self.login()

        missing = self.client.get(self.base_url)
        accessible = self.client.get(
            self.base_url,
            {'property_id': self.property.property_id},
        )
        numeric = self.client.get(
            self.base_url,
            {'property_id': self.property.pk},
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(accessible.status_code, status.HTTP_200_OK)
        self.assertEqual(numeric.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(len(self.csv_rows(accessible)), 1)

    def test_inaccessible_and_cross_tenant_properties_are_rejected(self):
        self.login(self.read_only_users[0])

        inaccessible = self.client.get(
            self.base_url,
            {'property_id': self.other_property.property_id},
        )
        cross_tenant = self.client.get(
            self.base_url,
            {'property_id': self.foreign_property.property_id},
        )

        self.assertEqual(inaccessible.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(cross_tenant.status_code, status.HTTP_403_FORBIDDEN)

    def test_filters_export_all_matching_rows_not_one_page(self):
        for index in range(30):
            self.create_job(description=f'Pump export row {index}')
        self.create_job(description='Wrong status', status='pending')
        self.create_job(
            property_obj=self.other_property,
            description='Pump outside active Property',
        )
        self.create_job(
            property_obj=self.foreign_property,
            description='Pump outside active Tenant',
        )
        today = timezone.localdate().isoformat()
        self.login()

        response = self.client.get(
            self.base_url,
            {
                'property_id': self.property.property_id,
                'status': 'completed',
                'priority': 'high',
                'search': 'pump export',
                'created_from': today,
                'created_to': today,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.csv_rows(response)
        self.assertEqual(len(rows), 30)
        self.assertNotIn('Internal ID', rows[0])
        self.assertEqual({row['Property'] for row in rows}, {self.property.name})
        self.assertEqual({row['Status'] for row in rows}, {'completed'})
        self.assertEqual({row['Priority'] for row in rows}, {'high'})
        self.assertIn(
            f'jobs-report-{self.property.property_id}-',
            response['Content-Disposition'],
        )

    def test_csv_escapes_unicode_multiline_and_formula_cells(self):
        room = Room.objects.create(
            name='+ห้อง,หนึ่ง',
            room_type='Suite',
            property=self.property,
        )
        topic = Topic.objects.create(title='@หัวข้อ "ปั๊ม"')
        job = self.create_job(description='=SUM(1,2)\nรายละเอียด "ภาษาไทย"')
        job.rooms.clear()
        job.topics.clear()
        job.rooms.add(room)
        job.topics.add(topic)
        self.login()

        response = self.client.get(
            self.base_url,
            {'property_id': self.property.property_id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        raw = b''.join(response.streaming_content)
        self.assertTrue(raw.startswith(b'\xef\xbb\xbf'))
        rows = list(csv.DictReader(StringIO(raw.decode('utf-8-sig'))))
        self.assertEqual(rows[0]['Description'], "'=SUM(1,2)\nรายละเอียด \"ภาษาไทย\"")
        self.assertEqual(rows[0]['Rooms'], "'+ห้อง,หนึ่ง")
        self.assertEqual(rows[0]['Topics'], "'@หัวข้อ \"ปั๊ม\"")

    def test_read_only_roles_can_export_and_invalid_or_empty_filters_are_controlled(self):
        self.create_job()
        for user in self.read_only_users:
            with self.subTest(role=user.username):
                self.login(user)
                response = self.client.get(
                    self.base_url,
                    {'property_id': self.property.property_id},
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.login()
        invalid = self.client.get(
            self.base_url,
            {'property_id': self.property.property_id, 'status': 'overdue'},
        )
        empty = self.client.get(
            self.base_url,
            {'property_id': self.property.property_id, 'search': 'no-such-job'},
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        self.assertEqual(self.csv_rows(empty), [])
