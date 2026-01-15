from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0055_add_workspace_report_images_5_to_15'),
    ]

    operations = [
        migrations.AddField(
            model_name='utilityconsumption',
            name='electricity_cost_budget',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Budgeted electricity cost for the month', max_digits=10, null=True),
        ),
    ]
