import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('myappLubd', '0095_job_priority_and_image_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PendingJobImage',
            fields=[
                ('token', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('image', models.ImageField(upload_to='maintenance_job_images/pending/%Y/%m/')),
                ('image_type', models.CharField(choices=[('before', 'Before'), ('after', 'After')], max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('property', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pending_job_images', to='myappLubd.property')),
                ('uploaded_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pending_job_images', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['created_at'],
                'indexes': [models.Index(fields=['uploaded_by', 'property', 'created_at'], name='myappLubd_p_uploade_e231d6_idx')],
            },
        ),
    ]
