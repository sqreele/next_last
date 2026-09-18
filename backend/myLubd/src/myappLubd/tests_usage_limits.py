from datetime import timedelta
import base64

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import (
    Inventory,
    InventoryCategory,
    Job,
    JobImage,
    Machine,
    PMMasterPlan,
    PreventiveMaintenance,
    PreventiveMaintenanceImage,
    Property,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
)
from .tenancy import (
    SubscriptionLimitReached,
    enforce_subscription_limit,
    enforce_storage_limit,
    get_asset_usage,
    get_monthly_job_usage,
    get_pm_schedule_usage,
    get_tenant_storage_usage_bytes,
    tenant_limit_snapshot,
)


class UsageLimitHelperTests(TestCase):
    PNG = base64.b64decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    )

    def setUp(self):
        self.owner = self._user('usage-owner')
        self.plan = SubscriptionPlan.objects.create(
            code='usage-test',
            name='Usage test',
            max_monthly_work_orders=3,
            max_pm_schedules=2,
            max_assets=2,
            max_storage_mb=1,
        )
        self.tenant = Tenant.objects.create(
            name='Usage test tenant', owner=self.owner, timezone='Asia/Bangkok',
        )
        TenantSubscription.objects.create(
            tenant=self.tenant, plan=self.plan, status='active',
            current_period_end=timezone.localdate() + timedelta(days=30),
        )
        TenantMembership.objects.create(
            tenant=self.tenant, user=self.owner, role='owner',
        )
        self.property = Property.objects.create(name='Usage property', tenant=self.tenant)
        self.other_tenant = Tenant.objects.create(name='Other usage tenant')
        self.other_property = Property.objects.create(name='Other usage property', tenant=self.other_tenant)

    def _user(self, username):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_user(username=username, password='pass')

    def _job(self, property_obj=None, created_at=None, status='pending'):
        return Job.objects.create(
            user=self.owner,
            updated_by=self.owner,
            property=property_obj or self.property,
            description='quota job',
            remarks='',
            status=status,
            created_at=created_at or timezone.now(),
        )

    def test_monthly_jobs_are_tenant_local_and_status_independent(self):
        now = timezone.now()
        self.assertEqual(get_monthly_job_usage(self.tenant, at=now), 0)
        for status in ('pending', 'in_progress', 'completed', 'cancelled'):
            self._job(status=status)
        self._job(created_at=now - timedelta(days=40))
        self._job(property_obj=self.other_property, created_at=now)
        self.assertEqual(get_monthly_job_usage(self.tenant, at=now), 4)
        next_month = (now.replace(day=28) + timedelta(days=5)).replace(day=1)
        self.assertEqual(get_monthly_job_usage(self.tenant, at=next_month), 0)

    def test_usage_limits_return_stable_error_at_limit(self):
        for _ in range(self.plan.max_monthly_work_orders):
            self._job()
        with self.assertRaises(SubscriptionLimitReached) as raised:
            enforce_subscription_limit(self.tenant, 'max_monthly_work_orders')
        self.assertEqual(raised.exception.detail['code'], 'subscription_limit_reached')
        self.assertEqual(raised.exception.detail['limit'], 'max_monthly_work_orders')

    def test_pm_usage_counts_master_plans_not_materialized_occurrences(self):
        machine = Machine.objects.create(name='PM machine', property=self.property)
        other_machine = Machine.objects.create(name='Other PM machine', property=self.other_property)
        for index in range(2):
            plan = PMMasterPlan.objects.create(
                title=f'Plan {index}',
                start_date=timezone.now(),
                created_by=self.owner,
            )
            plan.machines.add(machine)
        occurrence = PreventiveMaintenance.objects.create(
            pmtitle='Generated occurrence',
            scheduled_date=timezone.now(),
            master_plan=PMMasterPlan.objects.filter(machines=machine).first(),
            created_by=self.owner,
        )
        occurrence.machines.add(machine)
        foreign_plan = PMMasterPlan.objects.create(
            title='Foreign plan', start_date=timezone.now(), created_by=self.owner,
        )
        foreign_plan.machines.add(other_machine)
        self.assertEqual(get_pm_schedule_usage(self.tenant), 2)
        with self.assertRaises(SubscriptionLimitReached):
            enforce_subscription_limit(self.tenant, 'max_pm_schedules')

    def test_asset_usage_is_machine_only_and_tenant_isolated(self):
        Machine.objects.create(name='Asset one', property=self.property)
        Machine.objects.create(name='Asset two', property=self.property)
        Machine.objects.create(name='Foreign asset', property=self.other_property)
        self.assertEqual(get_asset_usage(self.tenant), 2)
        with self.assertRaises(SubscriptionLimitReached):
            enforce_subscription_limit(self.tenant, 'max_assets')

    @override_settings(MEDIA_ROOT='/tmp/staymaint-usage-limit-tests')
    def test_storage_accounts_job_pm_machine_and_inventory_files(self):
        machine = Machine.objects.create(name='Stored machine', property=self.property)
        machine.image.save('machine.bin', ContentFile(b'1234'), save=True)
        job = self._job()
        JobImage.objects.create(
            job=job, image=ContentFile(self.PNG, name='job.png'), uploaded_by=self.owner,
        )
        pm = PreventiveMaintenance.objects.create(
            pmtitle='Stored PM', scheduled_date=timezone.now(), job=job,
            created_by=self.owner,
        )
        PreventiveMaintenanceImage.objects.create(
            preventive_maintenance=pm,
            image_type='before',
            checksum='stored-pm-checksum',
            image=ContentFile(self.PNG, name='pm.png'),
            uploaded_by=self.owner,
        )
        category = InventoryCategory.objects.create(
            tenant=self.tenant, name='Stored category', code='stored-category',
        )
        item = Inventory.objects.create(
            name='Stored inventory', category=category, property=self.property,
        )
        item.image.save('inventory.bin', ContentFile(b'1234567'), save=True)
        expected = sum(int(field.size) for field in (
            machine.image,
            job.job_images.first().image,
            pm.images.first().image,
            item.image,
        ))
        current = get_tenant_storage_usage_bytes(self.tenant)
        self.assertEqual(current, expected)
        snapshot = tenant_limit_snapshot(self.tenant)
        self.assertEqual(snapshot['usage']['storage_mb'], 0)
        enforce_storage_limit(self.tenant, 1024 * 1024 - current)
        with self.assertRaises(SubscriptionLimitReached):
            enforce_storage_limit(self.tenant, 1024 * 1024 - current + 1)
