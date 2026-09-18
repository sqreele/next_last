from django.db import migrations


COMMERCIAL_PLAN_CAPACITY = {
    'starter': {
        'name': 'Basic',
        'monthly_price': '15.00',
        'max_users': 4,
        'max_properties': 1,
    },
    'pro': {
        'name': 'Pro',
        'monthly_price': '30.00',
        'max_users': 10,
        'max_properties': 1,
    },
    'enterprise': {
        'name': 'Enterprise',
        'monthly_price': '60.00',
        'max_users': 50,
        'max_properties': 5,
    },
}


def update_commercial_plan_capacity(apps, schema_editor):
    SubscriptionPlan = apps.get_model('myappLubd', 'SubscriptionPlan')

    for code, defaults in COMMERCIAL_PLAN_CAPACITY.items():
        plan, _ = SubscriptionPlan.objects.get_or_create(code=code, defaults=defaults)
        changed = False
        for field, value in defaults.items():
            if getattr(plan, field) != value:
                setattr(plan, field, value)
                changed = True
        if changed:
            plan.save(update_fields=list(defaults))


def preserve_commercial_plan_capacity(apps, schema_editor):
    # Capacity changes are forward-only commercial configuration. Reversing
    # this migration must not guess prior limits or alter subscriber data.
    pass


class Migration(migrations.Migration):
    dependencies = [('myappLubd', '0089_update_commercial_pricing_plans')]

    operations = [
        migrations.RunPython(
            update_commercial_plan_capacity,
            preserve_commercial_plan_capacity,
        ),
    ]
