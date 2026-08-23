"""Phase A2 action-level RBAC regression coverage for master data APIs."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Job,
    Property,
    Room,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
    Topic,
)


User = get_user_model()


class MasterDataActionRBACContractTests(APITestCase):
    tenant_roles = ('owner', 'admin', 'manager', 'supervisor', 'technician', 'viewer', 'billing')
    tenant_writers = {'owner', 'admin'}
    property_writers = {'owner', 'admin'}
    room_writers = {'owner', 'admin', 'manager', 'supervisor'}

    def setUp(self):
        self.users = {
            role: User.objects.create_user(
                username=f'a2-{role}',
                password='pw12345!',
                is_staff=True,
            )
            for role in self.tenant_roles
        }
        self.superuser = User.objects.create_superuser(
            username='a2-platform-superuser',
            password='pw12345!',
        )
        self.other_owner = User.objects.create_user(
            username='a2-other-owner',
            password='pw12345!',
        )
        self.tenant_a = Tenant.objects.create(
            name='A2 Tenant A',
            owner=self.users['owner'],
            status='active',
        )
        self.tenant_b = Tenant.objects.create(
            name='A2 Tenant B',
            owner=self.other_owner,
            status='active',
        )
        plan = SubscriptionPlan.objects.create(
            code='a2-rbac-plan',
            name='A2 RBAC Plan',
            max_properties=100,
            max_users=100,
        )
        TenantSubscription.objects.create(
            tenant=self.tenant_a,
            plan=plan,
            status='active',
        )
        TenantSubscription.objects.create(
            tenant=self.tenant_b,
            plan=plan,
            status='active',
        )
        self.property_a1 = Property.objects.create(name='A2 Hotel A1', tenant=self.tenant_a)
        self.property_a2 = Property.objects.create(name='A2 Hotel A2', tenant=self.tenant_a)
        self.property_b1 = Property.objects.create(name='A2 Hotel B1', tenant=self.tenant_b)

        self.memberships = {}
        for role, user in self.users.items():
            membership = TenantMembership.objects.create(
                user=user,
                tenant=self.tenant_a,
                role=role,
            )
            if role in {'supervisor', 'technician', 'viewer', 'billing'}:
                membership.properties.add(self.property_a1)
            self.memberships[role] = membership
        self.other_membership = TenantMembership.objects.create(
            user=self.other_owner,
            tenant=self.tenant_b,
            role='owner',
        )

        self.room_a1 = Room.objects.create(
            name='A2-A1-101',
            room_type='Standard',
            property=self.property_a1,
        )
        self.room_a2 = Room.objects.create(
            name='A2-A2-101',
            room_type='Standard',
            property=self.property_a2,
        )
        self.room_b1 = Room.objects.create(
            name='A2-B1-101',
            room_type='Standard',
            property=self.property_b1,
        )
        self.topic = Topic.objects.create(title='A2 Global Plumbing')
        self.job_a1 = Job.objects.create(
            user=self.users['technician'],
            property=self.property_a1,
            description='A2 topic visibility job',
        )
        self.job_a1.topics.add(self.topic)

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def test_tenant_read_update_put_and_delete_matrix(self):
        url = reverse('myappLubd:tenant-detail', kwargs={'pk': self.tenant_a.pk})

        for role, user in self.users.items():
            with self.subTest(role=role, action='read'):
                self.authenticate(user)
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

            for method in ('patch', 'put'):
                with self.subTest(role=role, action=method):
                    self.tenant_a.name = 'A2 Tenant A'
                    self.tenant_a.billing_email = None
                    self.tenant_a.save(update_fields=['name', 'billing_email', 'updated_at'])
                    payload = {
                        'name': f'A2 Tenant A {role} {method}',
                        'status': 'active',
                        'billing_email': f'{role}@example.com',
                        'timezone': 'Asia/Bangkok',
                        'metadata': {},
                    }
                    response = getattr(self.client, method)(url, payload, format='json')
                    expected = (
                        status.HTTP_200_OK
                        if role in self.tenant_writers
                        else status.HTTP_403_FORBIDDEN
                    )
                    self.assertEqual(response.status_code, expected, response.content)
                    self.tenant_a.refresh_from_db()
                    if role not in self.tenant_writers:
                        self.assertEqual(self.tenant_a.name, 'A2 Tenant A')
                        self.assertIsNone(self.tenant_a.billing_email)

            with self.subTest(role=role, action='delete'):
                response = self.client.delete(url)
                self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
                self.assertTrue(Tenant.objects.filter(pk=self.tenant_a.pk).exists())

        self.authenticate(self.superuser)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        response = self.client.patch(url, {'billing_email': 'platform@example.com'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        response = self.client.put(
            url,
            {
                'name': 'A2 Tenant A Platform PUT',
                'status': 'active',
                'billing_email': 'platform-put@example.com',
                'timezone': 'Asia/Bangkok',
                'metadata': {},
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_tenant_create_contract_and_cross_tenant_update_isolation(self):
        unaffiliated = User.objects.create_user(username='a2-unaffiliated', password='pw12345!')
        self.authenticate(unaffiliated)
        response = self.client.post(
            reverse('myappLubd:tenant-list'),
            {'name': 'A2 New Customer', 'timezone': 'Asia/Bangkok'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)

        for role, user in self.users.items():
            with self.subTest(role=role):
                self.authenticate(user)
                response = self.client.post(
                    reverse('myappLubd:tenant-list'),
                    {'name': f'A2 Forbidden Second Tenant {role}'},
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

        self.authenticate(self.users['owner'])
        foreign_url = reverse('myappLubd:tenant-detail', kwargs={'pk': self.tenant_b.pk})
        response = self.client.patch(foreign_url, {'name': 'Leaked Tenant B'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.tenant_b.refresh_from_db()
        self.assertEqual(self.tenant_b.name, 'A2 Tenant B')

        own_url = reverse('myappLubd:tenant-detail', kwargs={'pk': self.tenant_a.pk})
        response = self.client.patch(
            own_url,
            {'owner': self.other_owner.pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.tenant_a.refresh_from_db()
        self.assertEqual(self.tenant_a.owner_id, self.users['owner'].pk)

    def test_property_create_update_and_put_matrix(self):
        list_url = reverse('myappLubd:property-list')
        detail_url = reverse(
            'myappLubd:property-detail',
            kwargs={'property_id': self.property_a1.property_id},
        )

        for role, user in self.users.items():
            self.authenticate(user)
            with self.subTest(role=role, action='read'):
                self.assertEqual(self.client.get(detail_url).status_code, status.HTTP_200_OK)

            with self.subTest(role=role, action='create'):
                name = f'A2 Property Create {role}'
                response = self.client.post(
                    list_url,
                    {'name': name, 'tenant': self.tenant_a.pk},
                    format='json',
                )
                expected = (
                    status.HTTP_201_CREATED
                    if role in self.property_writers
                    else status.HTTP_403_FORBIDDEN
                )
                self.assertEqual(response.status_code, expected, response.content)
                self.assertEqual(Property.objects.filter(name=name).exists(), role in self.property_writers)

            for method in ('patch', 'put'):
                with self.subTest(role=role, action=method):
                    self.property_a1.name = 'A2 Hotel A1'
                    self.property_a1.description = None
                    self.property_a1.save(update_fields=['name', 'description'])
                    payload = {
                        'name': f'A2 Hotel A1 {role} {method}',
                        'description': f'updated by {role}',
                        'tenant': self.tenant_a.pk,
                    }
                    response = getattr(self.client, method)(detail_url, payload, format='json')
                    expected = (
                        status.HTTP_200_OK
                        if role in self.property_writers
                        else status.HTTP_403_FORBIDDEN
                    )
                    self.assertEqual(response.status_code, expected, response.content)
                    self.property_a1.refresh_from_db()
                    if role not in self.property_writers:
                        self.assertEqual(self.property_a1.name, 'A2 Hotel A1')
                        self.assertIsNone(self.property_a1.description)

    def test_property_delete_cross_tenant_and_ownership_protection(self):
        for role, user in self.users.items():
            with self.subTest(role=role, action='delete'):
                candidate = Property.objects.create(
                    name=f'A2 Property Delete {role}',
                    tenant=self.tenant_a,
                )
                if role in {'supervisor', 'technician', 'viewer', 'billing'}:
                    self.memberships[role].properties.add(candidate)
                self.authenticate(user)
                response = self.client.delete(
                    reverse(
                        'myappLubd:property-detail',
                        kwargs={'property_id': candidate.property_id},
                    )
                )
                expected = (
                    status.HTTP_204_NO_CONTENT
                    if role in self.property_writers
                    else status.HTTP_403_FORBIDDEN
                )
                self.assertEqual(response.status_code, expected, response.content)
                self.assertEqual(
                    Property.objects.filter(pk=candidate.pk).exists(),
                    role not in self.property_writers,
                )

        self.authenticate(self.users['owner'])
        foreign_url = reverse(
            'myappLubd:property-detail',
            kwargs={'property_id': self.property_b1.property_id},
        )
        response = self.client.patch(foreign_url, {'name': 'Leaked B1'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self.property_b1.refresh_from_db()
        self.assertEqual(self.property_b1.name, 'A2 Hotel B1')

        own_url = reverse(
            'myappLubd:property-detail',
            kwargs={'property_id': self.property_a1.property_id},
        )
        for payload in (
            {'tenant': self.tenant_b.pk},
            {'tenant': None},
            {'tenant_id': self.tenant_b.tenant_id},
        ):
            with self.subTest(payload=payload):
                response = self.client.patch(own_url, payload, format='json')
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
                self.property_a1.refresh_from_db()
                self.assertEqual(self.property_a1.tenant_id, self.tenant_a.pk)

        response = self.client.post(
            reverse('myappLubd:property-list'),
            {'name': 'A2 Foreign Property Injection', 'tenant': self.tenant_b.pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self.assertFalse(Property.objects.filter(name='A2 Foreign Property Injection').exists())

    def test_room_read_create_update_put_and_delete_matrix(self):
        list_url = reverse('myappLubd:room-list')
        detail_url = reverse('myappLubd:room-detail', kwargs={'pk': self.room_a1.pk})

        for role, user in self.users.items():
            self.authenticate(user)
            with self.subTest(role=role, action='read'):
                self.assertEqual(self.client.get(detail_url).status_code, status.HTTP_200_OK)

            with self.subTest(role=role, action='create'):
                name = f'A2-{role}-CREATE'
                property_reference = (
                    self.property_a1.pk
                    if role in {'owner', 'manager', 'technician', 'billing'}
                    else self.property_a1.property_id
                )
                response = self.client.post(
                    list_url,
                    {
                        'name': name,
                        'room_type': 'Standard',
                        'property_id': property_reference,
                    },
                    format='json',
                )
                expected = (
                    status.HTTP_201_CREATED
                    if role in self.room_writers
                    else status.HTTP_403_FORBIDDEN
                )
                self.assertEqual(response.status_code, expected, response.content)
                self.assertEqual(Room.objects.filter(name=name).exists(), role in self.room_writers)

            for method in ('patch', 'put'):
                with self.subTest(role=role, action=method):
                    self.room_a1.room_type = 'Standard'
                    self.room_a1.save(update_fields=['room_type'])
                    payload = {
                        'name': self.room_a1.name,
                        'room_type': f'{role}-{method}',
                        'is_active': True,
                        'property_id': self.property_a1.pk,
                    }
                    response = getattr(self.client, method)(detail_url, payload, format='json')
                    expected = (
                        status.HTTP_200_OK
                        if role in self.room_writers
                        else status.HTTP_403_FORBIDDEN
                    )
                    self.assertEqual(response.status_code, expected, response.content)
                    self.room_a1.refresh_from_db()
                    expected_type = f'{role}-{method}' if role in self.room_writers else 'Standard'
                    self.assertEqual(self.room_a1.room_type, expected_type)

            with self.subTest(role=role, action='delete'):
                candidate = Room.objects.create(
                    name=f'A2-{role}-DELETE',
                    room_type='Standard',
                    property=self.property_a1,
                )
                response = self.client.delete(
                    reverse('myappLubd:room-detail', kwargs={'pk': candidate.pk})
                )
                expected = (
                    status.HTTP_204_NO_CONTENT
                    if role in self.room_writers
                    else status.HTTP_403_FORBIDDEN
                )
                self.assertEqual(response.status_code, expected, response.content)
                self.assertEqual(
                    Room.objects.filter(pk=candidate.pk).exists(),
                    role not in self.room_writers,
                )

    def test_room_cross_property_ownership_alias_and_bulk_import_protection(self):
        self.authenticate(self.users['owner'])
        room_url = reverse('myappLubd:room-detail', kwargs={'pk': self.room_a1.pk})
        for payload in (
            {'property_id': self.property_a2.pk},
            {'property_id': self.property_a2.property_id},
            {'property': self.property_a2.pk},
            {'properties': [self.property_a2.pk]},
            {'property_id': self.property_b1.pk},
        ):
            with self.subTest(payload=payload):
                response = self.client.patch(room_url, payload, format='json')
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
                self.room_a1.refresh_from_db()
                self.assertEqual(self.room_a1.property_id, self.property_a1.pk)

        for role in ('supervisor', 'technician'):
            self.authenticate(self.users[role])
            outside_url = reverse('myappLubd:room-detail', kwargs={'pk': self.room_a2.pk})
            response = self.client.patch(outside_url, {'room_type': 'Injected'}, format='json')
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
            self.room_a2.refresh_from_db()
            self.assertEqual(self.room_a2.room_type, 'Standard')

        csv_payload = {'csv': 'name,room_type,property_id\nA2-BULK,Suite,%s\n' % self.property_a1.pk}
        self.authenticate(self.users['supervisor'])
        response = self.client.post(
            reverse('myappLubd:room-bulk-import'),
            csv_payload,
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertTrue(Room.objects.filter(name='A2-BULK').exists())

        for role in ('technician', 'viewer', 'billing'):
            with self.subTest(role=role, action='bulk-import'):
                self.authenticate(self.users[role])
                response = self.client.post(
                    reverse('myappLubd:room-bulk-import'),
                    {'csv': f'name,room_type,property_id\nA2-BULK-{role},Suite,{self.property_a1.pk}\n'},
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
                self.assertFalse(Room.objects.filter(name=f'A2-BULK-{role}').exists())

        self.authenticate(self.users['owner'])
        response = self.client.patch(
            reverse('myappLubd:room-detail', kwargs={'pk': self.room_b1.pk}),
            {'room_type': 'Cross tenant injection'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)

    def test_global_topic_read_and_write_matrix(self):
        detail_url = reverse('myappLubd:topic-detail', kwargs={'pk': self.topic.pk})
        list_url = reverse('myappLubd:topic-list')

        topic_tenant_b = Topic.objects.create(title='A2 Tenant B visible topic')
        job_b = Job.objects.create(
            user=self.other_owner,
            property=self.property_b1,
            description='A2 Tenant B topic job',
        )
        job_b.topics.add(topic_tenant_b)

        ordinary_users = [*self.users.values(), self.other_owner]
        for user in ordinary_users:
            with self.subTest(user=user.username, action='read'):
                self.authenticate(user)
                visible_topic = self.topic if user != self.other_owner else topic_tenant_b
                response = self.client.get(
                    reverse('myappLubd:topic-detail', kwargs={'pk': visible_topic.pk})
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

            with self.subTest(user=user.username, action='create'):
                title = f'A2 Forbidden Topic {user.username}'
                response = self.client.post(list_url, {'title': title}, format='json')
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
                self.assertFalse(Topic.objects.filter(title=title).exists())

            with self.subTest(user=user.username, action='update'):
                target_url = detail_url if user != self.other_owner else reverse(
                    'myappLubd:topic-detail', kwargs={'pk': topic_tenant_b.pk}
                )
                response = self.client.patch(
                    target_url,
                    {'description': f'forbidden {user.username}'},
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)

            with self.subTest(user=user.username, action='delete'):
                target_url = detail_url if user != self.other_owner else reverse(
                    'myappLubd:topic-detail', kwargs={'pk': topic_tenant_b.pk}
                )
                response = self.client.delete(target_url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
                self.assertTrue(Topic.objects.filter(pk=self.topic.pk).exists())
                self.assertTrue(Topic.objects.filter(pk=topic_tenant_b.pk).exists())

        self.topic.refresh_from_db()
        self.assertIsNone(self.topic.description)
        self.authenticate(self.superuser)
        created = self.client.post(
            list_url,
            {'title': 'A2 Platform Topic'},
            format='json',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        response = self.client.patch(
            detail_url,
            {'description': 'platform managed'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.topic.refresh_from_db()
        self.assertEqual(self.topic.description, 'platform managed')
        response = self.client.delete(
            reverse('myappLubd:topic-detail', kwargs={'pk': created.data['id']})
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT, response.content)

    def test_platform_superuser_property_and_room_mutations(self):
        self.authenticate(self.superuser)

        property_create = self.client.post(
            reverse('myappLubd:property-list'),
            {'name': 'A2 Platform Property', 'tenant': self.tenant_b.pk},
            format='json',
        )
        self.assertEqual(property_create.status_code, status.HTTP_201_CREATED, property_create.content)
        property_obj = Property.objects.get(name='A2 Platform Property')
        property_url = reverse(
            'myappLubd:property-detail',
            kwargs={'property_id': property_obj.property_id},
        )
        self.assertEqual(self.client.get(property_url).status_code, status.HTTP_200_OK)
        response = self.client.patch(
            property_url,
            {'description': 'platform patch'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        response = self.client.put(
            property_url,
            {
                'name': 'A2 Platform Property PUT',
                'description': 'platform put',
                'tenant': self.tenant_b.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        room_create = self.client.post(
            reverse('myappLubd:room-list'),
            {
                'name': 'A2-PLATFORM-ROOM',
                'room_type': 'Standard',
                'property_id': property_obj.property_id,
            },
            format='json',
        )
        self.assertEqual(room_create.status_code, status.HTTP_201_CREATED, room_create.content)
        room = Room.objects.get(name='A2-PLATFORM-ROOM')
        room_url = reverse('myappLubd:room-detail', kwargs={'pk': room.pk})
        self.assertEqual(self.client.get(room_url).status_code, status.HTTP_200_OK)
        response = self.client.patch(room_url, {'room_type': 'Suite'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        response = self.client.put(
            room_url,
            {
                'name': room.name,
                'room_type': 'Platform PUT',
                'is_active': True,
                'property_id': property_obj.pk,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(self.client.delete(room_url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.delete(property_url).status_code, status.HTTP_204_NO_CONTENT)
