from django.contrib.admin.sites import AdminSite
from django.test import TestCase

from .admin import AuthIdentityAdmin, UserAdmin, UserProfileAdmin, UserProfileInline
from .auth import Auth0JWTAuthentication
from .models import AuthIdentity, Property, Tenant, TenantMembership, User, UserProfile


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


class UserProfileAdminDisplayTests(TestCase):
    def test_profile_admin_and_object_label_use_human_user_name(self):
        user = User.objects.create_user(
            username='google-oauth2_110208545241072621955',
            email='person@example.com',
            first_name='Person',
            last_name='Example',
        )
        profile = user.userprofile
        model_admin = UserProfileAdmin(UserProfile, AdminSite())

        self.assertEqual(model_admin.user_link(profile), 'Person Example')
        self.assertEqual(str(profile), "Person Example's Profile")

    def test_user_change_inline_uses_canonical_property_and_identity_data(self):
        user = User.objects.create_user(username='profile-inline', email='person@example.com')
        tenant = Tenant.objects.create(name='Profile Inline Tenant')
        property_obj = Property.objects.create(
            tenant=tenant,
            property_id='P-INLINE',
            name='Siam',
        )
        membership = TenantMembership.objects.create(
            tenant=tenant,
            user=user,
            role='technician',
        )
        membership.properties.add(property_obj)
        AuthIdentity.objects.create(
            user=user,
            issuer='https://tenant.auth0.com/',
            subject='google-oauth2|12345',
            email_at_link=user.email,
        )
        inline = UserProfileInline(User, AdminSite())

        self.assertEqual(inline.accessible_property_names(user.userprofile), 'Siam')
        self.assertEqual(inline.accessible_property_ids(user.userprofile), 'P-INLINE')
        self.assertEqual(inline.auth_provider(user.userprofile), 'Google')
        self.assertIs(inline.auth_email_verified(user.userprofile), True)
        self.assertNotIn('google_id', inline.fields)
        self.assertNotIn('property_name', inline.fields)


class UserAdminPropertyDisplayTests(TestCase):
    def test_changelist_uses_human_name_instead_of_raw_oauth_username(self):
        user = User.objects.create_user(
            username='google-oauth2_110208545241072621955',
            email='person@example.com',
            first_name='Khemasak',
            last_name='Kanthong',
        )
        model_admin = UserAdmin(User, AdminSite())

        self.assertEqual(model_admin.user_display(user), 'Khemasak Kanthong')
        self.assertEqual(model_admin.list_display[0], 'user_display')
        self.assertNotIn('username', model_admin.list_display)
        self.assertIn('username', model_admin.search_fields)

    def test_change_form_displays_canonical_accessible_property_names_and_ids(self):
        user = User.objects.create_user(username='property-user')
        tenant = Tenant.objects.create(name='Property Display Tenant')
        siam = Property.objects.create(
            tenant=tenant,
            property_id='P-SIAM',
            name='Siam',
        )
        test_property = Property.objects.create(
            tenant=tenant,
            property_id='P-TEST',
            name='test',
        )
        membership = TenantMembership.objects.create(
            tenant=tenant,
            user=user,
            role='technician',
        )
        membership.properties.add(siam, test_property)
        model_admin = UserAdmin(User, AdminSite())

        self.assertEqual(model_admin.accessible_property_names(user), 'Siam, test')
        self.assertEqual(model_admin.accessible_property_ids(user), 'P-SIAM, P-TEST')
        self.assertIn('accessible_property_names', model_admin.readonly_fields)
        self.assertIn('accessible_property_ids', model_admin.readonly_fields)
