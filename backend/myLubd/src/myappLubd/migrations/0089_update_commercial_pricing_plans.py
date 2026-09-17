from django.db import migrations


PLAN_DETAILS = {
    'starter': {'name': 'Basic', 'description': 'For small hotel teams that need a simple and reliable way to manage daily maintenance work.', 'monthly_price': '15.00', 'sort_order': 1},
    'pro': {'name': 'Pro', 'description': 'For active hotel engineering teams that need preventive maintenance, reporting, and better operational visibility.', 'monthly_price': '30.00', 'sort_order': 2},
    'enterprise': {'name': 'Enterprise', 'description': 'For hotel groups and multi-property engineering operations that need centralized maintenance management.', 'monthly_price': '60.00', 'sort_order': 3},
}


def update_commercial_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('myappLubd', 'SubscriptionPlan')
    for code, details in PLAN_DETAILS.items():
        plan, _ = SubscriptionPlan.objects.get_or_create(code=code)
        for field, value in details.items():
            setattr(plan, field, value)
        plan.billing_interval = 'monthly'
        plan.is_active = True
        plan.save()


def reverse_commercial_plans(apps, schema_editor):
    # Prices are commercial data; rollback must not alter plan identities or
    # existing subscriber records.
    pass


class Migration(migrations.Migration):
    dependencies = [('myappLubd', '0088_platformmembership')]
    operations = [migrations.RunPython(update_commercial_plans, reverse_commercial_plans)]
