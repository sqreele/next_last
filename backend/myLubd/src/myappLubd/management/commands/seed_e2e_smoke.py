import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from ...models import Inventory, Property, Tenant


E2E_USERNAME = 'e2e-browser-smoke'
E2E_EMAIL = 'e2e-browser-smoke@example.invalid'
E2E_TENANT_SLUG = 'e2e-browser-smoke'
PROPERTY_ALPHA = 'E2E Property Alpha'
PROPERTY_BETA = 'E2E Property Beta'
INVENTORY_ALPHA = 'E2E Inventory Alpha'
INVENTORY_BETA = 'E2E Inventory Beta'


class Command(BaseCommand):
    help = 'Seed or reset the narrowly owned browser-smoke fixture.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true')

    def _assert_safe_environment(self):
        database_name = str(connection.settings_dict.get('NAME') or '').lower()
        if os.environ.get('E2E_TESTING') != '1':
            raise CommandError('E2E_TESTING=1 is required.')
        if 'e2e' not in database_name and not database_name.startswith('test_'):
            raise CommandError(
                f'Refusing E2E seed/reset against non-E2E database {database_name!r}.'
            )

    def _reset_owned_data(self):
        User = get_user_model()
        Tenant.objects.filter(slug=E2E_TENANT_SLUG).delete()
        User.objects.filter(username=E2E_USERNAME, email=E2E_EMAIL).delete()

    @transaction.atomic
    def handle(self, *args, **options):
        self._assert_safe_environment()
        if options['reset']:
            self._reset_owned_data()
            self.stdout.write(self.style.SUCCESS('Reset E2E browser-smoke fixture.'))
            return

        password = os.environ.get('E2E_PASSWORD')
        if not password:
            raise CommandError('E2E_PASSWORD is required for seeding.')

        User = get_user_model()
        username_collision = User.objects.filter(username=E2E_USERNAME).exclude(
            email=E2E_EMAIL
        )
        if username_collision.exists():
            raise CommandError('Refusing to adopt a non-E2E user with the E2E username.')
        user, _ = User.objects.get_or_create(
            username=E2E_USERNAME,
            defaults={'email': E2E_EMAIL, 'first_name': 'E2E', 'last_name': 'Browser'},
        )
        user.email = E2E_EMAIL
        user.first_name = 'E2E'
        user.last_name = 'Browser'
        user.is_active = True
        user.set_password(password)
        user.save()

        existing_tenant = Tenant.objects.filter(slug=E2E_TENANT_SLUG).first()
        if existing_tenant and existing_tenant.owner_id != user.pk:
            raise CommandError('Refusing to adopt a Tenant outside the E2E fixture.')
        tenant, _ = Tenant.objects.update_or_create(
            slug=E2E_TENANT_SLUG,
            defaults={
                'name': 'E2E Browser Smoke Tenant',
                'owner': user,
                'status': 'active',
                'billing_email': E2E_EMAIL,
            },
        )
        properties = []
        for name, description in (
            (PROPERTY_ALPHA, 'Owned E2E Alpha fixture'),
            (PROPERTY_BETA, 'Owned E2E Beta fixture'),
        ):
            existing_property = Property.objects.filter(name=name).first()
            if existing_property and existing_property.tenant_id != tenant.pk:
                raise CommandError(f'Refusing to adopt Property {name!r} outside the E2E fixture.')
            property_obj, _ = Property.objects.update_or_create(
                name=name,
                defaults={'tenant': tenant, 'description': description},
            )
            properties.append(property_obj)
        property_alpha, property_beta = properties
        for property_obj in (property_alpha, property_beta):
            property_obj.users.add(user)
        user.userprofile.properties.set([property_alpha, property_beta])

        Inventory.objects.update_or_create(
            property=property_alpha,
            name=INVENTORY_ALPHA,
            defaults={'quantity': 11, 'category': 'parts', 'unit': 'pcs', 'created_by': user},
        )
        Inventory.objects.update_or_create(
            property=property_beta,
            name=INVENTORY_BETA,
            defaults={'quantity': 22, 'category': 'parts', 'unit': 'pcs', 'created_by': user},
        )
        self.stdout.write(self.style.SUCCESS('Seeded E2E browser-smoke fixture.'))
