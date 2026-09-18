from django.db import migrations


CAPABILITIES = {
    'starter': {
        'preventive_maintenance': False,
        'pm_schedules': False,
        'technician_kpi': False,
        'advanced_reports': False,
        'csv_export': False,
        'multi_property': False,
        'advanced_property_permissions': False,
        'portfolio_dashboard': False,  # NOT IMPLEMENTED
    },
    'pro': {
        'preventive_maintenance': True,
        'pm_schedules': True,
        'technician_kpi': True,
        'advanced_reports': True,
        'csv_export': True,
        'multi_property': False,
        'advanced_property_permissions': False,
        'portfolio_dashboard': False,  # NOT IMPLEMENTED
    },
    'enterprise': {
        'preventive_maintenance': True,
        'pm_schedules': True,
        'technician_kpi': True,
        'advanced_reports': True,
        'csv_export': True,
        'multi_property': True,
        'advanced_property_permissions': True,
        'portfolio_dashboard': False,  # NOT IMPLEMENTED
    },
}


def populate_capabilities(apps, schema_editor):
    SubscriptionPlan = apps.get_model('myappLubd', 'SubscriptionPlan')
    for code, features in CAPABILITIES.items():
        SubscriptionPlan.objects.filter(code=code).update(features=features)


class Migration(migrations.Migration):
    dependencies = [('myappLubd', '0090_update_commercial_plan_capacity')]

    operations = [migrations.RunPython(populate_capabilities, migrations.RunPython.noop)]
