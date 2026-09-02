from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework import exceptions
from unittest.mock import patch

from .auth import (
    Auth0JWTAuthentication,
    auth0_display_name_from_verified_claims,
    sync_user_display_profile_from_verified_claims,
)
from .invitations import create_invitation
from .models import AuthIdentity, Property, Tenant, TenantMembership
from .tenancy import get_accessible_properties


User = get_user_model()


@override_settings(AUTH0_CLAIM_NAMESPACE='https://staymaint.com')
class Auth0IdentityBindingTests(TestCase):
    def setUp(self):
        self.authentication = Auth0JWTAuthentication()
        self.user = User.objects.create_user(username='existing-user', email='person@example.com')

    def claims(self, **overrides):
        claims = {
            'iss': 'https://staymaint.ca.auth0.com/',
            'sub': 'auth0|123',
            'email': self.user.email,
            'email_verified': True,
        }
        claims.update(overrides)
        return claims

    def test_first_verified_login_links_existing_user(self):
        claims = self.claims(given_name='Person', family_name='Example')
        resolved = self.authentication._get_or_create_user_from_claims(claims)
        identity = AuthIdentity.objects.get()
        resolved.refresh_from_db()
        self.assertEqual(resolved, self.user)
        self.assertEqual(resolved.first_name, 'Person')
        self.assertEqual(resolved.last_name, 'Example')
        self.assertEqual(identity.user, self.user)
        self.assertEqual(identity.issuer, claims['iss'])
        self.assertEqual(identity.subject, claims['sub'])
        self.assertEqual(identity.email_at_link, self.user.email)

    def test_structured_names_fill_blanks_without_overwriting_existing_names(self):
        self.user.first_name = 'Administrator'
        self.user.save(update_fields=['first_name'])

        self.authentication._get_or_create_user_from_claims(
            self.claims(given_name='Provider', family_name='Family')
        )

        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Administrator')
        self.assertEqual(self.user.last_name, 'Family')

    def test_existing_last_name_is_preserved_while_blank_first_name_is_filled(self):
        self.user.last_name = 'Administrator'
        self.user.save(update_fields=['last_name'])

        self.authentication._get_or_create_user_from_claims(
            self.claims(given_name='Provider', family_name='Family')
        )

        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Provider')
        self.assertEqual(self.user.last_name, 'Administrator')

    def test_unstructured_claims_and_subject_are_not_persisted_as_names(self):
        subject = 'google-oauth2_110208545241072621955'

        self.authentication._get_or_create_user_from_claims(
            self.claims(
                sub=subject,
                preferred_username='Friendly',
                name='Friendly Person',
                nickname='friend',
            )
        )

        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'existing-user')
        self.assertEqual(self.user.first_name, '')
        self.assertEqual(self.user.last_name, '')
        self.assertNotEqual(self.user.username, subject)

    def test_subject_shaped_structured_name_is_ignored(self):
        subject = 'google-oauth2_110208545241072621955'

        self.authentication._get_or_create_user_from_claims(
            self.claims(sub=subject, given_name=subject, family_name='Example')
        )

        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, '')
        self.assertEqual(self.user.last_name, 'Example')

    def test_namespaced_structured_names_are_supported_and_truncated(self):
        self.authentication._get_or_create_user_from_claims(
            self.claims(
                **{
                    'https://staymaint.com/given_name': '  Person   Name  ',
                    'https://staymaint.com/family_name': 'F' * 200,
                },
            )
        )

        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Person Name')
        self.assertEqual(self.user.last_name, 'F' * 150)

    def test_display_name_claim_priority_and_email_local_part_fallback(self):
        claims = self.claims(
            preferred_username='preferred',
            name='Full Name',
            nickname='nickname',
            given_name='Given',
        )
        priorities = (
            ('preferred', claims),
            ('Full Name', {**claims, 'preferred_username': ''}),
            ('nickname', {**claims, 'preferred_username': '', 'name': ''}),
            ('Given', {**claims, 'preferred_username': '', 'name': '', 'nickname': ''}),
            (
                'person',
                {
                    **claims,
                    'preferred_username': '',
                    'name': '',
                    'nickname': '',
                    'given_name': '',
                },
            ),
        )
        for expected, candidate_claims in priorities:
            with self.subTest(expected=expected):
                self.assertEqual(
                    auth0_display_name_from_verified_claims(candidate_claims),
                    expected,
                )

    def test_display_name_never_falls_back_to_subject(self):
        subject = 'google-oauth2_110208545241072621955'
        claims = self.claims(
            sub=subject,
            email='',
            preferred_username=subject,
            name='',
            nickname='',
            given_name='',
        )

        self.assertEqual(auth0_display_name_from_verified_claims(claims), '')

    def test_provider_identifiers_are_rejected_without_rejecting_human_names(self):
        for provider_identifier in (
            'google-oauth2_110208545241072621955',
            'auth0|abc123',
            'github|12345',
        ):
            with self.subTest(provider_identifier=provider_identifier):
                claims = self.claims(
                    sub='different|subject',
                    email='',
                    preferred_username=provider_identifier,
                    given_name=provider_identifier,
                )
                self.assertEqual(auth0_display_name_from_verified_claims(claims), '')
                self.assertEqual(
                    sync_user_display_profile_from_verified_claims(self.user, claims),
                    [],
                )

        self.assertEqual(
            auth0_display_name_from_verified_claims(
                self.claims(preferred_username='Anne-Marie 2')
            ),
            'Anne-Marie 2',
        )

    def test_profile_sync_does_not_save_when_fields_do_not_change(self):
        self.user.first_name = 'Existing'
        self.user.last_name = 'Person'
        self.user.save(update_fields=['first_name', 'last_name'])

        with patch.object(self.user, 'save') as save:
            changed_fields = sync_user_display_profile_from_verified_claims(
                self.user,
                self.claims(given_name='Provider', family_name='Name'),
            )

        self.assertEqual(changed_fields, [])
        save.assert_not_called()

    def test_profile_sync_saves_only_changed_fields(self):
        with patch.object(self.user, 'save', wraps=self.user.save) as save:
            changed_fields = sync_user_display_profile_from_verified_claims(
                self.user,
                self.claims(given_name='Person', family_name='Example'),
            )

        self.assertEqual(changed_fields, ['first_name', 'last_name'])
        save.assert_called_once_with(update_fields=['first_name', 'last_name'])

    def test_verified_invitee_login_links_identity_without_granting_access(self):
        owner = User.objects.create_user(username='owner', email='owner@example.com')
        tenant = Tenant.objects.create(name='Invited Identity Tenant')
        property_obj = Property.objects.create(name='Invited Identity Property', tenant=tenant)
        invitation, _ = create_invitation(
            tenant=tenant,
            email='invited.person@example.com',
            role='supervisor',
            properties=[property_obj],
            invited_by=owner,
        )
        invited_user = User.objects.get(email='invited.person@example.com')
        claims = self.claims(
            email=invited_user.email,
            sub='auth0|invited-person',
        )

        self.assertFalse(AuthIdentity.objects.filter(user=invited_user).exists())
        self.assertFalse(TenantMembership.objects.filter(user=invited_user).exists())
        self.assertFalse(get_accessible_properties(invited_user).exists())

        first = self.authentication._get_or_create_user_from_claims(claims)
        repeated = self.authentication._get_or_create_user_from_claims(claims)

        invitation.refresh_from_db()
        self.assertEqual(first, invited_user)
        self.assertEqual(repeated, invited_user)
        self.assertEqual(
            AuthIdentity.objects.filter(
                user=invited_user,
                issuer=claims['iss'],
                subject=claims['sub'],
            ).count(),
            1,
        )
        self.assertEqual(invitation.status, 'pending')
        self.assertIsNone(invitation.accepted_at)
        self.assertIsNone(invitation.accepted_by)
        self.assertFalse(TenantMembership.objects.filter(user=invited_user).exists())
        self.assertFalse(get_accessible_properties(invited_user).exists())

    def test_existing_binding_does_not_require_email_or_relink(self):
        AuthIdentity.objects.create(
            user=self.user,
            issuer=self.claims()['iss'],
            subject=self.claims()['sub'],
            email_at_link=self.user.email,
        )
        resolved = self.authentication._get_or_create_user_from_claims(
            self.claims(email=None, email_verified=False)
        )
        self.assertEqual(resolved, self.user)
        self.assertEqual(AuthIdentity.objects.get().user, self.user)

    def test_existing_binding_wins_over_changed_or_other_user_email(self):
        other = User.objects.create_user(username='other-user', email='other@example.com')
        AuthIdentity.objects.create(
            user=self.user,
            issuer=self.claims()['iss'],
            subject=self.claims()['sub'],
            email_at_link=self.user.email,
        )
        resolved = self.authentication._get_or_create_user_from_claims(
            self.claims(email=other.email, email_verified=True)
        )
        self.assertEqual(resolved, self.user)
        self.assertEqual(AuthIdentity.objects.get().user, self.user)

    def test_missing_email_is_rejected_without_binding(self):
        with self.assertRaisesMessage(exceptions.AuthenticationFailed, 'A verified email address is required.'):
            self.authentication._get_or_create_user_from_claims(self.claims(email=None))
        self.assertEqual(AuthIdentity.objects.count(), 0)

    def test_unverified_email_is_rejected_without_binding(self):
        with self.assertRaisesMessage(exceptions.AuthenticationFailed, 'Email address is not verified.'):
            self.authentication._get_or_create_user_from_claims(self.claims(email_verified=False))
        self.assertEqual(AuthIdentity.objects.count(), 0)

    def test_string_true_is_not_verified(self):
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authentication._get_or_create_user_from_claims(self.claims(email_verified='true'))

    def test_unknown_email_does_not_create_user_or_binding(self):
        with self.assertRaises(exceptions.AuthenticationFailed) as raised:
            self.authentication._get_or_create_user_from_claims(self.claims(email='unknown@example.com'))
        self.assertEqual(raised.exception.get_codes(), 'account_not_registered')
        self.assertIn('No account is registered', str(raised.exception.detail))
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(AuthIdentity.objects.count(), 0)

    def test_duplicate_email_fails_closed(self):
        User.objects.create_user(username='duplicate', email=self.user.email.upper())
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authentication._get_or_create_user_from_claims(self.claims())
        self.assertEqual(AuthIdentity.objects.count(), 0)

    def test_missing_issuer_or_subject_is_rejected(self):
        for key in ('iss', 'sub'):
            with self.subTest(key=key), self.assertRaises(exceptions.AuthenticationFailed):
                self.authentication._get_or_create_user_from_claims(self.claims(**{key: ''}))

    def test_issuer_and_subject_define_distinct_identities(self):
        self.authentication._get_or_create_user_from_claims(self.claims())
        self.authentication._get_or_create_user_from_claims(
            self.claims(iss='https://other.auth0.com/', sub='auth0|123')
        )
        self.authentication._get_or_create_user_from_claims(
            self.claims(iss=self.claims()['iss'], sub='auth0|456')
        )
        self.assertEqual(AuthIdentity.objects.count(), 3)

    def test_duplicate_issuer_subject_is_rejected_by_database(self):
        AuthIdentity.objects.create(
            user=self.user,
            issuer=self.claims()['iss'],
            subject=self.claims()['sub'],
        )
        with self.assertRaises(IntegrityError):
            AuthIdentity.objects.create(
                user=self.user,
                issuer=self.claims()['iss'],
                subject=self.claims()['sub'],
            )

    def test_first_link_integrity_race_reloads_authoritative_binding(self):
        AuthIdentity.objects.create(
            user=self.user,
            issuer=self.claims()['iss'],
            subject=self.claims()['sub'],
        )
        with patch.object(AuthIdentity.objects, 'create', side_effect=IntegrityError), patch.object(
            self.authentication,
            '_load_identity',
            side_effect=[None, AuthIdentity.objects.get(), AuthIdentity.objects.get()],
        ):
            resolved = self.authentication._get_or_create_user_from_claims(self.claims())
        self.assertEqual(resolved, self.user)
        self.assertEqual(AuthIdentity.objects.filter(issuer=self.claims()['iss'], subject=self.claims()['sub']).count(), 1)

    def test_first_link_integrity_race_fails_if_binding_belongs_to_different_user(self):
        other = User.objects.create_user(username='race-winner', email='winner@example.com')
        AuthIdentity.objects.create(
            user=other,
            issuer=self.claims()['iss'],
            subject=self.claims()['sub'],
        )
        with patch.object(AuthIdentity.objects, 'create', side_effect=IntegrityError), patch.object(
            self.authentication,
            '_load_identity',
            side_effect=[None, AuthIdentity.objects.get(), AuthIdentity.objects.get()],
        ):
            with self.assertRaisesMessage(exceptions.AuthenticationFailed, 'Identity binding conflict.'):
                self.authentication._get_or_create_user_from_claims(self.claims())
        self.assertEqual(AuthIdentity.objects.get().user_id, other.pk)
        self.assertEqual(AuthIdentity.objects.count(), 1)

    def test_identity_resolution_does_not_broaden_property_access(self):
        tenant_a = Tenant.objects.create(name='Identity Tenant A')
        tenant_b = Tenant.objects.create(name='Identity Tenant B')
        property_a = Property.objects.create(name='Identity Property A', tenant=tenant_a)
        property_b = Property.objects.create(name='Identity Property B', tenant=tenant_b)
        TenantMembership.objects.create(user=self.user, tenant=tenant_a, role='viewer').properties.add(property_a)
        resolved = self.authentication._get_or_create_user_from_claims(self.claims())
        accessible = get_accessible_properties(resolved)
        self.assertEqual(set(accessible.values_list('pk', flat=True)), {property_a.pk})
        self.assertNotIn(property_b.pk, set(accessible.values_list('pk', flat=True)))

    def test_inactive_bound_user_is_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        AuthIdentity.objects.create(
            user=self.user,
            issuer=self.claims()['iss'],
            subject=self.claims()['sub'],
        )
        with self.assertRaisesMessage(exceptions.AuthenticationFailed, 'This account is inactive.'):
            self.authentication._get_or_create_user_from_claims(self.claims())

    def test_inactive_unbound_user_is_rejected_without_binding(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        with self.assertRaisesMessage(exceptions.AuthenticationFailed, 'This account is inactive.'):
            self.authentication._get_or_create_user_from_claims(self.claims())
        self.assertFalse(AuthIdentity.objects.exists())

    def test_namespaced_verified_claims_are_supported(self):
        resolved = self.authentication._get_or_create_user_from_claims(
            self.claims(
                email=None,
                email_verified=None,
                **{
                    'https://staymaint.com/email': self.user.email,
                    'https://staymaint.com/email_verified': True,
                },
            )
        )
        self.assertEqual(resolved, self.user)
