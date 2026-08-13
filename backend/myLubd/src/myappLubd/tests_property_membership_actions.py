from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import Property, Tenant, TenantMembership, UserProfile
from .tenancy import get_accessible_properties


User = get_user_model()


class PropertyMembershipActionSecurityTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager_a = User.objects.create_user(username='property-manager-a', password='pw12345!')
        self.member_a = User.objects.create_user(username='property-member-a', password='pw12345!')
        self.manager_b = User.objects.create_user(username='property-manager-b', password='pw12345!')
        self.staff = User.objects.create_user(
            username='property-staff', password='pw12345!', is_staff=True
        )

        self.tenant_a = Tenant.objects.create(name='Membership Tenant A', owner=self.manager_a)
        self.tenant_b = Tenant.objects.create(name='Membership Tenant B', owner=self.manager_b)
        self.manager_a_membership = TenantMembership.objects.create(
            tenant=self.tenant_a,
            user=self.manager_a,
            role='owner',
        )
        self.member_a_membership = TenantMembership.objects.create(
            tenant=self.tenant_a,
            user=self.member_a,
            role='technician',
        )
        self.manager_b_membership = TenantMembership.objects.create(
            tenant=self.tenant_b,
            user=self.manager_b,
            role='owner',
        )

        self.existing_a = Property.objects.create(
            name='Existing Membership Property A', tenant=self.tenant_a
        )
        self.property_a1 = Property.objects.create(
            name='Membership Property A1', tenant=self.tenant_a
        )
        self.property_a2 = Property.objects.create(
            name='Membership Property A2', tenant=self.tenant_a
        )
        self.property_b = Property.objects.create(
            name='Membership Property B', tenant=self.tenant_b
        )

        self.member_a_membership.properties.add(self.existing_a)
        self.existing_a.users.add(self.member_a)
        self.member_a.userprofile.properties.add(self.existing_a)

    @staticmethod
    def _add_url(property_obj):
        return f'/api/v1/properties/{property_obj.property_id}/add_user/'

    @staticmethod
    def _numeric_add_url(property_obj):
        return f'/api/v1/properties/{property_obj.pk}/add_user/'

    @staticmethod
    def _bulk_url():
        return '/api/v1/properties/assign_properties/'

    def _authenticate(self, user):
        self.client.force_authenticate(user)

    def _assert_not_assigned(self, user, *properties):
        profile = UserProfile.objects.get(user=user)
        for property_obj in properties:
            self.assertFalse(property_obj.users.filter(pk=user.pk).exists())
            self.assertFalse(profile.properties.filter(pk=property_obj.pk).exists())
            self.assertFalse(
                TenantMembership.objects.filter(
                    user=user,
                    tenant=property_obj.tenant,
                    properties=property_obj,
                ).exists()
            )

    @staticmethod
    def _accessible_ids(user):
        return set(get_accessible_properties(user).values_list('pk', flat=True))

    def _assert_assigned(self, user, membership, *properties):
        profile = UserProfile.objects.get(user=user)
        for property_obj in properties:
            self.assertTrue(property_obj.users.filter(pk=user.pk).exists())
            self.assertTrue(profile.properties.filter(pk=property_obj.pk).exists())
            self.assertTrue(membership.properties.filter(pk=property_obj.pk).exists())
            self.assertTrue(get_accessible_properties(user).filter(pk=property_obj.pk).exists())

    def test_unauthenticated_add_user_is_denied(self):
        response = self.client.post(self._add_url(self.property_a1), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.content)
        self.assertFalse(self.property_a1.users.exists())

    def test_ordinary_user_cannot_self_assign_same_tenant_property(self):
        self._authenticate(self.member_a)
        accessible_before = self._accessible_ids(self.member_a)

        response = self.client.post(self._add_url(self.property_a1), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.member_a, self.property_a1)
        self.assertEqual(self._accessible_ids(self.member_a), accessible_before)

    def test_same_tenant_membership_without_admin_role_cannot_self_assign(self):
        self.member_a_membership.role = 'manager'
        self.member_a_membership.save(update_fields=['role'])
        self._authenticate(self.member_a)
        accessible_before = self._accessible_ids(self.member_a)

        response = self.client.post(self._add_url(self.property_a1), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.member_a, self.property_a1)
        self.assertEqual(self._accessible_ids(self.member_a), accessible_before)

    def test_ordinary_user_cannot_self_assign_foreign_public_property_id(self):
        self._authenticate(self.member_a)
        accessible_before = self._accessible_ids(self.member_a)

        response = self.client.post(self._add_url(self.property_b), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.member_a, self.property_b)
        response_text = str(response.data)
        self.assertNotIn(self.property_b.name, response_text)
        self.assertNotIn(self.property_b.property_id, response_text)
        self.assertEqual(self._accessible_ids(self.member_a), accessible_before)

    def test_add_user_does_not_treat_foreign_numeric_pk_as_authorization(self):
        self._authenticate(self.member_a)
        accessible_before = self._accessible_ids(self.member_a)

        response = self.client.post(self._numeric_add_url(self.property_b), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.member_a, self.property_b)
        self.assertEqual(self._accessible_ids(self.member_a), accessible_before)

    def test_add_user_invalid_property_uses_safe_failure(self):
        self._authenticate(self.manager_a)

        response = self.client.post('/api/v1/properties/does-not-exist/add_user/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self.assertEqual(response.data, {'detail': 'Property is unavailable.'})

    def test_authorized_tenant_manager_add_user_syncs_all_relations_idempotently(self):
        self._authenticate(self.manager_a)

        first = self.client.post(self._add_url(self.property_a1), {}, format='json')
        second = self.client.post(self._add_url(self.property_a1), {}, format='json')

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.content)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.content)
        self._assert_assigned(self.manager_a, self.manager_a_membership, self.property_a1)
        self.assertEqual(self.property_a1.users.filter(pk=self.manager_a.pk).count(), 1)

    def test_staff_add_user_remains_authorized(self):
        self._authenticate(self.staff)

        response = self.client.post(self._add_url(self.property_b), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertTrue(self.property_b.users.filter(pk=self.staff.pk).exists())
        self.assertTrue(self.staff.userprofile.properties.filter(pk=self.property_b.pk).exists())

    def test_add_user_rolls_back_property_users_when_profile_sync_fails(self):
        self._authenticate(self.manager_a)
        self.client.raise_request_exception = False

        with patch(
            'myappLubd.view_modules.properties.UserProfile.objects.get_or_create',
            side_effect=RuntimeError('profile sync failed'),
        ):
            response = self.client.post(self._add_url(self.property_a1), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertFalse(self.property_a1.users.filter(pk=self.manager_a.pk).exists())
        self.assertFalse(self.manager_a.userprofile.properties.filter(pk=self.property_a1.pk).exists())
        self.assertFalse(self.manager_a_membership.properties.filter(pk=self.property_a1.pk).exists())

    def test_ordinary_user_cannot_bulk_self_assign_same_tenant_properties(self):
        self._authenticate(self.member_a)
        accessible_before = self._accessible_ids(self.member_a)

        response = self.client.post(
            self._bulk_url(),
            {'property_ids': [self.property_a1.property_id, self.property_a2.pk]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.member_a, self.property_a1, self.property_a2)
        self.assertEqual(self._accessible_ids(self.member_a), accessible_before)

    def test_bulk_foreign_public_id_is_denied_without_metadata(self):
        self._authenticate(self.member_a)
        accessible_before = self._accessible_ids(self.member_a)

        response = self.client.post(
            self._bulk_url(), {'property_ids': [self.property_b.property_id]}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.member_a, self.property_b)
        response_text = str(response.data)
        self.assertNotIn(self.property_b.name, response_text)
        self.assertNotIn(self.property_b.property_id, response_text)
        self.assertEqual(self._accessible_ids(self.member_a), accessible_before)

    def test_bulk_foreign_numeric_id_is_denied(self):
        self._authenticate(self.member_a)
        accessible_before = self._accessible_ids(self.member_a)

        response = self.client.post(
            self._bulk_url(), {'property_ids': [self.property_b.pk]}, format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.member_a, self.property_b)
        self.assertEqual(self._accessible_ids(self.member_a), accessible_before)

    def test_mixed_authorized_and_foreign_bulk_request_is_atomic(self):
        self._authenticate(self.manager_a)
        accessible_before = self._accessible_ids(self.manager_a)

        response = self.client.post(
            self._bulk_url(),
            {'property_ids': [self.property_a1.property_id, self.property_b.pk]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.manager_a, self.property_a1, self.property_b)
        self.assertEqual(self._accessible_ids(self.manager_a), accessible_before)

    def test_authorized_bulk_accepts_mixed_identifier_types_and_syncs_relations(self):
        self._authenticate(self.manager_a)

        response = self.client.post(
            self._bulk_url(),
            {'property_ids': [self.property_a1.property_id, self.property_a2.pk]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(len(response.data['assigned']), 2)
        self._assert_assigned(
            self.manager_a,
            self.manager_a_membership,
            self.property_a1,
            self.property_a2,
        )

    def test_authorized_bulk_deduplicates_public_and_numeric_aliases(self):
        self._authenticate(self.manager_a)

        response = self.client.post(
            self._bulk_url(),
            {
                'property_ids': [
                    self.property_a1.property_id,
                    self.property_a1.property_id,
                    self.property_a1.pk,
                ]
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(len(response.data['assigned']), 1)
        self._assert_assigned(self.manager_a, self.manager_a_membership, self.property_a1)

    def test_bulk_invalid_id_fails_without_partial_membership(self):
        self._authenticate(self.manager_a)
        accessible_before = self._accessible_ids(self.manager_a)

        response = self.client.post(
            self._bulk_url(),
            {'property_ids': [self.property_a1.property_id, 'does-not-exist']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.content)
        self._assert_not_assigned(self.manager_a, self.property_a1)
        self.assertEqual(self._accessible_ids(self.manager_a), accessible_before)

    def test_bulk_empty_or_non_list_payload_is_rejected(self):
        self._authenticate(self.manager_a)

        empty = self.client.post(self._bulk_url(), {'property_ids': []}, format='json')
        scalar = self.client.post(
            self._bulk_url(), {'property_ids': self.property_a1.property_id}, format='json'
        )

        self.assertEqual(empty.status_code, status.HTTP_400_BAD_REQUEST, empty.content)
        self.assertEqual(scalar.status_code, status.HTTP_400_BAD_REQUEST, scalar.content)
        self._assert_not_assigned(self.manager_a, self.property_a1)

    def test_bulk_rolls_back_all_property_users_when_profile_sync_fails(self):
        self._authenticate(self.manager_a)
        accessible_before = self._accessible_ids(self.manager_a)
        self.client.raise_request_exception = False

        with patch(
            'myappLubd.view_modules.properties.UserProfile.objects.get_or_create',
            side_effect=RuntimeError('profile sync failed'),
        ):
            response = self.client.post(
                self._bulk_url(),
                {'property_ids': [self.property_a1.property_id, self.property_a2.pk]},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        for property_obj in (self.property_a1, self.property_a2):
            self.assertFalse(property_obj.users.filter(pk=self.manager_a.pk).exists())
            self.assertFalse(self.manager_a.userprofile.properties.filter(pk=property_obj.pk).exists())
            self.assertFalse(self.manager_a_membership.properties.filter(pk=property_obj.pk).exists())
        self.assertEqual(self._accessible_ids(self.manager_a), accessible_before)
