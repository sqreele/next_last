import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('myappLubd', '0077_remove_property_users_remove_userprofile_properties'),
    ]

    operations = [
        migrations.CreateModel(
            name='PreventiveMaintenanceImage',
            fields=[
                ('id', models.AutoField(primary_key=True, serialize=False)),
                ('image_type', models.CharField(choices=[('before', 'Before'), ('after', 'After')], max_length=10)),
                ('image', models.ImageField(upload_to='maintenance_pm_images/%Y/%m/', validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'gif', 'webp'])])),
                ('checksum', models.CharField(editable=False, max_length=64)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('preventive_maintenance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='images', to='myappLubd.preventivemaintenance')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='uploaded_pm_images', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['uploaded_at', 'id'],
                'indexes': [models.Index(fields=['preventive_maintenance', 'image_type'], name='pm_image_type_idx')],
                'constraints': [models.UniqueConstraint(fields=('preventive_maintenance', 'checksum'), name='uniq_pm_image_checksum')],
            },
        ),
    ]
