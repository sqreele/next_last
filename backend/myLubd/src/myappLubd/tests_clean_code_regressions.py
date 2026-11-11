"""Regression coverage for admin hooks and batched machine scheduling."""
import ast
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from .admin import InventoryAdmin, WorkspaceReportAdmin
from .models import Inventory, Job, Machine, MaintenanceProcedure, Property, Tenant, WorkspaceReport
from .serializers import MachineListSerializer


class AdminSaveHookTests(SimpleTestCase):
    def test_report_quota_rejects_before_model_save(self):
        tenant = SimpleNamespace(pk=7)
        user = SimpleNamespace(pk=1)
        report = SimpleNamespace(pk=None, property=SimpleNamespace(tenant=tenant), created_by=None,
                                 image_1=SimpleUploadedFile('report.jpg', b'1234'))
        with patch('myappLubd.admin.transaction.atomic', return_value=nullcontext()), \
             patch('myappLubd.tenancy.lock_tenants_for_membership_change', return_value={7: tenant}), \
             patch('myappLubd.tenancy.enforce_storage_limit', side_effect=ValidationError('Quota exceeded')) as quota, \
             patch.object(admin.ModelAdmin, 'save_model') as save:
            with self.assertRaises(ValidationError):
                WorkspaceReportAdmin(WorkspaceReport, admin.site).save_model(
                    SimpleNamespace(user=user), report, None, False,
                )
            quota.assert_called_once_with(tenant, 4)
            save.assert_not_called()

    def test_report_quota_and_creator_both_run_on_success(self):
        tenant = SimpleNamespace(pk=7)
        user = SimpleNamespace(pk=1)
        report = SimpleNamespace(pk=None, property=SimpleNamespace(tenant=tenant), created_by=None,
                                 image_1=SimpleUploadedFile('report.jpg', b'1234'))
        with patch('myappLubd.admin.transaction.atomic', return_value=nullcontext()), \
             patch('myappLubd.tenancy.lock_tenants_for_membership_change', return_value={7: tenant}), \
             patch('myappLubd.tenancy.enforce_storage_limit') as quota, \
             patch.object(admin.ModelAdmin, 'save_model') as save:
            WorkspaceReportAdmin(WorkspaceReport, admin.site).save_model(SimpleNamespace(user=user), report, None, False)
            quota.assert_called_once_with(tenant, 4)
            save.assert_called_once()
            self.assertIs(report.created_by, user)

    def test_report_update_records_updater(self):
        user = SimpleNamespace(pk=1)
        report = SimpleNamespace(pk=None, property=None, created_by=SimpleNamespace(pk=2))
        with patch.object(admin.ModelAdmin, 'save_model') as save:
            WorkspaceReportAdmin(WorkspaceReport, admin.site).save_model(SimpleNamespace(user=user), report, None, True)
            self.assertIs(report.updated_by, user)
            self.assertEqual(report.created_by.pk, 2)
            save.assert_called_once()

    def test_inventory_keeps_validation_and_creator_assignment(self):
        user = SimpleNamespace(is_superuser=True)
        item = SimpleNamespace(pk=None, created_by_id=None, property_id=1, category_id=1,
                               property=SimpleNamespace(tenant_id=1), category=SimpleNamespace(tenant_id=1, is_active=True))
        model_admin = InventoryAdmin(Inventory, admin.site)
        with patch.object(admin.ModelAdmin, 'save_model') as save:
            model_admin.save_model(SimpleNamespace(user=user), item, SimpleNamespace(changed_data=[]), False)
            self.assertIs(item.created_by, user)
            save.assert_called_once()
        item.category.tenant_id = 2
        with patch.object(admin.ModelAdmin, 'save_model') as save:
            with self.assertRaises(ValidationError):
                model_admin.save_model(SimpleNamespace(user=user), item, SimpleNamespace(changed_data=[]), False)
            save.assert_not_called()

    def test_service_public_imports_keep_the_original_classes(self):
        from importlib import import_module
        from . import services
        domains = {
            'JobService': 'jobs', 'PropertyService': 'properties',
            'RoomGroupingService': 'room_grouping', 'MachineService': 'machines',
            'MaintenanceProcedureService': 'procedures', 'NotificationService': 'notifications',
            'PreventiveMaintenanceService': 'preventive_maintenance',
        }
        for name, domain in domains.items():
            implementation = import_module(f'myappLubd.service_modules.{domain}')
            self.assertIs(getattr(services, name), getattr(implementation, name))

    def test_moved_admins_preserve_public_imports_and_registration(self):
        from importlib import import_module
        from . import admin as public_admin
        domains = {
            'MachineAdmin': 'machines', 'JobAdmin': 'jobs', 'JobImageAdmin': 'jobs',
            'InventoryAdmin': 'inventory', 'InventoryUsageAdmin': 'inventory',
            'WorkspaceReportAdmin': 'reports',
            'UserAdmin': 'users', 'PropertyAdmin': 'locations', 'RoomAdmin': 'locations',
            'PreventiveMaintenanceAdmin': 'preventive_maintenance', 'PMMasterPlanAdmin': 'preventive_maintenance',
            'MaintenanceProcedureAdmin': 'procedures', 'UtilityConsumptionAdmin': 'utilities',
            'TenantAdmin': 'tenancy', 'TenantMembershipAdmin': 'tenancy',
        }
        for name, domain in domains.items():
            implementation = import_module(f'myappLubd.admin_modules.{domain}')
            admin_class = getattr(implementation, name)
            self.assertIs(getattr(public_admin, name), admin_class)
            registered = [instance for instance in admin.site._registry.values() if type(instance) is admin_class]
            self.assertEqual(len(registered), 1, name)

    def test_pm_admin_keeps_pm_date_filters_when_reports_export_same_names(self):
        from .admin_modules.preventive_maintenance import PreventiveMaintenanceAdmin
        from .admin_modules.shared import DueDateMonthFilter, CompletedDateMonthFilter
        from .admin_modules.reports import DueDateMonthFilter as ReportDueDateMonthFilter
        self.assertIn(DueDateMonthFilter, PreventiveMaintenanceAdmin.list_filter)
        self.assertIn(CompletedDateMonthFilter, PreventiveMaintenanceAdmin.list_filter)
        self.assertNotIn(ReportDueDateMonthFilter, PreventiveMaintenanceAdmin.list_filter)

    def test_serializer_public_imports_reexport_domain_implementations(self):
        from importlib import import_module
        from . import serializers as public_serializers
        domains = {
            'JobSerializer': 'jobs', 'JobDashboardSerializer': 'jobs',
            'JobImageSerializer': 'job_images', 'RoomSerializer': 'locations',
            'UserSerializer': 'users', 'UserReadSerializer': 'users',
            'MachineListSerializer': 'machines', 'MachineDetailSerializer': 'machine_details',
            'PMMasterPlanSerializer': 'pm_master', 'PreventiveMaintenanceListSerializer': 'pm_list',
            'PreventiveMaintenanceDetailSerializer': 'pm_detail',
            'PreventiveMaintenanceCreateUpdateSerializer': 'pm_write',
            'PreventiveMaintenanceCompleteSerializer': 'pm_complete',
            'InventorySerializer': 'inventory', 'UtilityConsumptionSerializer': 'utilities',
        }
        for name, domain in domains.items():
            implementation = import_module(f'myappLubd.serializer_modules.{domain}')
            self.assertIs(getattr(public_serializers, name), getattr(implementation, name))
        self.assertIs(public_serializers.UserSerializer, public_serializers.UserWriteSerializer)

    def test_view_public_imports_and_existing_urls_keep_their_implementations(self):
        from importlib import import_module
        from django.urls import resolve
        from . import views
        domains = {
            'JobViewSet': ('jobs', '/api/v1/jobs/'),
            'PreventiveMaintenanceViewSet': ('preventive_maintenance', '/api/v1/preventive-maintenance/'),
            'MachineViewSet': ('machines', '/api/v1/machines/'),
            'PropertyViewSet': ('properties', '/api/v1/properties/'),
            'UserViewSet': ('users', '/api/v1/users/'),
            'InventoryViewSet': ('inventory', '/api/v1/inventory/'),
            'TenantViewSet': ('tenancy', '/api/v1/tenants/'),
        }
        for name, (domain, url) in domains.items():
            implementation = getattr(import_module(f'myappLubd.view_modules.{domain}'), name)
            self.assertIs(getattr(views, name), implementation)
            self.assertIs(resolve(url).func.cls, implementation)
        for name, domain, url in (
            ('chat_with_gemini', 'ai', '/api/v1/ai/chat/'),
            ('health_check', 'system', '/api/v1/health/'),
            ('get_dashboard_summary', 'dashboard', '/api/v1/dashboard/summary/'),
        ):
            implementation = getattr(import_module(f'myappLubd.view_modules.{domain}'), name)
            self.assertIs(getattr(views, name), implementation)
            self.assertIs(resolve(url).func, implementation)

    def test_production_modules_do_not_shadow_definitions(self):
        root = Path(__file__).parent
        paths = [root / name for name in ('admin.py', 'models.py', 'serializers.py', 'services.py', 'views.py')]
        paths.extend((root / 'service_modules').glob('*.py'))
        paths.extend((root / 'admin_modules').glob('*.py'))
        paths.extend((root / 'serializer_modules').glob('*.py'))
        paths.extend((root / 'view_modules').glob('*.py'))
        for path in paths:
            filename = path.name
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if not isinstance(node, (ast.Module, ast.ClassDef)):
                    continue
                names = set()
                for child in node.body:
                    if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                        continue
                    if any(isinstance(decorator, ast.Attribute) and decorator.attr in ('setter', 'deleter')
                           for decorator in getattr(child, 'decorator_list', [])):
                        continue
                    self.assertNotIn(child.name, names, f'{filename}:{child.lineno}: duplicate {child.name}')
                    names.add(child.name)


class MachineDateQueryTests(TestCase):
    def test_serializing_multiple_machines_uses_four_date_queries(self):
        tenant = Tenant.objects.create(name='Batch dates')
        property_obj = Property.objects.create(name='Batch hotel', tenant=tenant)
        user = get_user_model().objects.create_user(username='batch-dates')
        template = MaintenanceProcedure.objects.create(property=property_obj, name='Weekly', description='Inspect', frequency='weekly')
        completed_at = timezone.now()
        machines = [Machine.objects.create(name=f'Pump {index}', property=property_obj) for index in range(8)]
        template.machines.set(machines)
        for machine in machines:
            Job.objects.create(property=property_obj, user=user, machine=machine, procedure_template=template,
                               status='completed', completed_at=completed_at, is_preventivemaintenance=True)
        with self.assertNumQueries(4):
            data = MachineListSerializer(machines, many=True).data
        self.assertEqual(len(data), 8)
        self.assertTrue(all(row['next_maintenance_date'] is not None for row in data))
