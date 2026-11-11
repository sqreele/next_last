"""Legacy template ownership is inferred from usage without guessing owners."""
from importlib import import_module
from types import SimpleNamespace
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase
from django.utils import timezone
from .models import Tenant, Property, Machine, Job, PreventiveMaintenance, PMMasterPlan, MaintenanceProcedure, MaintenanceTaskImage, User


class TemplatePropertyMigrationTests(TestCase):
    def test_split_preserves_jobs_pm_plans_machines_images_and_legacy_orphans(self):
        tenant = Tenant.objects.create(name='Migration tenant')
        a = Property.objects.create(tenant=tenant, name='A')
        b = Property.objects.create(tenant=tenant, name='B')
        user = User.objects.create_user(username='migration-owner')
        ma = Machine.objects.create(property=a, name='A pump')
        mb = Machine.objects.create(property=b, name='B pump')
        legacy = MaintenanceProcedure.objects.create(name='Legacy multi-property', description='Instructions', steps=[{'title':'Check'}])
        orphan = MaintenanceProcedure.objects.create(name='Legacy orphan', description='Unassigned')
        # Historical joins predate the new m2m guard.
        through = MaintenanceProcedure.machines.through
        through.objects.bulk_create([through(maintenanceprocedure_id=legacy.pk, machine_id=m.pk) for m in [ma, mb]])
        ja = Job.objects.create(property=a, machine=ma, user=user, procedure_template=legacy)
        jb = Job.objects.create(property=b, machine=mb, user=user, procedure_template=legacy)
        jb.delete()
        pm = PreventiveMaintenance.objects.create(job=jb, created_by=user, scheduled_date=timezone.now(), procedure_template=legacy)
        pm.machines.add(mb)
        plan = PMMasterPlan.objects.create(title='B plan', created_by=user, start_date=timezone.now(), procedure_template=legacy)
        plan.machines.add(mb)
        image = MaintenanceTaskImage.objects.bulk_create([
            MaintenanceTaskImage(task=legacy, image_type='before', image_url='legacy/photo.jpg', jpeg_path='legacy/photo.jpg')
        ])[0]
        state = MigrationExecutor(connection).loader.project_state([('myappLubd', '0107_maintenanceprocedure_property')]).apps
        migrate = import_module('.migrations.0107_maintenanceprocedure_property', package='myappLubd').assign_template_properties
        migrate(state, SimpleNamespace(connection=connection))
        copies = MaintenanceProcedure.objects.filter(name=legacy.name).order_by('property_id')
        self.assertEqual(copies.count(), 2)
        by_property = {row.property_id: row for row in copies}
        self.assertEqual(by_property[a.pk].pk, legacy.pk)
        self.assertEqual(set(by_property[a.pk].machines.values_list('pk', flat=True)), {ma.pk})
        self.assertEqual(set(by_property[b.pk].machines.values_list('pk', flat=True)), {mb.pk})
        ja.refresh_from_db(); jb.refresh_from_db(); pm.refresh_from_db(); plan.refresh_from_db()
        self.assertEqual(ja.procedure_template_id, by_property[a.pk].pk)
        self.assertEqual(jb.procedure_template_id, by_property[b.pk].pk)
        self.assertEqual(pm.procedure_template_id, by_property[b.pk].pk)
        self.assertEqual(plan.procedure_template_id, by_property[b.pk].pk)
        self.assertEqual(by_property[b.pk].task_images.get().image_url.name, image.image_url.name)
        self.assertEqual(by_property[b.pk].steps, legacy.steps)
        orphan.refresh_from_db()
        self.assertIsNone(orphan.property_id)
        migrate(state, SimpleNamespace(connection=connection))
        self.assertEqual(MaintenanceProcedure.objects.filter(name=legacy.name).count(), 2)
