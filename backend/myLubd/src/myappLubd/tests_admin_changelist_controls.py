from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import Area, Property, Room


class AdminChangelistControlsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_superuser(
            username='list-controls-admin', password='test-password',
        )
        cls.property = Property.objects.create(name='List controls property')
        cls.active = Room.objects.create(name='101', property=cls.property, is_active=True)
        cls.inactive = Room.objects.create(name='102', property=cls.property, is_active=False)
        cls.unselected = Room.objects.create(name='103', property=cls.property, is_active=False)
        cls.area = Area.objects.create(name='Lobby', property=cls.property, is_active=False)

    def setUp(self):
        self.client.force_login(self.user)

    def test_shared_controls_load_on_multiple_admin_lists(self):
        for model in ('room', 'area', 'machine', 'job'):
            with self.subTest(model=model):
                response = self.client.get(reverse(f'admin:myappLubd_{model}_changelist'), secure=True)
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, 'myappLubd/js/admin_changelist.js')
                self.assertRegex(response.content.decode(), r'css/admin\.css\?v=[0-9a-f]{12}')
                self.assertRegex(response.content.decode(), r'js/admin_changelist\.js\?v=[0-9a-f]{12}')
                if model == 'job':
                    self.assertRegex(response.content.decode(), r'css/job_filter_dialog\.css\?v=[0-9a-f]{12}')

    def test_active_filter_returns_only_matching_rows(self):
        response = self.client.get(
            reverse('admin:myappLubd_room_changelist'), {'is_active__exact': '1'}, secure=True,
        )
        self.assertEqual(list(response.context['cl'].queryset), [self.active])

    def test_activation_applies_only_to_selected_rows(self):
        url = reverse('admin:myappLubd_room_changelist')
        response = self.client.post(url, {
            'action': 'activate_rooms', '_selected_action': [str(self.inactive.pk)],
            'index': '0', 'select_across': '0',
        }, secure=True)
        self.assertEqual(response.status_code, 302)
        self.inactive.refresh_from_db()
        self.assertTrue(self.inactive.is_active)
        self.unselected.refresh_from_db()
        self.assertFalse(self.unselected.is_active)

    def test_action_without_rows_does_not_modify_records(self):
        self.client.post(reverse('admin:myappLubd_room_changelist'), {
            'action': 'activate_rooms', 'index': '0', 'select_across': '0',
        }, secure=True)
        self.inactive.refresh_from_db()
        self.assertFalse(self.inactive.is_active)
