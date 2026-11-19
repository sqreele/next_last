from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('myappLubd', '0107_maintenanceprocedure_property')]

    operations = [
        migrations.AddField(
            model_name='preventivemaintenance',
            name='recurrence_source_job',
            field=models.OneToOneField(
                to='myappLubd.job', on_delete=django.db.models.deletion.SET_NULL,
                null=True, blank=True, related_name='next_machine_pm',
                help_text='Completed machine work order that scheduled this PM occurrence',
            ),
        ),
    ]
