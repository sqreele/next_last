# Generated manually
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0014_userprofile_password_reset_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='preventivemaintenance',
            name='procedure',
            field=models.TextField(blank=True, null=True, help_text='Maintenance procedure details'),
        ),
    ]