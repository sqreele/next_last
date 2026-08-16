from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from .management.commands.seed_e2e_smoke import (
    E2E_EMAIL,
    E2E_TENANT_SLUG,
    E2E_USERNAME,
    INVENTORY_ALPHA,
    INVENTORY_BETA,
    PROPERTY_ALPHA,
    PROPERTY_BETA,
)
from .models import Inventory, Property, Tenant


class E2ESmokeSeedCommandTests(TestCase):
    env = {'E2E_TESTING': '1', 'E2E_PASSWORD': 'test-only-e2e-password'}

    def test_command_refuses_without_explicit_e2e_guard(self):
        with patch.dict('os.environ', {'E2E_TESTING': '', 'E2E_PASSWORD': ''}, clear=False):
            with self.assertRaisesMessage(CommandError, 'E2E_TESTING=1 is required.'):
                call_command('seed_e2e_smoke', stdout=StringIO())

    def test_seed_is_deterministic_and_preserves_unrelated_data(self):
        User = get_user_model()
        unrelated_user = User.objects.create_user(
            username='unrelated-seed-user', email='unrelated@example.invalid'
        )
        unrelated_tenant = Tenant.objects.create(name='Unrelated Seed Tenant', owner=unrelated_user)
        unrelated_property = Property.objects.create(
            name='Unrelated Seed Property', tenant=unrelated_tenant
        )

        with patch.dict('os.environ', self.env, clear=False):
            call_command('seed_e2e_smoke', stdout=StringIO())
            call_command('seed_e2e_smoke', stdout=StringIO())

        user = User.objects.get(username=E2E_USERNAME, email=E2E_EMAIL)
        tenant = Tenant.objects.get(slug=E2E_TENANT_SLUG)
        properties = list(tenant.properties.order_by('name'))
        self.assertEqual([item.name for item in properties], [PROPERTY_ALPHA, PROPERTY_BETA])
        self.assertTrue(all(item.users.filter(pk=user.pk).exists() for item in properties))
        self.assertEqual(
            set(user.userprofile.properties.values_list('name', flat=True)),
            {PROPERTY_ALPHA, PROPERTY_BETA},
        )
        self.assertEqual(
            set(Inventory.objects.filter(property__tenant=tenant).values_list('name', flat=True)),
            {INVENTORY_ALPHA, INVENTORY_BETA},
        )
        self.assertEqual(User.objects.filter(username=E2E_USERNAME).count(), 1)
        self.assertTrue(Property.objects.filter(pk=unrelated_property.pk).exists())

    def test_reset_removes_only_owned_namespace(self):
        User = get_user_model()
        unrelated_user = User.objects.create_user(
            username='reset-survivor', email='reset-survivor@example.invalid'
        )
        unrelated_tenant = Tenant.objects.create(name='Reset Survivor Tenant', owner=unrelated_user)
        unrelated_property = Property.objects.create(
            name='Reset Survivor Property', tenant=unrelated_tenant
        )

        with patch.dict('os.environ', self.env, clear=False):
            call_command('seed_e2e_smoke', stdout=StringIO())
            call_command('seed_e2e_smoke', '--reset', stdout=StringIO())

        self.assertFalse(User.objects.filter(username=E2E_USERNAME).exists())
        self.assertFalse(Tenant.objects.filter(slug=E2E_TENANT_SLUG).exists())
        self.assertFalse(Inventory.objects.filter(name__in=[INVENTORY_ALPHA, INVENTORY_BETA]).exists())
        self.assertTrue(User.objects.filter(pk=unrelated_user.pk).exists())
        self.assertTrue(Property.objects.filter(pk=unrelated_property.pk).exists())

    def test_seed_refuses_to_adopt_a_property_outside_the_owned_namespace(self):
        User = get_user_model()
        unrelated_user = User.objects.create_user(
            username='collision-owner', email='collision-owner@example.invalid'
        )
        unrelated_tenant = Tenant.objects.create(
            name='Collision Owner Tenant', owner=unrelated_user
        )
        conflicting_property = Property.objects.create(
            name=PROPERTY_ALPHA, tenant=unrelated_tenant
        )

        with patch.dict('os.environ', self.env, clear=False):
            with self.assertRaisesMessage(CommandError, 'outside the E2E fixture'):
                call_command('seed_e2e_smoke', stdout=StringIO())

        conflicting_property.refresh_from_db()
        self.assertEqual(conflicting_property.tenant_id, unrelated_tenant.pk)
