from django.db import migrations, models


def copy_equipment_category(apps, schema_editor):
    MaintenanceProcedure = apps.get_model('myappLubd', 'MaintenanceProcedure')
    Machine = apps.get_model('myappLubd', 'Machine')

    machine_lookup = {
        machine.pk: (machine.category or '', machine.name or '')
        for machine in Machine.objects.all()
    }

    updates = []
    for procedure in MaintenanceProcedure.objects.all().iterator():
        if procedure.category or not procedure.equipment_id:
            continue

        category, name = machine_lookup.get(procedure.equipment_id, ('', ''))
        chosen = category or name
        if chosen:
            procedure.category = chosen
            updates.append(procedure)

    if updates:
        MaintenanceProcedure.objects.bulk_update(updates, ['category'])


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0030_maintenanceprocedure_after_image_and_more'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='maintenanceprocedure',
            options={
                'ordering': ['category', 'frequency', 'name'],
                'verbose_name': 'Maintenance Task Template',
                'verbose_name_plural': 'Maintenance Task Templates',
            },
        ),
        migrations.AddField(
            model_name='maintenanceprocedure',
            name='category',
            field=models.CharField(
                blank=True,
                help_text='Equipment category this task is typically for (e.g., Fire Pump, HVAC, Elevator)',
                max_length=100,
                null=True,
            ),
        ),
        migrations.RunPython(copy_equipment_category, migrations.RunPython.noop),
        migrations.RemoveIndex(
            model_name='maintenanceprocedure',
            name='myappLubd_m_equipme_eedfbd_idx',
        ),
        migrations.RemoveIndex(
            model_name='maintenanceprocedure',
            name='myappLubd_m_equipme_d7be07_idx',
        ),
        migrations.RemoveField(
            model_name='maintenanceprocedure',
            name='equipment',
        ),
        migrations.AddIndex(
            model_name='maintenanceprocedure',
            index=models.Index(
                fields=['category'],
                name='myappLubd_mp_category_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='maintenanceprocedure',
            index=models.Index(
                fields=['name'],
                name='myappLubd_mp_name_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='maintenanceprocedure',
            index=models.Index(
                fields=['difficulty_level'],
                name='myappLubd_mp_difficulty_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='maintenanceprocedure',
            index=models.Index(
                fields=['created_at'],
                name='myappLubd_mp_created_idx',
            ),
        ),
    ]
