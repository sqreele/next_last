import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0080_tenantinvitation'),
    ]

    operations = [
        migrations.AlterField(
            model_name='tenantinvitation',
            name='accepted_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='accepted_tenant_invitations', to=settings.AUTH_USER_MODEL),
        ),
    ]
