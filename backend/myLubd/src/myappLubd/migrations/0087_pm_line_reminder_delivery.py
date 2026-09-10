from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0086_line_group_pairing'),
    ]

    operations = [
        migrations.CreateModel(
            name='PMLineReminderBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reminder_type', models.CharField(choices=[('day_before', 'Day before'), ('same_day', 'Same day')], max_length=16)),
                ('scheduled_date', models.DateField()),
                ('retry_key', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('destination_id', models.CharField(editable=False, max_length=255)),
                ('message_text', models.TextField(editable=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('accepted_at', models.DateTimeField(blank=True, null=True)),
                ('property', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pm_line_reminder_batches', to='myappLubd.property')),
            ],
            options={
                'indexes': [models.Index(fields=['property', 'reminder_type', 'scheduled_date', 'accepted_at'], name='pm_line_batch_pending_idx'), models.Index(fields=['accepted_at', 'created_at'], name='pm_line_batch_retry_idx')],
            },
        ),
        migrations.CreateModel(
            name='PMLineReminderDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reminder_type', models.CharField(choices=[('day_before', 'Day before'), ('same_day', 'Same day')], max_length=16)),
                ('scheduled_date', models.DateField()),
                ('delivered_at', models.DateTimeField()),
                ('batch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deliveries', to='myappLubd.pmlinereminderbatch')),
                ('preventive_maintenance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='line_reminder_deliveries', to='myappLubd.preventivemaintenance')),
                ('property', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pm_line_reminder_deliveries', to='myappLubd.property')),
            ],
            options={
                'indexes': [models.Index(fields=['property', 'reminder_type', 'scheduled_date'], name='pm_line_delivery_lookup_idx')],
                'constraints': [models.UniqueConstraint(fields=('property', 'preventive_maintenance', 'reminder_type', 'scheduled_date'), name='uniq_pm_line_reminder_delivery')],
            },
        ),
        migrations.CreateModel(
            name='PMLineReminderBatchItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reminder_type', models.CharField(choices=[('day_before', 'Day before'), ('same_day', 'Same day')], max_length=16)),
                ('scheduled_date', models.DateField()),
                ('batch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='myappLubd.pmlinereminderbatch')),
                ('preventive_maintenance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='myappLubd.preventivemaintenance')),
                ('property', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='myappLubd.property')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('property', 'preventive_maintenance', 'reminder_type', 'scheduled_date'), name='uniq_pm_line_reminder_reservation')],
            },
        ),
    ]
