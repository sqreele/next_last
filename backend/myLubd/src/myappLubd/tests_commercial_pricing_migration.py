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


class CommercialPlanCapacityMigrationTests(TransactionTestCase):
    migrate_from = ('myappLubd', '0089_update_commercial_pricing_plans')
    migrate_to = ('myappLubd', '0090_update_commercial_plan_capacity')

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps
        Plan = old_apps.get_model('myappLubd', 'SubscriptionPlan')
        Tenant = old_apps.get_model('myappLubd', 'Tenant')
        Property = old_apps.get_model('myappLubd', 'Property')
        Subscription = old_apps.get_model('myappLubd', 'TenantSubscription')

        self.plan_ids = {}
        for code, name, price in (
            ('starter', 'Basic', '15.00'),
            ('pro', 'Pro', '30.00'),
            ('enterprise', 'Enterprise', '60.00'),
        ):
            plan, _ = Plan.objects.get_or_create(
                code=code,
                defaults={'name': name, 'monthly_price': price},
            )
            plan.name = name
            plan.monthly_price = price
            plan.max_users = 2
            plan.max_properties = 1
            plan.save(update_fields=['name', 'monthly_price', 'max_users', 'max_properties'])
            self.plan_ids[code] = plan.pk

        self.tenant = Tenant.objects.create(name='Commercial capacity migration tenant')
        self.property = Property.objects.create(
            name='Preserved capacity migration property',
            tenant=self.tenant,
        )
        self.subscription = Subscription.objects.create(
            tenant=self.tenant,
            plan_id=self.plan_ids['enterprise'],
            status='active',
        )
        self.property_count = Property.objects.count()

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        self.apps = executor.loader.project_state([self.migrate_to]).apps

    def tearDown(self):
        MigrationExecutor(connection).migrate(
            [MigrationExecutor(connection).loader.graph.leaf_nodes('myappLubd')[0]]
        )
        super().tearDown()

    def test_updates_capacities_without_renaming_or_reassigning(self):
        Plan = self.apps.get_model('myappLubd', 'SubscriptionPlan')
        Subscription = self.apps.get_model('myappLubd', 'TenantSubscription')
        Property = self.apps.get_model('myappLubd', 'Property')

        self.assertEqual(
            list(Plan.objects.filter(code__in=('starter', 'pro', 'enterprise')).order_by('code').values_list(
                'code', 'name', 'monthly_price', 'max_users', 'max_properties',
            )),
            [
                ('enterprise', 'Enterprise', Decimal('60.00'), 50, 5),
                ('pro', 'Pro', Decimal('30.00'), 10, 1),
                ('starter', 'Basic', Decimal('15.00'), 4, 1),
            ],
        )
        self.assertFalse(Plan.objects.filter(code='basic').exists())
        self.assertEqual(Subscription.objects.get(pk=self.subscription.pk).plan_id, self.plan_ids['enterprise'])
        self.assertEqual(Property.objects.count(), self.property_count)
        self.assertTrue(Property.objects.filter(pk=self.property.pk).exists())
