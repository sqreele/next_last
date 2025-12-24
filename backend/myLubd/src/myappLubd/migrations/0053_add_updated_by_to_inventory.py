from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0052_inventory_m2m_job_pm'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='inventory',
            name='updated_by',
            field=models.ForeignKey(
                blank=True,
                help_text='User who last updated this inventory item',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='updated_inventory_items',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
