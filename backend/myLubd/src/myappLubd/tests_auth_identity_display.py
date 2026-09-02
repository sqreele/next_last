from django.contrib.admin.sites import AdminSite
from django.test import TestCase

from .admin import AuthIdentityAdmin
from .auth import Auth0JWTAuthentication
from .models import AuthIdentity, User


class AuthIdentityDisplayTests(TestCase):
    issuer = 'https://tenant.auth0.com/'
    subject = 'google-oauth2_110208545241072621955'

    def make_identity(self, *, email='person@example.com', username='person'):
        user = User.objects.create_user(username=username, email=email)
        return AuthIdentity.objects.create(
            user=user,
            issuer=self.issuer,
            subject=self.subject,
        )

    def test_str_prefers_linked_user_email(self):
        identity = self.make_identity()

        self.assertEqual(str(identity), 'person@example.com')

    def test_str_and_admin_prefer_linked_user_full_name(self):
        identity = self.make_identity()
        identity.user.first_name = 'Person'
        identity.user.last_name = 'Example'
        identity.user.save(update_fields=['first_name', 'last_name'])
        model_admin = AuthIdentityAdmin(AuthIdentity, AdminSite())

        self.assertEqual(str(identity.user), 'Person Example')
        self.assertEqual(str(identity), 'Person Example')
        self.assertEqual(model_admin.user_display(identity), 'Person Example')

    def test_str_falls_back_to_username(self):
        identity = self.make_identity(email='', username='staff-username')

        self.assertEqual(str(identity), 'staff-username')
        self.assertEqual(
            AuthIdentityAdmin(AuthIdentity, AdminSite()).user_display(identity),
            'staff-username',
        )

    def test_str_falls_back_to_subject_without_user_label(self):
        user = User.objects.create_user(username='temporary-subject-fallback', email='')
        user.username = ''
        user.save(update_fields=['username'])
        identity = AuthIdentity.objects.create(
            user=user,
            issuer=self.issuer,
            subject=self.subject,
        )

        self.assertEqual(str(identity), self.subject)
        self.assertEqual(
            AuthIdentityAdmin(AuthIdentity, AdminSite()).user_display(identity),
            self.subject,
        )

    def test_admin_uses_human_labels_and_keeps_identity_fields_readonly(self):
        identity = self.make_identity()
        model_admin = AuthIdentityAdmin(AuthIdentity, AdminSite())

        self.assertEqual(model_admin.user_display(identity), 'person@example.com')
        self.assertEqual(model_admin.email_display(identity), 'person@example.com')
        self.assertNotIn('subject', model_admin.list_display)
        self.assertIn('issuer', model_admin.readonly_fields)
        self.assertIn('subject', model_admin.readonly_fields)

    def test_issuer_subject_still_define_authentication_lookup(self):
        identity = self.make_identity()

        resolved = Auth0JWTAuthentication._load_identity(self.issuer, self.subject)

        self.assertEqual(resolved.pk, identity.pk)
        self.assertEqual(resolved.issuer, self.issuer)
        self.assertEqual(resolved.subject, self.subject)
