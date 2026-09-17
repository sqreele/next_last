from decimal import Decimal

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class CommercialPricingMigrationTests(TransactionTestCase):
    migrate_from = ('myappLubd', '0088_platformmembership')
    migrate_to = ('myappLubd', '0089_update_commercial_pricing_plans')

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps
        Plan = old_apps.get_model('myappLubd', 'SubscriptionPlan')
        Tenant = old_apps.get_model('myappLubd', 'Tenant')
        Subscription = old_apps.get_model('myappLubd', 'TenantSubscription')

        self.plan_ids = {}
        for code, price in (('starter', '10.00'), ('pro', '20.00'), ('enterprise', '40.00')):
            plan = Plan.objects.create(code=code, name=f'Legacy {code}', monthly_price=price)
            self.plan_ids[code] = plan.pk
        self.tenant = Tenant.objects.create(name='Commercial pricing migration tenant')
        self.subscription = Subscription.objects.create(
            tenant=self.tenant, plan_id=self.plan_ids['starter'], status='active',
        )

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        self.apps = executor.loader.project_state([self.migrate_to]).apps

    def tearDown(self):
        MigrationExecutor(connection).migrate(
            [MigrationExecutor(connection).loader.graph.leaf_nodes('myappLubd')[0]]
        )
        super().tearDown()

    def test_updates_prices_without_renaming_plans_or_relationships(self):
        Plan = self.apps.get_model('myappLubd', 'SubscriptionPlan')
        Subscription = self.apps.get_model('myappLubd', 'TenantSubscription')

        self.assertEqual(
            list(Plan.objects.filter(code__in=('starter', 'pro', 'enterprise')).order_by('code').values_list('code', 'monthly_price')),
            [('enterprise', Decimal('60.00')), ('pro', Decimal('30.00')), ('starter', Decimal('15.00'))],
        )
        self.assertFalse(Plan.objects.filter(code='basic').exists())
        self.assertEqual(Plan.objects.get(code='starter').pk, self.plan_ids['starter'])
        self.assertEqual(Subscription.objects.get(pk=self.subscription.pk).plan_id, self.plan_ids['starter'])
