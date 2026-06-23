from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0068_tenant_timezone_default'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='user',
            name='uses_roster',
        ),
        migrations.DeleteModel(
            name='RosterLeave',
        ),
    ]
