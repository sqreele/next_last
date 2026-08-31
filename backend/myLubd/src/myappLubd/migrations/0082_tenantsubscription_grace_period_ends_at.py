from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0081_alter_tenantinvitation_accepted_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenantsubscription',
            name='grace_period_ends_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
