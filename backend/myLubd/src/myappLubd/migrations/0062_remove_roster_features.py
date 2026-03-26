from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("myappLubd", "0061_merge_20260127_1338"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="uses_roster",
        ),
        migrations.DeleteModel(
            name="RosterLeave",
        ),
    ]
