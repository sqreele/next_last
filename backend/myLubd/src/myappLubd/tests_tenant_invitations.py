from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, close_old_connections, connection
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .auth import Auth0JWTAuthentication
from .invitations import accept_invitation, create_invitation, invitation_from_token
from .models import AuthIdentity, Property, Tenant, TenantInvitation, TenantMembership
from .tenancy import get_accessible_properties


User = get_user_model()


class TenantInvitationTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner', email='owner@example.com', password='pw12345!',
        )
        self.manager = User.objects.create_user(
            username='manager', email='manager@example.com', password='pw12345!',
        )
        self.invitee = User.objects.create_user(
            username='invitee', email='person@example.com', password='pw12345!',
        )
        AuthIdentity.objects.create(
            user=self.invitee,
            issuer='https://tenant.auth0.com/',
            subject='auth0|invitee',
        )
        self.tenant = Tenant.objects.create(name='Invitation Tenant')
        self.other_tenant = Tenant.objects.create(name='Other Tenant')
        self.property = Property.objects.create(name='Invitation Hotel', tenant=self.tenant)
        self.other_property = Property.objects.create(name='Other Hotel', tenant=self.other_tenant)
        TenantMembership.objects.create(
            tenant=self.tenant, user=self.owner, role='owner',
        )
        TenantMembership.objects.create(
            tenant=self.tenant, user=self.manager, role='manager',
        )

    def make_invitation(self, **overrides):
        values = {
            'tenant': self.tenant,
            'email': self.invitee.email,
            'role': 'technician',
            'properties': [self.property],
            'invited_by': self.owner,
        }
        values.update(overrides)
        return create_invitation(**values)

    def test_plaintext_token_is_not_stored_and_hash_validation_is_constant_time(self):
        invitation, token = self.make_invitation()
        invitation.refresh_from_db()
        self.assertNotEqual(invitation.token_hash, token)
        self.assertNotIn(token, invitation.token_hash)
        self.assertTrue(invitation.matches_token(token))
        self.assertFalse(invitation.matches_token(f'{token}wrong'))
        self.assertEqual(invitation_from_token(token).pk, invitation.pk)

    def test_model_status_enforces_expired_and_revoked_states(self):
        invitation, _token = self.make_invitation()
        invitation.expires_at = timezone.now() - timedelta(seconds=1)
        invitation.save(update_fields=['expires_at', 'updated_at'])
        self.assertEqual(invitation.status, 'expired')
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=['revoked_at', 'updated_at'])
        self.assertEqual(invitation.status, 'revoked')

    @patch('myappLubd.invitations.send_invitation', return_value=True)
    def test_authorized_owner_can_create_invitation(self, _send):
        self.client.force_authenticate(self.owner)
        response = self.client.post(reverse('myappLubd:tenant-invitation-list'), {
            'tenant': self.tenant.pk,
            'email': 'PERSON@EXAMPLE.COM',
            'role': 'technician',
            'properties': [self.property.pk],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invitation = TenantInvitation.objects.get()
        self.assertEqual(invitation.email, 'person@example.com')
        self.assertEqual(set(invitation.properties.values_list('pk', flat=True)), {self.property.pk})
        self.assertNotIn('token', response.data)

    @patch('myappLubd.invitations.send_invitation', return_value=True)
    def test_manager_cannot_invite_or_list_invitations(self, _send):
        self.client.force_authenticate(self.manager)
        create_response = self.client.post(reverse('myappLubd:tenant-invitation-list'), {
            'tenant': self.tenant.pk,
            'email': self.invitee.email,
            'role': 'technician',
            'properties': [self.property.pk],
        }, format='json')
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.make_invitation()
        list_response = self.client.get(reverse('myappLubd:tenant-invitation-list'))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data, [])

    @patch('myappLubd.invitations.send_invitation', return_value=True)
    def test_cross_tenant_property_and_invalid_role_are_rejected(self, _send):
        self.client.force_authenticate(self.owner)
        endpoint = reverse('myappLubd:tenant-invitation-list')
        cross_tenant = self.client.post(endpoint, {
            'tenant': self.tenant.pk,
            'email': self.invitee.email,
            'role': 'technician',
            'properties': [self.other_property.pk],
        }, format='json')
        self.assertEqual(cross_tenant.status_code, status.HTTP_400_BAD_REQUEST)
        invalid_role = self.client.post(endpoint, {
            'tenant': self.tenant.pk,
            'email': self.invitee.email,
            'role': 'god-mode',
            'properties': [],
        }, format='json')
        self.assertEqual(invalid_role.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TenantInvitation.objects.count(), 0)

    def test_role_property_rules_are_enforced(self):
        self.client.force_authenticate(self.owner)
        endpoint = reverse('myappLubd:tenant-invitation-list')
        with patch('myappLubd.invitations.send_invitation', return_value=True):
            tenant_wide_with_grant = self.client.post(endpoint, {
                'tenant': self.tenant.pk,
                'email': self.invitee.email,
                'role': 'manager',
                'properties': [self.property.pk],
            }, format='json')
            scoped_without_grant = self.client.post(endpoint, {
                'tenant': self.tenant.pk,
                'email': self.invitee.email,
                'role': 'viewer',
                'properties': [],
            }, format='json')
        self.assertEqual(tenant_wide_with_grant.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(scoped_without_grant.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_active_invitation_fails_case_insensitively(self):
        self.make_invitation(email='Person@Example.com')
        with self.assertRaisesMessage(Exception, 'active invitation already exists'):
            self.make_invitation(email='person@example.com')
        self.assertEqual(TenantInvitation.objects.count(), 1)

    def test_expired_invitation_is_revoked_when_replaced(self):
        old, _old_token = self.make_invitation()
        old.expires_at = timezone.now() - timedelta(seconds=1)
        old.save(update_fields=['expires_at', 'updated_at'])
        new, _new_token = self.make_invitation()
        old.refresh_from_db()
        self.assertIsNotNone(old.revoked_at)
        self.assertNotEqual(old.pk, new.pk)

    def test_invitation_preprovisions_non_authorized_user_for_auth0_binding(self):
        new_email = 'new.person@example.com'
        invitation, _token = self.make_invitation(email=new_email)
        user = User.objects.get(email=new_email)
        self.assertTrue(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertFalse(TenantMembership.objects.filter(user=user).exists())
        self.assertFalse(AuthIdentity.objects.filter(user=user).exists())

        resolved = Auth0JWTAuthentication()._get_or_create_user_from_claims({
            'iss': 'https://tenant.auth0.com/',
            'sub': 'auth0|new-person',
            'email': new_email.upper(),
            'email_verified': True,
        })
        self.assertEqual(resolved, user)
        self.assertEqual(AuthIdentity.objects.get(user=user).subject, 'auth0|new-person')
        self.assertEqual(invitation.status, 'pending')
        self.assertFalse(TenantMembership.objects.filter(user=user).exists())

    def test_preview_reports_valid_expired_revoked_and_accepted_states(self):
        invitation, token = self.make_invitation()
        endpoint = reverse('myappLubd:tenant-invitation-preview')
        response = self.client.get(endpoint, {'token': token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'pending')
        self.assertNotIn('email', response.data)

        invitation.expires_at = timezone.now() - timedelta(seconds=1)
        invitation.save(update_fields=['expires_at', 'updated_at'])
        self.assertEqual(self.client.get(endpoint, {'token': token}).data['status'], 'expired')
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=['revoked_at', 'updated_at'])
        self.assertEqual(self.client.get(endpoint, {'token': token}).data['status'], 'revoked')

        invitation.revoked_at = None
        invitation.expires_at = timezone.now() + timedelta(days=1)
        invitation.accepted_at = timezone.now()
        invitation.accepted_by = self.invitee
        invitation.save(update_fields=[
            'revoked_at', 'expires_at', 'accepted_at', 'accepted_by', 'updated_at',
        ])
        self.assertEqual(self.client.get(endpoint, {'token': token}).data['status'], 'accepted')

    def test_preview_invalid_token_uses_generic_not_found(self):
        response = self.client.get(
            reverse('myappLubd:tenant-invitation-preview'),
            {'token': 'invalid'},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(str(response.data['detail']), 'Invitation unavailable.')

    def test_accept_requires_auth0_bound_authenticated_user(self):
        _invitation, token = self.make_invitation()
        endpoint = reverse('myappLubd:tenant-invitation-accept')
        anonymous = self.client.post(endpoint, {'token': token}, format='json')
        self.assertIn(
            anonymous.status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )

        self.client.force_login(self.invitee)
        session_response = self.client.post(endpoint, {'token': token}, format='json')
        self.assertEqual(session_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.logout()

        unbound = User.objects.create_user(username='unbound', email=self.invitee.email)
        self.client.force_authenticate(unbound)
        response = self.client.post(endpoint, {'token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_accept_correct_email_creates_canonical_membership_and_grants(self):
        invitation, token = self.make_invitation(email='PERSON@example.com')
        self.client.force_authenticate(self.invitee)
        response = self.client.post(
            reverse('myappLubd:tenant-invitation-accept'),
            {'token': token},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        membership = TenantMembership.objects.get(tenant=self.tenant, user=self.invitee)
        self.assertEqual(membership.role, 'technician')
        self.assertEqual(set(membership.properties.values_list('pk', flat=True)), {self.property.pk})
        self.assertEqual(
            set(get_accessible_properties(self.invitee).values_list('pk', flat=True)),
            {self.property.pk},
        )
        invitation.refresh_from_db()
        self.assertEqual(invitation.accepted_by, self.invitee)
        self.assertIsNotNone(invitation.accepted_at)

    def test_wrong_authenticated_email_is_rejected(self):
        _invitation, token = self.make_invitation()
        wrong = User.objects.create_user(username='wrong', email='wrong@example.com')
        AuthIdentity.objects.create(
            user=wrong, issuer='https://tenant.auth0.com/', subject='auth0|wrong',
        )
        self.client.force_authenticate(wrong)
        response = self.client.post(
            reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TenantMembership.objects.filter(tenant=self.tenant, user=wrong).exists())

    def test_expired_and_tampered_cross_tenant_invitations_cannot_be_accepted(self):
        expired, expired_token = self.make_invitation()
        expired.expires_at = timezone.now() - timedelta(seconds=1)
        expired.save(update_fields=['expires_at', 'updated_at'])
        self.client.force_authenticate(self.invitee)
        endpoint = reverse('myappLubd:tenant-invitation-accept')
        expired_response = self.client.post(endpoint, {'token': expired_token}, format='json')
        self.assertEqual(expired_response.status_code, status.HTTP_410_GONE)

        expired.revoked_at = timezone.now()
        expired.save(update_fields=['revoked_at', 'updated_at'])
        tampered, tampered_token = self.make_invitation()
        tampered.properties.add(self.other_property)
        tampered_response = self.client.post(endpoint, {'token': tampered_token}, format='json')
        self.assertEqual(tampered_response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(
            TenantMembership.objects.filter(tenant=self.tenant, user=self.invitee).exists(),
        )

    def test_repeated_accept_is_idempotent_without_duplicate_grants(self):
        _invitation, token = self.make_invitation()
        self.client.force_authenticate(self.invitee)
        endpoint = reverse('myappLubd:tenant-invitation-accept')
        first = self.client.post(endpoint, {'token': token}, format='json')
        second = self.client.post(endpoint, {'token': token}, format='json')
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(first.data['created'])
        self.assertFalse(second.data['created'])
        self.assertEqual(
            TenantMembership.objects.filter(tenant=self.tenant, user=self.invitee).count(), 1,
        )
        membership = TenantMembership.objects.get(tenant=self.tenant, user=self.invitee)
        self.assertEqual(membership.properties.through.objects.filter(
            tenantmembership=membership,
        ).count(), 1)

    def test_existing_matching_membership_accepts_but_role_or_grant_conflict_fails(self):
        matching = TenantMembership.objects.create(
            tenant=self.tenant, user=self.invitee, role='technician',
        )
        matching.properties.add(self.property)
        invitation, token = self.make_invitation()
        accepted, membership, created = accept_invitation(token=token, user=self.invitee)
        self.assertEqual(membership.pk, matching.pk)
        self.assertFalse(created)
        self.assertIsNotNone(accepted.accepted_at)

        other_invitee = User.objects.create_user(username='conflict', email='conflict@example.com')
        conflict_membership = TenantMembership.objects.create(
            tenant=self.other_tenant, user=other_invitee, role='viewer',
        )
        conflict_invitation, conflict_token = self.make_invitation(
            tenant=self.other_tenant,
            email=other_invitee.email,
            role='manager',
            properties=[],
        )
        with self.assertRaisesMessage(Exception, 'existing membership role'):
            accept_invitation(token=conflict_token, user=other_invitee)
        conflict_invitation.refresh_from_db()
        conflict_membership.refresh_from_db()
        self.assertIsNone(conflict_invitation.accepted_at)
        self.assertEqual(conflict_membership.role, 'viewer')

    def test_resend_invalidates_old_token_and_resets_expiry(self):
        invitation, old_token = self.make_invitation()
        old_expiry = invitation.expires_at
        captured = {}

        def capture(_invitation, token):
            captured['token'] = token
            return True

        self.client.force_authenticate(self.owner)
        with patch('myappLubd.invitations.send_invitation', side_effect=capture):
            response = self.client.post(reverse(
                'myappLubd:tenant-invitation-resend', kwargs={'pk': invitation.pk},
            ))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invitation.refresh_from_db()
        self.assertGreater(invitation.expires_at, old_expiry)
        self.assertFalse(invitation.matches_token(old_token))
        self.assertTrue(invitation.matches_token(captured['token']))

    def test_revoke_blocks_accept_and_accepted_invitation_cannot_be_revoked(self):
        invitation, token = self.make_invitation()
        self.client.force_authenticate(self.owner)
        revoke_url = reverse('myappLubd:tenant-invitation-revoke', kwargs={'pk': invitation.pk})
        response = self.client.post(revoke_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.invitee)
        blocked = self.client.post(
            reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json',
        )
        self.assertEqual(blocked.status_code, status.HTTP_410_GONE)

        accepted_invitation, accepted_token = self.make_invitation(email='other@example.com')
        accepted_user = User.objects.create_user(username='accepted', email='other@example.com')
        AuthIdentity.objects.create(
            user=accepted_user, issuer='https://tenant.auth0.com/', subject='auth0|accepted',
        )
        accept_invitation(token=accepted_token, user=accepted_user)
        self.client.force_authenticate(self.owner)
        rejected = self.client.post(reverse(
            'myappLubd:tenant-invitation-revoke', kwargs={'pk': accepted_invitation.pk},
        ))
        self.assertEqual(rejected.status_code, status.HTTP_409_CONFLICT)


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row-lock semantics.')
class TenantInvitationConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = User.objects.create_user(username='owner', email='owner@example.com')
        self.invitee = User.objects.create_user(username='invitee', email='person@example.com')
        self.tenant = Tenant.objects.create(name='Concurrent Tenant')
        self.property = Property.objects.create(name='Concurrent Hotel', tenant=self.tenant)
        TenantMembership.objects.create(tenant=self.tenant, user=self.owner, role='owner')
        self.invitation, self.token = create_invitation(
            tenant=self.tenant,
            email=self.invitee.email,
            role='technician',
            properties=[self.property],
            invited_by=self.owner,
        )

    def test_simultaneous_acceptance_returns_one_authoritative_membership(self):
        barrier = Barrier(2)

        def accept_once():
            close_old_connections()
            try:
                user = User.objects.get(pk=self.invitee.pk)
                barrier.wait()
                result = accept_invitation(token=self.token, user=user)
                return result[1].pk
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            membership_ids = list(executor.map(lambda _value: accept_once(), range(2)))

        self.assertEqual(len(set(membership_ids)), 1)
        self.assertEqual(
            TenantMembership.objects.filter(tenant=self.tenant, user=self.invitee).count(), 1,
        )
        membership = TenantMembership.objects.get(tenant=self.tenant, user=self.invitee)
        self.assertEqual(membership.properties.count(), 1)

    def test_database_rejects_duplicate_unresolved_normalized_email(self):
        duplicate = TenantInvitation(
            tenant=self.tenant,
            email=self.invitation.email.upper(),
            role='technician',
            invited_by=self.owner,
            expires_at=timezone.now() + timedelta(days=1),
        )
        duplicate.issue_token()
        with self.assertRaises(IntegrityError):
            duplicate.save()
