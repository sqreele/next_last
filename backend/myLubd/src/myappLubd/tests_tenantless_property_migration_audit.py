from io import StringIO
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from .models import Property, Tenant, TenantMembership


User = get_user_model()


class TenantlessPropertyMigrationAuditTests(TestCase):
    def test_audit_is_read_only_and_reports_legacy_access_union(self):
        direct_user = User.objects.create_user(username='direct-user')
        profile_user = User.objects.create_user(username='profile-user')
        property_obj = Property.objects.create(name='Legacy audit property')
        property_obj.users.add(direct_user)
        profile_user.userprofile.properties.add(property_obj)

        before = (property_obj.tenant_id, Tenant.objects.count(), TenantMembership.objects.count())
        output = StringIO()
        call_command('audit_tenantless_property_migration', stdout=output)

        property_obj.refresh_from_db()
        self.assertEqual((property_obj.tenant_id, Tenant.objects.count(), TenantMembership.objects.count()), before)
        self.assertIn('Mode: READ ONLY', output.getvalue())
        self.assertIn('direct_only=1 profile_only=1 both=0 union=2', output.getvalue())
        self.assertIn('MANUAL BUSINESS DECISION REQUIRED', output.getvalue())

    def test_planned_tenant_wide_role_overgrant_is_reported(self):
        user = User.objects.create_user(username='manager-user')
        tenant = Tenant.objects.create(name='Migration target')
        property_a = Property.objects.create(name='Legacy A')
        property_b = Property.objects.create(name='Legacy B')
        property_a.users.add(user)
        membership = TenantMembership.objects.create(user=user, tenant=tenant, role='manager')
        membership.properties.add(property_a)

        output = StringIO()
        call_command(
            'audit_tenantless_property_migration',
            '--target', f'{property_a.property_id}={tenant.tenant_id}',
            '--target', f'{property_b.property_id}={tenant.tenant_id}',
            stdout=output,
        )

        self.assertIn('parity=OVER-GRANT', output.getvalue())

    def test_mapping_with_ambiguous_role_blocks_migration(self):
        user = User.objects.create_user(username='ambiguous-user')
        tenant = Tenant.objects.create(name='Mapping target')
        property_obj = Property.objects.create(name='Legacy mapping property', property_id='PB749146D')
        property_obj.users.add(user)
        mapping = self._mapping_file(self._row(user.id, 'MANUAL_REQUIRED', 'YES', 'NO', '', 'PENDING'))
        self.addCleanup(mapping.unlink)

        output = StringIO()
        call_command(
            'audit_tenantless_property_migration',
            '--target', f'{property_obj.property_id}={tenant.tenant_id}',
            '--mapping', str(mapping),
            stdout=output,
        )
        self.assertIn('status=AMBIGUOUS ROLE', output.getvalue())
        self.assertIn('migration readiness: BLOCKED', output.getvalue())

    def test_mapping_distinguishes_approved_tenant_wide_expansion(self):
        user = User.objects.create_user(username='approved-manager')
        tenant = Tenant.objects.create(name='Approved expansion target')
        property_a = Property.objects.create(name='Legacy manager A', property_id='PB749146D')
        property_b = Property.objects.create(name='Legacy manager B', property_id='PE17D8D2C')
        property_a.users.add(user)
        mapping = self._mapping_file(self._row(user.id, 'manager', 'YES', 'YES', 'YES', 'APPROVED'))
        self.addCleanup(mapping.unlink)

        output = StringIO()
        call_command(
            'audit_tenantless_property_migration',
            '--target', f'{property_a.property_id}={tenant.tenant_id}',
            '--target', f'{property_b.property_id}={tenant.tenant_id}',
            '--mapping', str(mapping),
            stdout=output,
        )
        self.assertIn('status=APPROVED_EXPANSION', output.getvalue())

    def test_mapping_detects_access_loss(self):
        user = User.objects.create_user(username='missing-grant-user')
        tenant = Tenant.objects.create(name='Access loss target')
        property_obj = Property.objects.create(name='Legacy access loss property', property_id='PB749146D')
        property_obj.users.add(user)
        mapping = self._mapping_file(self._row(user.id, 'technician', 'NO', 'NO', 'NO', 'APPROVED'))
        self.addCleanup(mapping.unlink)

        output = StringIO()
        call_command(
            'audit_tenantless_property_migration',
            '--target', f'{property_obj.property_id}={tenant.tenant_id}',
            '--mapping', str(mapping),
            stdout=output,
        )
        self.assertIn('status=ACCESS LOSS', output.getvalue())
        self.assertIn('migration readiness: BLOCKED', output.getvalue())

    def test_complete_matching_mapping_is_ready(self):
        user_a = User.objects.create_user(username='matching-a')
        user_b = User.objects.create_user(username='matching-b')
        tenant = Tenant.objects.create(name='Ready target')
        property_a = Property.objects.create(name='Ready legacy A', property_id='PB749146D')
        property_b = Property.objects.create(name='Ready legacy B', property_id='PE17D8D2C')
        property_a.users.add(user_a)
        property_b.users.add(user_b)
        mapping = self._mapping_file(
            self._row(user_a.id, 'technician', 'YES', 'NO', 'NO', 'APPROVED'),
            self._row(user_b.id, 'technician', 'NO', 'YES', 'NO', 'APPROVED'),
        )
        self.addCleanup(mapping.unlink)

        output = StringIO()
        call_command(
            'audit_tenantless_property_migration',
            '--target', f'{property_a.property_id}={tenant.tenant_id}',
            '--target', f'{property_b.property_id}={tenant.tenant_id}',
            '--mapping', str(mapping),
            stdout=output,
        )
        self.assertIn('mapping summary: MATCH=2', output.getvalue())
        self.assertIn('migration readiness: READY', output.getvalue())

    def test_invalid_role_is_rejected(self):
        user = User.objects.create_user(username='invalid-role-user')
        tenant = Tenant.objects.create(name='Invalid role target')
        property_obj = Property.objects.create(name='Invalid role property', property_id='PB749146D')
        property_obj.users.add(user)
        mapping = self._mapping_file(self._row(user.id, 'invented_role', 'YES', 'NO', 'NO', 'APPROVED'))
        self.addCleanup(mapping.unlink)

        output = StringIO()
        call_command('audit_tenantless_property_migration', '--target', f'{property_obj.property_id}={tenant.tenant_id}', '--mapping', str(mapping), stdout=output)

        self.assertIn('status=INVALID ROLE', output.getvalue())
        self.assertIn('INVALID ROLES=1', output.getvalue())

    def test_tenant_wide_role_cannot_be_limited_by_restrictive_property_flags(self):
        user = User.objects.create_user(username='restricted-manager-user')
        tenant = Tenant.objects.create(name='Tenant-wide target')
        property_a = Property.objects.create(name='Tenant-wide A', property_id='PB749146D')
        property_b = Property.objects.create(name='Tenant-wide B', property_id='PE17D8D2C')
        property_a.users.add(user)
        mapping = self._mapping_file(self._row(user.id, 'manager', 'YES', 'NO', 'YES', 'APPROVED'))
        self.addCleanup(mapping.unlink)

        output = StringIO()
        call_command('audit_tenantless_property_migration', '--target', f'{property_a.property_id}={tenant.tenant_id}', '--target', f'{property_b.property_id}={tenant.tenant_id}', '--mapping', str(mapping), stdout=output)

        self.assertIn('status=INVALID ROLE', output.getvalue())
        self.assertIn('future=PB749146D;PE17D8D2C', output.getvalue())

    def test_approved_retirement_is_not_access_loss_and_preserves_user_without_membership(self):
        user = User.objects.create_user(username='retired-legacy-user')
        tenant = Tenant.objects.create(name='Retirement target')
        property_obj = Property.objects.create(name='Retired legacy property', property_id='PB749146D')
        property_obj.users.add(user)
        mapping = self._mapping_file(self._row(user.id, 'NONE', 'NO', 'NO', 'NO', 'APPROVED_RETIREMENT'))
        self.addCleanup(mapping.unlink)
        before = (User.objects.filter(pk=user.pk).exists(), TenantMembership.objects.filter(user=user).count())

        output = StringIO()
        call_command('audit_tenantless_property_migration', '--target', f'{property_obj.property_id}={tenant.tenant_id}', '--mapping', str(mapping), stdout=output)

        self.assertIn('status=APPROVED_RETIREMENT', output.getvalue())
        self.assertNotIn('status=ACCESS LOSS', output.getvalue())
        self.assertEqual(before, (User.objects.filter(pk=user.pk).exists(), TenantMembership.objects.filter(user=user).count()))

    def test_mapping_with_approved_retirement_can_be_ready(self):
        user = User.objects.create_user(username='ready-retired-user')
        tenant = Tenant.objects.create(name='Ready retirement target')
        property_obj = Property.objects.create(name='Ready retired property', property_id='PB749146D')
        property_obj.users.add(user)
        mapping = self._mapping_file(self._row(user.id, 'NONE', 'NO', 'NO', 'NO', 'APPROVED_RETIREMENT'))
        self.addCleanup(mapping.unlink)

        output = StringIO()
        call_command('audit_tenantless_property_migration', '--target', f'{property_obj.property_id}={tenant.tenant_id}', '--mapping', str(mapping), stdout=output)

        self.assertIn('mapping summary: APPROVED_RETIREMENT=1', output.getvalue())
        self.assertIn('migration readiness: READY', output.getvalue())

    @staticmethod
    def _row(user_id, role, chinatown, siam, expansion, status):
        return f'{user_id},,,,,{role},{chinatown},{siam},{expansion},{status},test fixture\n'

    @staticmethod
    def _mapping_file(*rows):
        handle = NamedTemporaryFile('w', suffix='.csv', delete=False)
        handle.write(
            'user_id,legacy_chinatown,legacy_siam,legacy_property_set,existing_role,'
            'approved_role,approved_chinatown,approved_siam,'
            'approved_tenant_wide_expansion,approval_status,notes\n'
        )
        for row in rows:
            handle.write(row)
        handle.close()
        return Path(handle.name)
