from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('myappLubd', '0108_pm_recurrence_source_job')]

    operations = [
        migrations.AddField(
            model_name='preventivemaintenance',
            name='recurrence_source_pm',
            field=models.OneToOneField(
                to='myappLubd.preventivemaintenance',
                on_delete=django.db.models.deletion.SET_NULL,
                null=True, blank=True, related_name='next_occurrence',
                help_text='Completed PM record that scheduled this occurrence',
            ),
        ),
    ]
