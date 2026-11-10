from django.contrib.auth import get_user_model
from django.test import TestCase

from .serializers import UserReadSerializer, UserSerializer, UserWriteSerializer


class UserSerializerContractTests(TestCase):
    def test_user_creation_hashes_password_and_creates_profile(self):
        serializer = UserWriteSerializer(data={
            'username': 'cleanup-user', 'email': 'cleanup@example.test',
            'password': 'Strong-cleanup-password-846!',
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        self.assertTrue(user.check_password('Strong-cleanup-password-846!'))
        self.assertIsNotNone(user.userprofile)
        self.assertNotIn('password', serializer.data)

    def test_legacy_import_keeps_write_response_and_password_updates(self):
        user = get_user_model().objects.create_user(
            'cleanup-existing', email='existing@example.test', password='old-password',
        )
        serializer = UserSerializer(user, data={'password': 'Changed-password-927!'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()
        self.assertTrue(updated.check_password('Changed-password-927!'))
        self.assertFalse(updated.check_password('old-password'))
        self.assertEqual(set(serializer.data), {'username', 'email', 'display_name'})

    def test_public_serializer_does_not_expose_password_fields(self):
        fields = UserReadSerializer().get_fields()
        self.assertEqual(set(fields), {'url', 'username', 'email', 'display_name', 'is_staff'})
        self.assertNotIn('password', fields)
