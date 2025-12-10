from django.db import migrations, models


def forwards_copy_inventory_links(apps, schema_editor):
    Inventory = apps.get_model('myappLubd', 'Inventory')
    db_alias = schema_editor.connection.alias

    inventories = Inventory.objects.using(db_alias).all()
    for inventory in inventories.iterator():
        job_id = getattr(inventory, 'job_id', None)
        if job_id:
            inventory.jobs.add(job_id)

        pm_id = getattr(inventory, 'preventive_maintenance_id', None)
        if pm_id:
            inventory.preventive_maintenances.add(pm_id)


def backwards_copy_inventory_links(apps, schema_editor):
    Inventory = apps.get_model('myappLubd', 'Inventory')
    db_alias = schema_editor.connection.alias

    inventories = Inventory.objects.using(db_alias).all()
    for inventory in inventories.iterator():
        first_job = inventory.jobs.order_by('pk').first()
        inventory.job_id = first_job.pk if first_job else None

        first_pm = inventory.preventive_maintenances.order_by('pk').first()
        inventory.preventive_maintenance_id = first_pm.pk if first_pm else None

        inventory.save(update_fields=['job', 'preventive_maintenance'])


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0051_merge_20251208_2234'),
    ]

    operations = [
        migrations.AddField(
            model_name='inventory',
            name='jobs',
            field=models.ManyToManyField(
                blank=True,
                help_text='Jobs where this inventory item was used',
                related_name='inventory_items',
                to='myappLubd.job',
            ),
        ),
        migrations.AddField(
            model_name='inventory',
            name='preventive_maintenances',
            field=models.ManyToManyField(
                blank=True,
                help_text='Preventive maintenance tasks where this inventory item was used',
                related_name='inventory_items',
                to='myappLubd.preventivemaintenance',
            ),
        ),
        migrations.RunPython(
            forwards_copy_inventory_links,
            backwards_copy_inventory_links,
        ),
        migrations.RemoveField(
            model_name='inventory',
            name='job',
        ),
        migrations.RemoveField(
            model_name='inventory',
            name='preventive_maintenance',
        ),
    ]
