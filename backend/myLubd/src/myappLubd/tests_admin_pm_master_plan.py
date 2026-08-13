from django.contrib import admin
from django.test import SimpleTestCase
from django.urls import reverse

from .admin import PMMasterPlanAdmin
from .models import PMMasterPlan


class PMMasterPlanAdminTests(SimpleTestCase):
    def test_master_plan_is_registered_separately_from_generated_pm_records(self):
        self.assertIsInstance(admin.site._registry[PMMasterPlan], PMMasterPlanAdmin)

    def test_master_plan_has_its_own_admin_change_list(self):
        self.assertEqual(
            reverse('admin:myappLubd_pmmasterplan_changelist'),
            '/admin/myappLubd/pmmasterplan/',
        )
