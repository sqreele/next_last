from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.db.models.manager


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('myappLubd', '0091_populate_plan_feature_capabilities'),
    ]

    operations = [
        migrations.AddField(
            model_name='job',
            name='deleted_at',
            field=models.DateTimeField(blank=True, db_index=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name='job',
            name='deleted_by',
            field=models.ForeignKey(
                blank=True,
                editable=False,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='deleted_jobs',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterModelOptions(
            name='job',
            options={
                'base_manager_name': 'all_objects',
                'default_manager_name': 'objects',
                'ordering': ['-created_at'],
                'verbose_name_plural': 'Maintenance Jobs',
            },
        ),
        migrations.AlterModelManagers(
            name='job',
            managers=[
                ('objects', django.db.models.manager.Manager()),
                ('all_objects', django.db.models.manager.Manager()),
            ],
        ),
        migrations.CreateModel(
            name='DeletedJob',
            fields=[],
            options={
                'verbose_name': 'Deleted job',
                'verbose_name_plural': 'Deleted jobs',
                'proxy': True,
                'indexes': [],
                'constraints': [],
            },
            bases=('myappLubd.job',),
        ),
    ]
