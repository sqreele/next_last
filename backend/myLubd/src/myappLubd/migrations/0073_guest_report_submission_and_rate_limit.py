import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0072_jobcomment_client_comment_request_id'),
    ]

    operations = [
        migrations.CreateModel(
            name='GuestReportRateLimit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('bucket_key', models.CharField(editable=False, max_length=64, unique=True)),
                ('window_started_at', models.DateTimeField()),
                ('count', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name='GuestReportSubmission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('request_id', models.UUIDField(editable=False, unique=True)),
                ('property_id_snapshot', models.PositiveBigIntegerField(editable=False)),
                ('room_id_snapshot', models.PositiveBigIntegerField(editable=False)),
                ('tenant_id_snapshot', models.PositiveBigIntegerField(blank=True, editable=False, null=True)),
                ('payload_fingerprint', models.CharField(editable=False, max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('job', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='guest_report_submission', to='myappLubd.job')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
