from django.test import SimpleTestCase

from .views import _should_force_recurring_tool, _should_force_summary_tool


class AIToolRoutingTests(SimpleTestCase):
    def test_monthly_repair_report_uses_summary_not_recurring(self):
        message = 'ต้องการทราบงานแจ้งซ่อมประจำเดือนแต่ละเดือน'

        self.assertTrue(_should_force_summary_tool(message))
        self.assertFalse(_should_force_recurring_tool(message))

    def test_recurring_monthly_task_still_uses_recurring_tool(self):
        self.assertTrue(_should_force_recurring_tool('ขอดูงานประจำรายเดือนของสาขา A'))
        self.assertTrue(_should_force_recurring_tool('PM รายเดือนของสาขา A'))
