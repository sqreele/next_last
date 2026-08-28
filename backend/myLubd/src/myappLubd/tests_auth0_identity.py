from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework import exceptions
from unittest.mock import patch

from .auth import Auth0JWTAuthentication
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
        resolved = self.authentication._get_or_create_user_from_claims(self.claims())
        identity = AuthIdentity.objects.get()
        self.assertEqual(resolved, self.user)
        self.assertEqual(identity.user, self.user)
        self.assertEqual(identity.issuer, self.claims()['iss'])
        self.assertEqual(identity.subject, self.claims()['sub'])
        self.assertEqual(identity.email_at_link, self.user.email)

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
        with self.assertRaises(exceptions.AuthenticationFailed):
            self.authentication._get_or_create_user_from_claims(self.claims(email='unknown@example.com'))
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
