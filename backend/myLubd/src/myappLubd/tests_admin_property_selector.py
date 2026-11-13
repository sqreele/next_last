from django.contrib import admin
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

from .admin_site import SESSION_KEY, property_lookup
from .models import Job, JobComment, Machine, MaintenanceChecklist, MaintenanceProcedure, PreventiveMaintenance, Property, Room, User


class AdminPropertySelectorTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username='site-selector-admin', email='selector@example.com', password='test-password',
        )
        cls.first = Property.objects.create(name='First selector site')
        cls.second = Property.objects.create(name='Second selector site')
        cls.room = Room.objects.create(name='101', property=cls.first)
        cls.other_room = Room.objects.create(name='201', property=cls.second)
        cls.job = Job.objects.create(description='First site job', property=cls.first, user=cls.user)
        cls.other_job = Job.objects.create(description='Second site job', property=cls.second, user=cls.user)
        cls.comment = JobComment.objects.create(job=cls.job, author=cls.user, comment='First site comment')
        cls.other_comment = JobComment.objects.create(job=cls.other_job, author=cls.user, comment='Second site comment')

    def setUp(self):
        self.client.force_login(self.user)
        self.url = reverse('admin:select_property')

    def choose(self, value, **kwargs):
        return self.client.post(self.url, {'property': value, **kwargs}, secure=True)

    def test_header_and_persistent_filter_across_models_and_clear(self):
        response = self.client.get(reverse('admin:index'), secure=True)
        self.assertContains(response, 'Available sites')
        self.assertContains(response, self.first.name)
        self.assertContains(response, self.second.name)
        self.assertEqual(self.choose(self.first.pk).status_code, 302)
        for model, expected in ((Room, self.room), (Job, self.job), (JobComment, self.comment)):
            response = self.client.get(
                reverse(f'admin:myappLubd_{model._meta.model_name}_changelist'), secure=True,
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(list(response.context['cl'].queryset), [expected])
        self.choose('')
        response = self.client.get(reverse('admin:myappLubd_room_changelist'), secure=True)
        self.assertEqual(response.context['cl'].queryset.count(), 2)

    def test_form_choices_and_initial_property_follow_selection(self):
        self.choose(self.first.pk)
        response = self.client.get(reverse('admin:myappLubd_room_add'), secure=True)
        form = response.context['adminform'].form
        self.assertEqual(list(form.fields['property'].queryset), [self.first])
        self.assertEqual(form.initial['property'], self.first.pk)

    def test_only_authorized_properties_are_offered_and_accepted(self):
        staff = User.objects.create_user(username='selector-staff', is_staff=True)
        self.client.force_login(staff)
        response = self.client.get(reverse('admin:index'), secure=True)
        self.assertNotContains(response, self.first.name)
        self.assertEqual(self.choose(self.first.pk).status_code, 400)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_procedure_related_machines_use_header_property_on_add_and_owner_on_edit(self):
        machine = Machine.objects.create(name='First procedure machine', property=self.first)
        Machine.objects.create(name='Other procedure machine', property=self.second)
        self.choose(self.first.pk)
        response = self.client.get(reverse('admin:myappLubd_maintenanceprocedure_add'), secure=True)
        form = response.context['adminform'].form
        self.assertEqual(form.initial['property'], self.first.pk)
        self.assertEqual(list(form.fields['machines'].queryset), [machine])

        procedure = MaintenanceProcedure.objects.create(name='Selector procedure', property=self.first)
        procedure.machines.add(machine)
        self.choose('')
        response = self.client.get(
            reverse('admin:myappLubd_maintenanceprocedure_change', args=[procedure.pk]), secure=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(response.context['adminform'].form.fields['machines'].queryset), [machine])

    def test_stale_selection_is_cleared_after_access_is_revoked(self):
        removed = Property.objects.create(name='Removed selector site')
        session = self.client.session
        session[SESSION_KEY] = removed.pk
        session.save()
        removed.delete()
        response = self.client.get(reverse('admin:index'), secure=True)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(SESSION_KEY, self.client.session)

    def test_machine_only_maintenance_and_children_follow_property(self):
        expected = []
        for property_obj in (self.first, self.second):
            machine = Machine.objects.create(name='Selector machine', property=property_obj)
            maintenance = PreventiveMaintenance.objects.create(scheduled_date=timezone.now(), created_by=self.user)
            maintenance.machines.add(machine)
            checklist = MaintenanceChecklist.objects.create(maintenance=maintenance, item='Inspect')
            expected.append((maintenance, checklist))
        self.choose(self.first.pk)
        for model, item in zip((PreventiveMaintenance, MaintenanceChecklist), expected[0]):
            response = self.client.get(reverse(f'admin:myappLubd_{model._meta.model_name}_changelist'), secure=True)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(list(response.context['cl'].queryset), [item])

    def test_post_required_and_csrf_protected(self):
        self.assertEqual(self.client.get(self.url, secure=True).status_code, 405)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.user)
        self.assertEqual(csrf_client.post(self.url, {'property': self.first.pk}, secure=True).status_code, 403)

    def test_invalid_selection_and_redirects(self):
        for value in ('bad-id', '999999999'):
            self.assertEqual(self.choose(value).status_code, 400)
        room_list = reverse('admin:myappLubd_room_changelist')
        response = self.choose(self.first.pk, next=room_list)
        self.assertEqual(response.url, room_list)
        for candidate in ('https://example.com/', '//example.com/', reverse('admin:myappLubd_room_change', args=[self.other_room.pk])):
            self.assertEqual(self.choose(self.first.pk, next=candidate).url, reverse('admin:index'))

    def test_all_registered_property_lookups_are_valid(self):
        for model in admin.site._registry:
            lookup = property_lookup(model)
            if lookup:
                with self.subTest(model=model.__name__):
                    # Compiling resolves every relationship, including indirect ownership.
                    str(model.objects.filter(**{lookup: self.first.pk}).query)
