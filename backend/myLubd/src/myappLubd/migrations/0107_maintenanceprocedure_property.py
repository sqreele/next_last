"""Give each template one owner and split legacy cross-property usage."""
from django.db import migrations, models
import django.db.models.deletion


def assign_template_properties(apps, schema_editor):
    alias = schema_editor.connection.alias
    Procedure = apps.get_model('myappLubd', 'MaintenanceProcedure')
    Job = apps.get_model('myappLubd', 'Job')
    PM = apps.get_model('myappLubd', 'PreventiveMaintenance')
    Plan = apps.get_model('myappLubd', 'PMMasterPlan')
    Image = apps.get_model('myappLubd', 'MaintenanceTaskImage')
    for template in Procedure.objects.using(alias).all().iterator():
        machines = list(template.machines.using(alias).values_list('pk', 'property_id'))
        ownership = {}
        for model in (Job, PM, Plan):
            rows = model._base_manager.using(alias).filter(procedure_template_id=template.pk)
            for row in rows.iterator():
                if model is Job:
                    property_ids = {row.property_id}
                elif model is PM and row.job_id:
                    property_ids = {Job._base_manager.using(alias).get(pk=row.job_id).property_id}
                    property_ids.update(row.machines.using(alias).values_list('property_id', flat=True))
                else:
                    property_ids = set(row.machines.using(alias).values_list('property_id', flat=True))
                property_ids.discard(None)
                if len(property_ids) > 1:
                    raise RuntimeError(f'Cannot assign template {template.pk}: {model.__name__} {row.pk} has conflicting properties.')
                ownership[(model, row.pk)] = next(iter(property_ids), None)
        property_ids = {prop for _, prop in machines if prop is not None}
        property_ids.update(prop for prop in ownership.values() if prop is not None)
        if not property_ids:
            # Keep ownerless legacy data for platform-admin assignment. It is
            # hidden from normal users and cannot be selected for new work.
            continue
        owners = sorted(property_ids)
        copies = {owners[0]: template.pk}
        Procedure.objects.using(alias).filter(pk=template.pk).update(property_id=owners[0])
        values = {field.attname: getattr(template, field.attname)
                  for field in Procedure._meta.concrete_fields
                  if not field.primary_key and field.name != 'property'}
        images = list(Image.objects.using(alias).filter(task_id=template.pk))
        for owner in owners[1:]:
            copy = Procedure.objects.using(alias).create(**values, property_id=owner)
            copies[owner] = copy.pk
            Procedure.objects.using(alias).filter(pk=copy.pk).update(created_at=template.created_at, updated_at=template.updated_at)
            for original in images:
                image_values = {field.attname: getattr(original, field.attname)
                                for field in Image._meta.concrete_fields
                                if not field.primary_key and field.name != 'task'}
                image = Image.objects.using(alias).create(**image_values, task_id=copy.pk)
                Image.objects.using(alias).filter(pk=image.pk).update(uploaded_at=original.uploaded_at)
        template.machines.clear()
        for owner, template_id in copies.items():
            owned = Procedure.objects.using(alias).get(pk=template_id)
            owned.machines.set([pk for pk, prop in machines if prop == owner])
        for (model, pk), owner in ownership.items():
            # Rows without a canonical property are not assigned by guesswork.
            if owner is not None:
                model._base_manager.using(alias).filter(pk=pk).update(procedure_template_id=copies[owner])


class Migration(migrations.Migration):
    dependencies = [
        ('myappLubd', '0106_merge_job_pm_template_and_billing'),
        ('myappLubd', '0105_billing_issuer_settings'),
    ]
    operations = [
        migrations.AddField(
            model_name='maintenanceprocedure', name='property',
            field=models.ForeignKey(to='myappLubd.property', on_delete=django.db.models.deletion.PROTECT,
                related_name='maintenance_procedures', null=True,
                help_text='Owning property. Legacy unassigned templates must be assigned before use.'),
        ),
        migrations.RunPython(assign_template_properties, migrations.RunPython.noop),
    ]
