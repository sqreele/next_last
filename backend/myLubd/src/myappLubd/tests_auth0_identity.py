from django.contrib.auth import get_user_model
from django.test import TestCase

from .auth import Auth0JWTAuthentication
from .models import Property


User = get_user_model()


class Auth0IdentityMatchingTests(TestCase):
    def setUp(self):
        self.authentication = Auth0JWTAuthentication()

    def test_verified_namespaced_email_reuses_existing_user_and_access(self):
        existing_user = User.objects.create_user(
            username='existing-user',
            email='existing@example.com',
        )
        property_obj = Property.objects.create(name='Existing Hotel')
        property_obj.users.add(existing_user)

        authenticated_user = self.authentication._get_or_create_user_from_claims(
            {
                'sub': 'auth0|new-tenant-identity',
                'https://hotelcarepro.com/email': 'existing@example.com',
                'https://hotelcarepro.com/email_verified': True,
            }
        )

        self.assertEqual(authenticated_user.pk, existing_user.pk)
        self.assertTrue(property_obj.users.filter(pk=existing_user.pk).exists())
        self.assertEqual(User.objects.count(), 1)

    def test_unverified_namespaced_email_does_not_merge_accounts(self):
        existing_user = User.objects.create_user(
            username='existing-user',
            email='existing@example.com',
        )

        authenticated_user = self.authentication._get_or_create_user_from_claims(
            {
                'sub': 'auth0|different-identity',
                'https://hotelcarepro.com/email': 'existing@example.com',
                'https://hotelcarepro.com/email_verified': False,
            }
        )

        self.assertNotEqual(authenticated_user.pk, existing_user.pk)
        self.assertEqual(authenticated_user.email, '')
        self.assertEqual(User.objects.count(), 2)
