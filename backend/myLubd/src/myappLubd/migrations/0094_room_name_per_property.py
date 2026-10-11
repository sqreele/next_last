from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0093_backfill_job_admin_history'),
    ]

    operations = [
        migrations.AlterField(
            model_name='room',
            name='name',
            field=models.CharField(max_length=100),
        ),
        migrations.AddConstraint(
            model_name='room',
            constraint=models.UniqueConstraint(
                fields=('property', 'name'),
                name='unique_room_name_per_property',
            ),
        ),
    ]
