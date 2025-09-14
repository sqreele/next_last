# Generated manually for adding property fields to UserProfile

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0024_add_performance_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='property_name',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='property_id',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
    ]
