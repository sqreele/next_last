"""Exercise the actual expand-only migrations on Django's isolated test DB."""
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone
from unittest.mock import patch


class CompanyBillingMigrationTests(TransactionTestCase):
    def test_legacy_property_ids_links_and_roles_survive_schema_expansion(self):
        # Never permit this historical-schema test against an ordinary DB.
        self.assertTrue(str(connection.settings_dict['NAME']).startswith('test_'))
        before = [('myappLubd', '0101_promptpay_non_vat_documents')]
        after = MigrationExecutor(connection).loader.graph.leaf_nodes('myappLubd')
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(after))
        executor = MigrationExecutor(connection)
        executor.migrate(before)
        old = executor.loader.project_state(before).apps
        user = old.get_model('myappLubd', 'User').objects.create(username='migration-owner')
        company = old.get_model('myappLubd', 'Tenant').objects.create(name='Migration Company', tenant_id='TMIGRATE', slug='migration-company')
        prop = old.get_model('myappLubd', 'Property').objects.create(name='Original hotel', property_id='PORIGINAL', tenant=company)
        member = old.get_model('myappLubd', 'TenantMembership').objects.create(tenant=company, user=user, role='owner')
        member.properties.add(prop)
        job = old.get_model('myappLubd', 'Job').objects.create(job_id='JMIGRATE', property=prop, user=user, description='Historical work')
        room = old.get_model('myappLubd', 'Room').objects.create(name='101', room_type='guest', property=prop)
        machine = old.get_model('myappLubd', 'Machine').objects.create(name='Existing pump', machine_id='MMIGRATE', property=prop)
        pm = old.get_model('myappLubd', 'PreventiveMaintenance').objects.create(pm_id='PMMIGRATE', job=job,
            scheduled_date=timezone.now(), created_by=user, assigned_to=user)
        pm.machines.add(machine)
        original = (company.pk, prop.pk, prop.property_id, job.pk, member.pk)
        with patch('stripe.Subscription.create') as create, patch('stripe.Customer.create') as customer:
            executor = MigrationExecutor(connection)
            executor.migrate(after)
            new = executor.loader.project_state(after).apps
            new_prop = new.get_model('myappLubd', 'Property').objects.get(pk=prop.pk)
            new_job = new.get_model('myappLubd', 'Job').objects.get(pk=job.pk)
            new_company = new.get_model('myappLubd', 'Tenant').objects.get(pk=company.pk)
            new_member = new.get_model('myappLubd', 'TenantMembership').objects.get(pk=member.pk)
            self.assertEqual((new_company.pk, new_prop.pk, new_prop.property_id, new_job.pk, new_member.pk), original)
            self.assertEqual(new_prop.tenant_id, company.pk)
            self.assertEqual(new_job.property_id, prop.pk)
            self.assertEqual(new_job.user_id, user.pk)
            self.assertEqual(new.get_model('myappLubd', 'Room').objects.get(pk=room.pk).property_id, prop.pk)
            self.assertEqual(new.get_model('myappLubd', 'Machine').objects.get(pk=machine.pk).property_id, prop.pk)
            new_pm = new.get_model('myappLubd', 'PreventiveMaintenance').objects.get(pk=pm.pk)
            self.assertEqual(new_pm.job_id, job.pk)
            self.assertEqual(new_pm.assigned_to_id, user.pk)
            self.assertEqual(list(new_pm.machines.values_list('pk', flat=True)), [machine.pk])
            self.assertIsNone(new_job.assigned_to_id)
            self.assertIsNone(new_job.created_by_id)
            self.assertEqual(new_company.billing_model, 'legacy_plan')
            self.assertEqual(new_member.role, 'owner')
            self.assertFalse(new_member.can_manage_company_billing)
            self.assertEqual(list(new_member.properties.values_list('pk', flat=True)), [prop.pk])
            self.assertEqual(new.get_model('myappLubd', 'PropertyBillingEnrollment').objects.count(), 0)
            create.assert_not_called(); customer.assert_not_called()
