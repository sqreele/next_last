from django.db import migrations, models
from django.db.models import Count, Q


def reject_duplicate_provider_ids(apps, schema_editor):
    subscription = apps.get_model('myappLubd', 'TenantSubscription')
    for field_name in ('external_customer_id', 'external_subscription_id'):
        duplicates = list(
            subscription.objects.exclude(**{f'{field_name}__isnull': True})
            .values(field_name)
            .annotate(count=Count('id'))
            .filter(count__gt=1)
            .values_list(field_name, flat=True)[:10]
        )
        if duplicates:
            raise RuntimeError(
                f'Cannot add Stripe provider-ID uniqueness: duplicate {field_name} values exist.'
            )


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0082_tenantsubscription_grace_period_ends_at'),
    ]

    operations = [
        migrations.RunPython(reject_duplicate_provider_ids, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='tenantsubscription',
            constraint=models.UniqueConstraint(
                condition=Q(external_customer_id__isnull=False),
                fields=('external_customer_id',),
                name='unique_nonnull_stripe_customer',
            ),
        ),
        migrations.AddConstraint(
            model_name='tenantsubscription',
            constraint=models.UniqueConstraint(
                condition=Q(external_subscription_id__isnull=False),
                fields=('external_subscription_id',),
                name='unique_nonnull_stripe_subscription',
            ),
        ),
        migrations.CreateModel(
            name='BillingWebhookEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider', models.CharField(max_length=32)),
                ('event_id', models.CharField(max_length=255)),
                ('event_type', models.CharField(max_length=255)),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('processed_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(choices=[('processing', 'Processing'), ('processed', 'Processed'), ('failed', 'Failed')], default='processing', max_length=20)),
                ('error_code', models.CharField(blank=True, max_length=64, null=True)),
            ],
            options={
                'ordering': ['-received_at'],
                'indexes': [models.Index(fields=['provider', 'status'], name='billing_event_status_idx')],
                'constraints': [models.UniqueConstraint(fields=('provider', 'event_id'), name='unique_billing_provider_event')],
            },
        ),
    ]
