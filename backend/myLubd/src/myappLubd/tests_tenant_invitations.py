from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.db.models.deletion import ProtectedError
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory, APITestCase

from .invitations import (
    InvitationAuth0JWTAuthentication,
    InvitationConflict,
    accept_invitation,
    create_invitation,
    invitation_from_token,
    send_invitation,
)
from .models import (
    AuthIdentity,
    Property,
    SubscriptionPlan,
    Tenant,
    TenantInvitation,
    TenantMembership,
    TenantSubscription,
)
from .tenancy import can_manage_membership_property_grants, get_accessible_properties
from .throttles import InvitationPreviewThrottle


User = get_user_model()
ISSUER = 'https://tenant.auth0.com/'


@override_settings(
    AUTH0_DOMAIN='tenant.auth0.com',
    AUTH0_ISSUER=ISSUER,
    AUTH0_AUDIENCE='https://api.staymaint.com',
    AUTH0_CLAIM_NAMESPACE='https://staymaint.com',
    FRONTEND_BASE_URL='https://staymaint.com',
)
class TenantInvitationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.owner = self.make_user('owner', 'owner@example.com')
        self.admin = self.make_user('admin', 'admin@example.com')
        self.manager = self.make_user('manager', 'manager@example.com')
        self.supervisor = self.make_user('supervisor', 'supervisor@example.com')
        self.billing = self.make_user('billing', 'billing@example.com')
        self.invitee = self.make_user('invitee', 'person@example.com')
        self.identity = AuthIdentity.objects.create(
            user=self.invitee,
            issuer=ISSUER,
            subject='auth0|invitee',
            email_at_link=self.invitee.email,
        )
        self.tenant = Tenant.objects.create(name='Invitation Tenant')
        self.other_tenant = Tenant.objects.create(name='Other Tenant')
        self.plan = SubscriptionPlan.objects.create(
            code='invitation-test',
            name='Invitation Test',
            max_users=20,
        )
        TenantSubscription.objects.create(
            tenant=self.tenant,
            plan=self.plan,
            status='active',
        )
        TenantSubscription.objects.create(
            tenant=self.other_tenant,
            plan=self.plan,
            status='active',
        )
        self.property = Property.objects.create(name='Invitation Hotel', tenant=self.tenant)
        self.other_property = Property.objects.create(name='Other Hotel', tenant=self.other_tenant)
        for user, role in (
            (self.owner, 'owner'),
            (self.admin, 'admin'),
            (self.manager, 'manager'),
            (self.supervisor, 'supervisor'),
            (self.billing, 'billing'),
        ):
            TenantMembership.objects.create(tenant=self.tenant, user=user, role=role)

    @staticmethod
    def make_user(username, email, **kwargs):
        return User.objects.create_user(username=username, email=email, password='pw12345!', **kwargs)

    @staticmethod
    def claims(user, subject=None, **overrides):
        values = {
            'iss': ISSUER,
            'sub': subject or f'auth0|{user.username}',
            'email': user.email,
            'email_verified': True,
        }
        values.update(overrides)
        return values

    def authenticate_auth0(self, user, **claim_overrides):
        subject = AuthIdentity.objects.filter(user=user).values_list('subject', flat=True).first()
        self.client.force_authenticate(
            user=user,
            token=self.claims(user, subject=subject, **claim_overrides),
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

    def accept_direct(self, token, user=None, **claim_overrides):
        user = user or self.invitee
        subject = AuthIdentity.objects.filter(user=user).values_list('subject', flat=True).first()
        return accept_invitation(
            token=token,
            user=user,
            identity_claims=self.claims(user, subject=subject, **claim_overrides),
        )

    def test_plaintext_token_is_never_stored_or_returned(self):
        invitation, token = self.make_invitation()
        invitation.refresh_from_db()
        self.assertNotEqual(invitation.token_hash, token)
        self.assertNotIn(token, invitation.token_hash)
        self.assertTrue(invitation.matches_token(token))
        self.assertFalse(invitation.matches_token(f'{token}wrong'))
        self.assertEqual(invitation_from_token(token).pk, invitation.pk)

    @patch('myappLubd.invitations.send_invitation', return_value=True)
    def test_owner_and_admin_can_create(self, _send):
        endpoint = reverse('myappLubd:tenant-invitation-list')
        for actor, email in ((self.owner, 'owner.invite@example.com'), (self.admin, 'admin.invite@example.com')):
            with self.subTest(role=actor.username):
                self.client.force_authenticate(actor)
                response = self.client.post(endpoint, {
                    'tenant': self.tenant.pk,
                    'email': email.upper(),
                    'role': 'technician',
                    'properties': [self.property.pk],
                }, format='json')
                self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
                self.assertNotIn('token', response.data)
                self.assertNotIn('token_hash', response.data)

    @patch('myappLubd.invitations.send_invitation', return_value=False)
    def test_email_failure_preserves_invitation_without_exposing_token(self, _send):
        self.client.force_authenticate(self.owner)
        response = self.client.post(reverse('myappLubd:tenant-invitation-list'), {
            'tenant': self.tenant.pk,
            'email': 'delivery.failure@example.com',
            'role': 'technician',
            'properties': [self.property.pk],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['email_sent'])
        self.assertNotIn('token', response.data)
        self.assertTrue(TenantInvitation.objects.filter(email='delivery.failure@example.com').exists())

    @patch('myappLubd.invitations.send_invitation', return_value=True)
    def test_unauthorized_roles_cannot_create_or_list(self, _send):
        endpoint = reverse('myappLubd:tenant-invitation-list')
        for actor in (self.manager, self.supervisor, self.billing):
            with self.subTest(role=actor.username):
                self.client.force_authenticate(actor)
                response = self.client.post(endpoint, {
                    'tenant': self.tenant.pk,
                    'email': f'{actor.username}.invite@example.com',
                    'role': 'technician',
                    'properties': [self.property.pk],
                }, format='json')
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                listed = self.client.get(endpoint)
                self.assertEqual(listed.status_code, status.HTTP_200_OK)
                self.assertEqual(listed.data, [])
        self.assertTrue(can_manage_membership_property_grants(self.owner, self.tenant))
        self.assertTrue(can_manage_membership_property_grants(self.admin, self.tenant))
        self.assertFalse(can_manage_membership_property_grants(self.manager, self.tenant))
        self.assertFalse(can_manage_membership_property_grants(self.billing, self.tenant))

    @patch('myappLubd.invitations.send_invitation', return_value=True)
    def test_cross_tenant_property_injection_fails_closed(self, _send):
        self.client.force_authenticate(self.owner)
        response = self.client.post(reverse('myappLubd:tenant-invitation-list'), {
            'tenant': self.tenant.pk,
            'email': 'foreign.property@example.com',
            'role': 'technician',
            'properties': [self.other_property.pk],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(TenantInvitation.objects.filter(email='foreign.property@example.com').exists())

    def test_role_property_rules_are_enforced(self):
        with self.assertRaises(Exception):
            self.make_invitation(role='manager', properties=[self.property])
        with self.assertRaises(Exception):
            self.make_invitation(role='viewer', properties=[])

    def test_global_unresolved_email_uniqueness_is_documented_mvp_limit(self):
        self.make_invitation(email='Person@Example.com')
        with self.assertRaisesMessage(Exception, 'active invitation already exists'):
            self.make_invitation(
                tenant=self.other_tenant,
                email='person@example.com',
                properties=[self.other_property],
            )
        self.assertEqual(TenantInvitation.objects.count(), 1)

    def test_expired_invitation_is_revoked_when_replaced(self):
        old, _ = self.make_invitation()
        old.expires_at = timezone.now() - timedelta(seconds=1)
        old.save(update_fields=['expires_at', 'updated_at'])
        new, _ = self.make_invitation()
        old.refresh_from_db()
        self.assertIsNotNone(old.revoked_at)
        self.assertNotEqual(old.pk, new.pk)

    def test_invitation_preprovisions_no_authority(self):
        invitation, _ = self.make_invitation(email='new.person@example.com')
        user = User.objects.get(email='new.person@example.com')
        self.assertTrue(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertFalse(TenantMembership.objects.filter(user=user).exists())
        self.assertFalse(AuthIdentity.objects.filter(user=user).exists())
        self.assertEqual(invitation.status, 'pending')

    def test_preview_valid_expired_and_revoked(self):
        invitation, token = self.make_invitation()
        endpoint = reverse('myappLubd:tenant-invitation-preview')
        valid = self.client.post(endpoint, {'token': token}, format='json')
        self.assertEqual(valid.status_code, status.HTTP_200_OK)
        self.assertEqual(valid.data['status'], 'pending')
        self.assertNotIn('email', valid.data)
        self.assertNotIn(token, str(valid.data))

        invitation.expires_at = timezone.now() - timedelta(seconds=1)
        invitation.save(update_fields=['expires_at', 'updated_at'])
        self.assertEqual(self.client.post(endpoint, {'token': token}, format='json').data['status'], 'expired')
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=['revoked_at', 'updated_at'])
        self.assertEqual(self.client.post(endpoint, {'token': token}, format='json').data['status'], 'revoked')

    def test_no_query_token_or_token_route_support(self):
        _, token = self.make_invitation()
        preview = reverse('myappLubd:tenant-invitation-preview')
        self.assertEqual(self.client.get(preview, {'token': token}).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.authenticate_auth0(self.invitee)
        response = self.client.post(
            f"{reverse('myappLubd:tenant-invitation-accept')}?token={token}",
            {},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(TenantMembership.objects.filter(tenant=self.tenant, user=self.invitee).exists())

    @patch('myappLubd.invitations.send_email', return_value=True)
    def test_email_uses_fragment_and_staymaint_branding(self, send):
        invitation, token = self.make_invitation()
        self.assertTrue(send_invitation(invitation, token))
        args, kwargs = send.call_args
        combined = '\n'.join((args[1], args[2], kwargs['html_body']))
        self.assertIn('StayMaint', combined)
        self.assertIn(f'https://staymaint.com/invitations/accept#token={token}', combined)
        self.assertNotIn(f'?token={token}', combined)
        self.assertNotIn('HotelCare Pro', combined)
        self.assertNotIn('hotelcarepro.com', combined)

    def test_accept_requires_auth0_identity_verified_email_and_active_user(self):
        _, token = self.make_invitation()
        endpoint = reverse('myappLubd:tenant-invitation-accept')
        anonymous = self.client.post(endpoint, {'token': token}, format='json')
        self.assertIn(anonymous.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

        self.authenticate_auth0(self.invitee, email_verified=False)
        unverified = self.client.post(endpoint, {'token': token}, format='json')
        self.assertEqual(unverified.status_code, status.HTTP_403_FORBIDDEN)

        self.invitee.is_active = False
        self.invitee.save(update_fields=['is_active'])
        self.authenticate_auth0(self.invitee)
        inactive = self.client.post(endpoint, {'token': token}, format='json')
        self.assertEqual(inactive.status_code, status.HTTP_403_FORBIDDEN)

    def test_invitation_auth_adapter_reuses_verified_production_claims(self):
        claims = self.claims(self.invitee, subject=self.identity.subject)
        request = APIRequestFactory().post(
            '/api/v1/invitations/accept/',
            {},
            format='json',
            HTTP_AUTHORIZATION='Bearer opaque-token',
        )
        authentication = InvitationAuth0JWTAuthentication()
        with patch.object(authentication, '_validate_auth0_token', return_value=claims):
            user, request_claims = authentication.authenticate(request)
        self.assertEqual(user, self.invitee)
        self.assertIs(request_claims, claims)

    def test_accept_rejects_wrong_email_and_wrong_identity(self):
        _, token = self.make_invitation()
        wrong = self.make_user('wrong', 'wrong@example.com')
        AuthIdentity.objects.create(user=wrong, issuer=ISSUER, subject='auth0|wrong')
        self.authenticate_auth0(wrong)
        response = self.client.post(reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.authenticate_auth0(self.invitee, sub='auth0|not-the-bound-subject')
        response = self.client.post(reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TenantMembership.objects.filter(tenant=self.tenant, user=self.invitee).exists())

    def test_accept_creates_membership_and_property_grants_transactionally(self):
        invitation, token = self.make_invitation(email='PERSON@example.com')
        self.authenticate_auth0(self.invitee)
        response = self.client.post(reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        membership = TenantMembership.objects.get(tenant=self.tenant, user=self.invitee)
        self.assertEqual(membership.role, 'technician')
        self.assertEqual(set(membership.properties.values_list('pk', flat=True)), {self.property.pk})
        self.assertEqual(set(get_accessible_properties(self.invitee).values_list('pk', flat=True)), {self.property.pk})
        invitation.refresh_from_db()
        self.assertEqual(invitation.accepted_by, self.invitee)
        self.assertIsNotNone(invitation.accepted_at)

    def test_accept_below_user_limit_succeeds(self):
        self.plan.max_users = 6
        self.plan.save(update_fields=['max_users'])
        _, token = self.make_invitation()

        self.authenticate_auth0(self.invitee)
        response = self.client.post(
            reverse('myappLubd:tenant-invitation-accept'),
            {'token': token},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(TenantMembership.objects.filter(
            tenant=self.tenant, user=self.invitee, is_active=True,
        ).exists())

    def test_accept_at_user_limit_returns_numeric_409_without_consuming_invitation(self):
        self.plan.max_users = 5
        self.plan.save(update_fields=['max_users'])
        invitation, token = self.make_invitation()

        self.authenticate_auth0(self.invitee)
        response = self.client.post(
            reverse('myappLubd:tenant-invitation-accept'),
            {'token': token},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        self.assertEqual(response.data, {
            'code': 'subscription_user_limit_reached',
            'detail': 'Your current plan allows up to 5 users.',
            'limit': 5,
        })
        self.assertIsInstance(response.data['limit'], int)
        invitation.refresh_from_db()
        self.assertIsNone(invitation.accepted_at)
        self.assertIsNone(invitation.accepted_by_id)
        self.assertFalse(TenantMembership.objects.filter(
            tenant=self.tenant, user=self.invitee,
        ).exists())

    def test_cross_tenant_tampering_rolls_back_acceptance(self):
        invitation, token = self.make_invitation()
        invitation.properties.add(self.other_property)
        self.authenticate_auth0(self.invitee)
        response = self.client.post(reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        invitation.refresh_from_db()
        self.assertIsNone(invitation.accepted_at)
        self.assertFalse(TenantMembership.objects.filter(tenant=self.tenant, user=self.invitee).exists())

    def test_exact_duplicate_acceptance_is_idempotent(self):
        _, token = self.make_invitation()
        self.authenticate_auth0(self.invitee)
        endpoint = reverse('myappLubd:tenant-invitation-accept')
        first = self.client.post(endpoint, {'token': token}, format='json')
        second = self.client.post(endpoint, {'token': token}, format='json')
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(first.data['created'])
        self.assertFalse(second.data['created'])
        self.assertEqual(TenantMembership.objects.filter(tenant=self.tenant, user=self.invitee).count(), 1)

    def test_conflicting_membership_returns_409_and_preserves_state(self):
        membership = TenantMembership.objects.create(tenant=self.tenant, user=self.invitee, role='viewer')
        membership.properties.add(self.property)
        invitation, token = self.make_invitation()
        self.authenticate_auth0(self.invitee)
        response = self.client.post(reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        invitation.refresh_from_db()
        membership.refresh_from_db()
        self.assertIsNone(invitation.accepted_at)
        self.assertEqual(membership.role, 'viewer')

    def test_resend_revoke_and_cross_tenant_idor(self):
        invitation, old_token = self.make_invitation()
        captured = {}

        def capture(_invitation, token):
            captured['token'] = token
            return True

        self.client.force_authenticate(self.admin)
        with patch('myappLubd.invitations.send_invitation', side_effect=capture):
            resend = self.client.post(reverse('myappLubd:tenant-invitation-resend', kwargs={'pk': invitation.pk}))
        self.assertEqual(resend.status_code, status.HTTP_200_OK)
        invitation.refresh_from_db()
        self.assertFalse(invitation.matches_token(old_token))
        self.assertTrue(invitation.matches_token(captured['token']))

        outsider = self.make_user('outsider-owner', 'outsider@example.com')
        TenantMembership.objects.create(tenant=self.other_tenant, user=outsider, role='owner')
        self.client.force_authenticate(outsider)
        for action in ('resend', 'revoke'):
            response = self.client.post(reverse(f'myappLubd:tenant-invitation-{action}', kwargs={'pk': invitation.pk}))
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.owner)
        revoked = self.client.post(reverse('myappLubd:tenant-invitation-revoke', kwargs={'pk': invitation.pk}))
        self.assertEqual(revoked.status_code, status.HTTP_200_OK)
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, 'revoked')

    def test_accepted_invitation_cannot_be_resent_or_revoked(self):
        invitation, token = self.make_invitation()
        self.accept_direct(token)
        self.client.force_authenticate(self.owner)
        for action in ('resend', 'revoke'):
            response = self.client.post(reverse(
                f'myappLubd:tenant-invitation-{action}',
                kwargs={'pk': invitation.pk},
            ))
            self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_accepted_by_is_protected(self):
        invitation, token = self.make_invitation()
        self.accept_direct(token)
        with self.assertRaises(ProtectedError):
            self.invitee.delete()
        invitation.refresh_from_db()
        self.assertEqual(invitation.accepted_by_id, self.invitee.pk)

    def test_token_never_appears_in_audit_logs(self):
        _, token = self.make_invitation()
        self.authenticate_auth0(self.invitee)
        with self.assertLogs('myappLubd.invitation_audit', level='INFO') as captured:
            response = self.client.post(reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(token, '\n'.join(captured.output))

    def test_existing_matching_membership_accepts_without_mutation(self):
        membership = TenantMembership.objects.create(tenant=self.tenant, user=self.invitee, role='technician')
        membership.properties.add(self.property)
        invitation, token = self.make_invitation()
        accepted, returned, created = self.accept_direct(token)
        self.assertEqual(returned.pk, membership.pk)
        self.assertFalse(created)
        self.assertIsNotNone(accepted.accepted_at)

    def test_expired_and_revoked_invitations_cannot_be_accepted(self):
        invitation, token = self.make_invitation()
        invitation.expires_at = timezone.now() - timedelta(seconds=1)
        invitation.save(update_fields=['expires_at', 'updated_at'])
        self.authenticate_auth0(self.invitee)
        endpoint = reverse('myappLubd:tenant-invitation-accept')
        self.assertEqual(self.client.post(endpoint, {'token': token}, format='json').status_code, status.HTTP_410_GONE)
        invitation.revoked_at = timezone.now()
        invitation.expires_at = timezone.now() + timedelta(days=1)
        invitation.save(update_fields=['revoked_at', 'expires_at', 'updated_at'])
        self.assertEqual(self.client.post(endpoint, {'token': token}, format='json').status_code, status.HTTP_410_GONE)

    def test_matching_identity_with_changed_signed_email_cannot_relink(self):
        _, token = self.make_invitation()
        self.authenticate_auth0(self.invitee, email='changed@example.com')
        response = self.client.post(reverse('myappLubd:tenant-invitation-accept'), {'token': token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.invitee.refresh_from_db()
        self.assertEqual(self.invitee.email, 'person@example.com')

    def test_cache_failure_uses_process_local_throttle_fallback(self):
        request = APIRequestFactory().post('/api/v1/invitations/preview/', {}, format='json')
        request.user = AnonymousUser()
        throttle = InvitationPreviewThrottle()
        throttle.num_requests = 1
        with patch.object(throttle.cache, 'get', side_effect=RuntimeError('cache unavailable')):
            self.assertTrue(throttle.allow_request(request, None))
            self.assertFalse(throttle.allow_request(request, None))
            self.assertGreaterEqual(throttle.wait(), 0)
