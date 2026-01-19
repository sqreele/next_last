from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("myappLubd", "0056_add_electricity_cost_budget_to_utility_consumption"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="uses_roster",
            field=models.BooleanField(default=False, help_text="Enable roster management access for this user"),
        ),
    ]
