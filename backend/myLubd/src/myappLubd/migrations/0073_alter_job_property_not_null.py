# Generated manually for the already-clean Job.property NOT NULL invariant.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0072_job_property'),
    ]

    operations = [
        migrations.AlterField(
            model_name='job',
            name='property',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='jobs',
                to='myappLubd.property',
            ),
        ),
    ]
