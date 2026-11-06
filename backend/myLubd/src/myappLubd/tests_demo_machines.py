from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings

from .demo_api import DEMO_PROPERTY_ID, demo_snapshot
from .models import DemoJobMachine, Job, Machine, PreventiveMaintenance, Property, Tenant


@override_settings(DEMO_MODE=True)
class DemoMachineTests(TestCase):
    def seed(self, **kwargs):
        call_command('seed_public_demo', stdout=StringIO(), **kwargs)

    def test_seed_populates_assets_history_and_related_plans(self):
        self.seed()
        snapshot = demo_snapshot()
        self.assertEqual(len(snapshot['machines']), 6)
        jobs = [job for job in snapshot['jobs'] if job['machine']]
        self.assertEqual(len(jobs), 8)
        self.assertEqual({job['category'] for job in jobs}, {
            'PM', 'Repair', 'Preventive Monthly', 'Preventive Weekly',
            'Preventive Yearly', 'Change Part', 'Service Contract', 'Other',
        })
        for machine in snapshot['machines']:
            for field in ('brand', 'serial_number', 'asset_tag', 'location', 'description',
                          'installation_date', 'last_maintenance_date', 'warranty_end_date'):
                self.assertTrue(machine[field], (machine['machine_id'], field))
        for job in jobs:
            self.assertTrue(job['comments'])
            self.assertEqual(job['is_defective'], job['category'] == 'Repair')
            self.assertEqual(job['is_preventive_maintenance'], job['category'] == 'PM' or job['category'].startswith('Preventive '))
        plans = [plan for plan in snapshot['maintenance'] if plan['pm_id'].startswith('DEMOCTPMM')]
        self.assertEqual(len(plans), 4)
        for plan in plans:
            self.assertTrue(plan['machine_ids'])
            self.assertTrue(plan['assigned_to'])
            self.assertTrue(plan['procedure'])

    def test_repeated_seed_preserves_workflow_and_reset_restores_sample(self):
        self.seed()
        counts = (Machine.objects.count(), Job.all_objects.count(), PreventiveMaintenance.objects.count())
        sample = Job.objects.get(job_id='DEMO-CT-M008')
        Job.objects.filter(pk=sample.pk).update(status='completed')
        self.seed()
        self.assertEqual(counts, (Machine.objects.count(), Job.all_objects.count(), PreventiveMaintenance.objects.count()))
        sample.refresh_from_db()
        self.assertEqual(sample.status, 'completed')
        self.seed(reset=True)
        self.assertEqual(counts, (Machine.objects.count(), Job.all_objects.count(), PreventiveMaintenance.objects.count()))
        self.assertEqual(Job.objects.get(job_id='DEMO-CT-M008').status, 'in_progress')
        self.assertEqual(DemoJobMachine.objects.count(), 8)

    def test_snapshot_excludes_other_properties(self):
        self.seed()
        tenant = Tenant.objects.create(name='Other tenant')
        other = Property.objects.create(tenant=tenant, name='Other hotel')
        Machine.objects.create(property=other, machine_id='OTHER-001', name='Private asset')
        snapshot = demo_snapshot()
        self.assertEqual(snapshot['property']['property_id'], DEMO_PROPERTY_ID)
        self.assertNotIn('OTHER-001', [machine['machine_id'] for machine in snapshot['machines']])
