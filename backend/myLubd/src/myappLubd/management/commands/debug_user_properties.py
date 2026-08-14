"""
Management command to debug user property access.
Usage: python manage.py debug_user_properties <username>
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile, Property, TenantMembership
from myappLubd.tenancy import get_accessible_properties

User = get_user_model()


class Command(BaseCommand):
    help = 'Debug user property access and assignments'

    def add_arguments(self, parser):
        parser.add_argument('username', type=str, help='Username to debug')

    def handle(self, *args, **options):
        username = options['username']

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f'User "{username}" not found')

        self.stdout.write(self.style.SUCCESS(f'\n=== Property Access Debug for {username} ===\n'))

        # User info
        self.stdout.write(self.style.HTTP_INFO('User Info:'))
        self.stdout.write(f'  Username: {user.username}')
        self.stdout.write(f'  Email: {user.email}')
        self.stdout.write(f'  Is Staff: {user.is_staff}')
        self.stdout.write(f'  Is Superuser: {user.is_superuser}')
        self.stdout.write(f'  Is Active: {user.is_active}')

        # Accessible properties
        self.stdout.write(self.style.HTTP_INFO('\nAccessible Properties (via get_accessible_properties):'))
        accessible = get_accessible_properties(user)
        if accessible.count() == 0:
            self.stdout.write(self.style.WARNING('  ❌ No accessible properties found!'))
        else:
            self.stdout.write(self.style.SUCCESS(f'  ✅ Found {accessible.count()} accessible properties'))
            for prop in accessible:
                self.stdout.write(f'    - {prop.property_id}: {prop.name}')

        # UserProfile properties
        self.stdout.write(self.style.HTTP_INFO('\nUserProfile Properties:'))
        try:
            profile = UserProfile.objects.get(user=user)
            profile_props = profile.properties.all()
            if profile_props.count() == 0:
                self.stdout.write(self.style.WARNING('  ❌ No properties in UserProfile!'))
            else:
                self.stdout.write(self.style.SUCCESS(f'  ✅ Found {profile_props.count()} properties in UserProfile'))
                for prop in profile_props:
                    self.stdout.write(f'    - {prop.property_id}: {prop.name}')
        except UserProfile.DoesNotExist:
            self.stdout.write(self.style.WARNING('  ❌ UserProfile does not exist!'))

        # Legacy user assignment
        self.stdout.write(self.style.HTTP_INFO('\nLegacy User Assignment (Property.users):'))
        legacy_props = Property.objects.filter(users=user)
        if legacy_props.count() == 0:
            self.stdout.write('  No properties assigned via legacy method')
        else:
            self.stdout.write(f'  ✅ Found {legacy_props.count()} properties')
            for prop in legacy_props:
                self.stdout.write(f'    - {prop.property_id}: {prop.name}')

        # TenantMembership
        self.stdout.write(self.style.HTTP_INFO('\nTenantMembership:'))
        memberships = TenantMembership.objects.filter(user=user, is_active=True)
        if memberships.count() == 0:
            self.stdout.write('  No active tenant memberships')
        else:
            self.stdout.write(f'  Found {memberships.count()} active memberships:')
            for mem in memberships:
                self.stdout.write(f'\n    Tenant: {mem.tenant.name}')
                self.stdout.write(f'      Role: {mem.role}')
                self.stdout.write(f'      Is Active: {mem.is_active}')
                mem_props = mem.properties.all()
                if mem_props.count() == 0:
                    self.stdout.write('      Properties: None assigned to membership')
                else:
                    self.stdout.write(f'      Properties ({mem_props.count()}):')
                    for prop in mem_props:
                        self.stdout.write(f'        - {prop.property_id}: {prop.name}')

        # Summary
        self.stdout.write('\n' + self.style.HTTP_INFO('=== Summary ==='))
        if accessible.count() == 0:
            self.stdout.write(self.style.ERROR('❌ User has NO accessible properties!'))
            self.stdout.write(
                'Review the intended assignment through the normal tenant/property '
                'administration workflow.'
            )
        else:
            self.stdout.write(self.style.SUCCESS(f'✅ User has {accessible.count()} accessible properties'))
