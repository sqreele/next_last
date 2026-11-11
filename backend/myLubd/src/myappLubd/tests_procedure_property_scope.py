"""Property isolation of owned templates in API, admin and exports."""
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase, RequestFactory
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from .models import (Tenant, TenantMembership, Property, Machine, MaintenanceProcedure,
    PreventiveMaintenance, MaintenanceChecklist, MaintenanceHistory, MaintenanceSchedule)
from .serializers import MaintenanceProcedureSerializer, MaintenanceProcedureListSerializer


class ProcedurePropertyScopeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.staff = User.objects.create_user(username='scope-staff', is_staff=True)
        cls.superuser = User.objects.create_superuser(username='scope-root', password='pw')
        cls.tenant = Tenant.objects.create(name='Scope tenant')
        other_tenant = Tenant.objects.create(name='Other tenant')
        cls.own = Property.objects.create(name='Own property', tenant=cls.tenant)
        cls.sibling = Property.objects.create(name='Sibling property', tenant=cls.tenant)
        cls.foreign = Property.objects.create(name='Foreign property', tenant=other_tenant)
        cls.membership = TenantMembership.objects.create(user=cls.staff, tenant=cls.tenant, role='supervisor')
        cls.membership.properties.add(cls.own)
        cls.a = Machine.objects.create(name='Visible machine', property=cls.own)
        cls.b = Machine.objects.create(name='Secret sibling machine', property=cls.sibling)
        cls.c = Machine.objects.create(name='Secret foreign machine', property=cls.foreign)
        cls.template = MaintenanceProcedure.objects.create(property=cls.own, name='Own template', description='Own instructions', required_tools='wrench')
        cls.template.machines.add(cls.a)
        cls.foreign_template = MaintenanceProcedure.objects.create(property=cls.foreign, name="Secret foreign template", description="Private")
        cls.foreign_template.machines.add(cls.c)
        cls.empty = MaintenanceProcedure.objects.create(property=cls.own, name='Unused own template', description='Private unused')
        cls.pms = []
        for machine in [cls.a, cls.b, cls.c]:
            pm = PreventiveMaintenance.objects.create(pmtitle=machine.name, scheduled_date=timezone.now(), procedure_template=cls.template if machine == cls.a else None, created_by=cls.staff)
            pm.machines.add(machine)
            MaintenanceChecklist.objects.create(maintenance=pm, item=machine.name)
            MaintenanceHistory.objects.create(maintenance=pm, action='created')
            MaintenanceSchedule.objects.create(maintenance=pm, next_occurrence=timezone.now())
            cls.pms.append(pm)

    def request(self, user=None):
        req = RequestFactory().get('/')
        req.user = user or self.staff
        return req

    def test_list_retrieve_and_tool_search_hide_foreign_machine_usage(self):
        client = APIClient()
        client.force_authenticate(self.staff)
        for path in [reverse('myappLubd:maintenance-procedures-list'),
                     reverse('myappLubd:maintenance-procedures-detail', args=[self.template.pk]),
                     reverse('myappLubd:maintenance-procedures-search-by-tools') + '?tool=wrench']:
            response = client.get(path, secure=True)
            self.assertEqual(response.status_code, 200, response.content)
            text = str(response.data)
            self.assertIn(self.a.machine_id, text)
            self.assertNotIn(self.b.machine_id, text)
            self.assertNotIn(self.c.machine_id, text)
            self.assertNotIn(self.c.name, text)

    def test_own_unused_templates_remain_visible_and_count_only_accessible_pm(self):
        client = APIClient()
        client.force_authenticate(self.staff)
        response = client.get(reverse('myappLubd:maintenance-procedures-list'), secure=True)
        rows = {row['id']: row for row in response.data['results']}
        self.assertIn(self.empty.pk, rows)
        self.assertEqual(rows[self.template.pk]['schedule_count'], 1)

    def test_direct_serializers_scope_usage_and_fail_closed_without_request(self):
        for serializer in [MaintenanceProcedureSerializer, MaintenanceProcedureListSerializer]:
            row = serializer(self.template, context={'request': self.request()}).data
            self.assertEqual(row['machine_ids'], [self.a.machine_id])
            self.assertEqual(serializer(self.template).data['machines'], [])

    def test_superuser_keeps_global_machine_usage(self):
        row = MaintenanceProcedureSerializer(self.template, context={'request': self.request(self.superuser)}).data
        self.assertEqual(set(row['machine_ids']), {self.a.machine_id})

    def test_inactive_membership_hides_usage(self):
        self.membership.is_active = False
        self.membership.save()
        row = MaintenanceProcedureSerializer(self.template, context={'request': self.request()}).data
        self.assertEqual(row['machines'], [])

    def test_admin_list_detail_and_export_scope_usage(self):
        model_admin = admin.site._registry[MaintenanceProcedure]
        request = self.request()
        row = model_admin.get_queryset(request).get(pk=self.template.pk)
        self.assertEqual(model_admin.machine_count(row), 1)
        self.assertEqual(model_admin.properties_display(row), self.own.name)
        self.assertNotIn(self.c.name, model_admin.visible_machines_display(row))
        response = model_admin.export_maintenance_procedures_csv(request, model_admin.get_queryset(request))
        text = response.content.decode('utf-8-sig')
        self.assertIn(self.a.name, text)
        self.assertNotIn(self.b.name, text)
        self.assertNotIn(self.c.name, text)
        fields = [field for _, options in model_admin.get_fieldsets(request, row) for field in options['fields']]
        self.assertIn('machines', fields)
        self.assertIn('property', fields)

    def test_foreign_template_detail_and_step_mutations_are_inaccessible(self):
        client = APIClient()
        client.force_authenticate(self.staff)
        response = client.get(reverse('myappLubd:maintenance-procedures-detail', args=[self.foreign_template.pk]), secure=True)
        self.assertEqual(response.status_code, 404)
        response = client.post(reverse('myappLubd:maintenance-procedures-add-step', args=[self.foreign_template.pk]), {'title':'Forged'}, format='json', secure=True)
        self.assertEqual(response.status_code, 404)

    def test_template_property_is_required_and_immutable(self):
        for data in [{'name':'No owner', 'description':'Invalid'},
                     {'name':'Foreign', 'description':'Invalid', 'property_id':self.foreign.property_id}]:
            serializer = MaintenanceProcedureSerializer(data=data, context={'request':self.request()})
            self.assertFalse(serializer.is_valid())
        serializer = MaintenanceProcedureSerializer(self.template, data={'property_id':self.sibling.property_id}, partial=True,
                                                    context={'request':self.request(self.superuser)})
        self.assertFalse(serializer.is_valid())

    def test_template_machine_links_reject_other_properties_in_both_directions(self):
        from django.core.exceptions import ValidationError
        from django.db import transaction
        for add in [lambda: self.template.machines.add(self.b), lambda: self.b.maintenance_procedures.add(self.template)]:
            with self.assertRaises(ValidationError), transaction.atomic():
                add()

    def test_admin_scope_hides_foreign_and_ownerless_templates(self):
        orphan = MaintenanceProcedure.objects.create(name='Ownerless legacy', description='Needs assignment')
        model_admin = admin.site._registry[MaintenanceProcedure]
        visible = set(model_admin.get_queryset(self.request()).values_list('pk', flat=True))
        self.assertEqual(visible, {self.template.pk, self.empty.pk})
        self.assertIn(orphan.pk, set(model_admin.get_queryset(self.request(self.superuser)).values_list('pk', flat=True)))

    def test_pm_children_and_maintenance_choices_follow_canonical_property(self):
        for model in [MaintenanceChecklist, MaintenanceHistory, MaintenanceSchedule]:
            model_admin = admin.site._registry[model]
            self.assertEqual(set(model_admin.get_queryset(self.request()).values_list('maintenance_id', flat=True)), {self.pms[0].pk})
            field = model_admin.formfield_for_foreignkey(model._meta.get_field('maintenance'), self.request())
            self.assertEqual(set(field.queryset.values_list('pk', flat=True)), {self.pms[0].pk})

    def test_operational_admin_lists_and_forms_hide_other_properties(self):
        from .models import Room, Area, Job, JobImage, JobComment, UtilityConsumption, WorkspaceReport, PMMasterPlan
        from .admin_modules.property_scope import OperationalPropertyAdminMixin
        request = self.request()
        for model in [Property, Machine, Room, Area, Job, JobImage, JobComment,
                      UtilityConsumption, WorkspaceReport, PMMasterPlan, PreventiveMaintenance]:
            model_admin = admin.site._registry[model]
            self.assertIsInstance(model_admin, OperationalPropertyAdminMixin)
            field = model_admin.formfield_for_foreignkey(Machine._meta.get_field('property'), request)
            self.assertEqual(set(field.queryset.values_list('pk', flat=True)), {self.own.pk})
        self.assertEqual(set(admin.site._registry[Machine].get_queryset(request).values_list('pk', flat=True)), {self.a.pk})
        self.assertEqual(set(admin.site._registry[Property].get_queryset(request).values_list('pk', flat=True)), {self.own.pk})
        self.assertEqual(set(admin.site._registry[PreventiveMaintenance].get_queryset(request).values_list('pk', flat=True)), {self.pms[0].pk})

    def test_forged_machine_property_change_rejects_existing_pm_links(self):
        from .serializers import MachineUpdateSerializer
        serializer = MachineUpdateSerializer(self.a, data={'property_id': self.sibling.property_id}, partial=True,
                                             context={'request': self.request(self.superuser)})
        self.assertFalse(serializer.is_valid())
        self.assertIn('property_id', serializer.errors)
        self.a.refresh_from_db()
        self.assertEqual(self.a.property_id, self.own.pk)

    def test_unlinked_machine_can_move_property(self):
        from .serializers import MachineUpdateSerializer
        machine = Machine.objects.create(name='Unlinked machine', property=self.own)
        serializer = MachineUpdateSerializer(machine, data={'property_id': self.sibling.property_id}, partial=True,
                                             context={'request': self.request(self.superuser)})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        machine.refresh_from_db()
        self.assertEqual(machine.property_id, self.sibling.pk)

    def test_master_plan_admin_rejects_cross_property_machines(self):
        from .admin_modules.preventive_maintenance import PMMasterPlanAdminForm
        form = PMMasterPlanAdminForm(data={
            'title': 'Invalid shared plan', 'machines': [self.a.pk, self.b.pk],
            'frequency': 'monthly', 'start_date': timezone.now(),
            'lead_time_days': 7, 'created_by': self.staff.pk, 'active': True,
        })
        self.assertFalse(form.is_valid())
        self.assertIn('machines', form.errors)

    def test_machine_admin_rejects_pm_from_a_different_granted_property(self):
        from .admin_modules.machines import MachineAdminForm
        form = MachineAdminForm(data={
            'machine_id': self.a.machine_id, 'name': self.a.name, 'property': self.own.pk,
            'status': 'active', 'preventive_maintenances': [self.pms[1].pk],
        }, instance=self.a)
        self.assertFalse(form.is_valid())
        self.assertIn('preventive_maintenances', form.errors)

    def test_admin_changelists_render_and_foreign_machine_detail_is_unavailable(self):
        from django.contrib.auth.models import Permission
        self.staff.user_permissions.add(*Permission.objects.filter(content_type__app_label='myappLubd', codename__startswith='view_'))
        self.client.force_login(self.staff)
        for model in [Property, Machine, PreventiveMaintenance, MaintenanceProcedure, MaintenanceChecklist, MaintenanceHistory, MaintenanceSchedule]:
            response = self.client.get(reverse(f'admin:myappLubd_{model._meta.model_name}_changelist'), secure=True)
            self.assertEqual(response.status_code, 200, response.content[:300])
            self.assertNotContains(response, self.c.name)
        response = self.client.get(reverse('admin:myappLubd_machine_change', args=[self.c.pk]), secure=True)
        self.assertEqual(response.status_code, 302)
        self.assertNotIn('Secret foreign machine', str(response.content))

    def test_trashed_jobs_still_prevent_machine_property_reassignment(self):
        from django.core.exceptions import ValidationError
        from .models import Job
        machine = Machine.objects.create(name='Archived history', property=self.own)
        job = Job.objects.create(user=self.staff, property=self.own, machine=machine, description='Archived job')
        job.delete()
        machine.property = self.sibling
        with self.assertRaises(ValidationError):
            machine.clean()

    def test_custom_admin_property_and_room_filter_choices_do_not_leak(self):
        from .models import Job, Room
        from .admin import PropertyFilter, JobImagePropertyFilter, JobImageRoomFilter
        request = self.request()
        model_admin = admin.site._registry[Job]
        for filter_class in [PropertyFilter, JobImagePropertyFilter]:
            filt = filter_class(request, {}, Job, model_admin)
            self.assertEqual(filt.lookups(request, model_admin), [(str(self.own.pk), self.own.name)])
        Room.objects.create(name='Private foreign room', property=self.foreign)
        own = Room.objects.create(name='Own room', property=self.own)
        filt = JobImageRoomFilter(request, {}, Job, model_admin)
        self.assertEqual(filt.lookups(request, model_admin), [(str(own.room_id), own.name)])

    def test_company_technician_trash_stays_limited_to_assigned_jobs(self):
        from .models import Job, DeletedJob
        self.tenant.billing_model = 'property_quantity_v1'
        self.tenant.save(update_fields=['billing_model'])
        self.membership.role = 'technician'
        self.membership.save(update_fields=['role'])
        own = Job.objects.create(user=self.staff, assigned_to=self.staff, property=self.own, description='Own trash')
        other = Job.objects.create(user=self.staff, assigned_to=self.superuser, property=self.own, description='Other trash')
        own.delete()
        other.delete()
        rows = admin.site._registry[DeletedJob].get_queryset(self.request())
        self.assertEqual(set(rows.values_list('pk', flat=True)), {own.pk})

    def test_pm_and_master_plan_reject_template_from_another_accessible_property(self):
        from types import SimpleNamespace
        from .serializers import PreventiveMaintenanceCreateUpdateSerializer, PMMasterPlanSerializer
        request = SimpleNamespace(user=self.superuser, query_params={'property_id':self.own.property_id})
        common = {'machine_ids':[self.a.machine_id], 'procedure_template':self.foreign_template.pk}
        pm = PreventiveMaintenanceCreateUpdateSerializer(data={**common, 'pmtitle':'Invalid PM',
            'scheduled_date':timezone.now(), 'property_id':self.own.property_id}, context={'request':request})
        self.assertFalse(pm.is_valid())
        self.assertIn('procedure_template', pm.errors)
        plan = PMMasterPlanSerializer(data={**common, 'title':'Invalid plan', 'start_date':timezone.now()}, context={'request':request})
        self.assertFalse(plan.is_valid())
        self.assertIn('procedure_template', plan.errors)

    def test_template_api_create_duplicate_and_property_filter_keep_owner(self):
        client = APIClient()
        client.force_authenticate(self.superuser)
        response = client.post(reverse('myappLubd:maintenance-procedures-list'), {
            'name':'Owned new template', 'description':'Private', 'property_id':self.own.property_id,
        }, format='json', secure=True)
        self.assertEqual(response.status_code, 201, response.data)
        row = MaintenanceProcedure.objects.get(pk=response.data['id'])
        self.assertEqual(row.property_id, self.own.pk)
        response = client.post(reverse('myappLubd:maintenance-procedures-duplicate', args=[self.template.pk]),
                               {'new_name':'Owned copy'}, format='json', secure=True)
        self.assertEqual(response.status_code, 200, response.data)
        copy = MaintenanceProcedure.objects.get(pk=response.data['duplicate_id'])
        self.assertEqual(copy.property_id, self.own.pk)
        self.assertEqual(set(copy.machines.values_list('pk', flat=True)), {self.a.pk})
        response = client.get(reverse('myappLubd:maintenance-procedures-list'), {'property_id':self.own.property_id}, secure=True)
        self.assertNotIn(self.foreign_template.pk, {item['id'] for item in response.data['results']})

    def test_template_image_admin_is_scoped_to_its_template_owner(self):
        from .models import MaintenanceTaskImage
        a, b = MaintenanceTaskImage.objects.bulk_create([
            MaintenanceTaskImage(task=self.template, image_type='before', image_url='owned/a.jpg'),
            MaintenanceTaskImage(task=self.foreign_template, image_type='before', image_url='foreign/b.jpg'),
        ])
        model_admin = admin.site._registry[MaintenanceTaskImage]
        self.assertEqual(set(model_admin.get_queryset(self.request()).values_list('pk', flat=True)), {a.pk})
        field = model_admin.formfield_for_foreignkey(MaintenanceTaskImage._meta.get_field('task'), self.request())
        self.assertNotIn(self.foreign_template.pk, set(field.queryset.values_list('pk', flat=True)))
