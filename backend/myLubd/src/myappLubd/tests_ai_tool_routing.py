from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from datetime import datetime

from .models import Job, PreventiveMaintenance, Property, Room, Topic
from .views import (
    _extract_category_name_from_message,
    _should_force_recurring_tool,
    _should_force_summary_tool,
    get_maintenance_summary,
    get_recurring_maintenance_tasks,
)


class AIToolRoutingTests(SimpleTestCase):
    def test_monthly_repair_report_uses_summary_not_recurring(self):
        message = 'ต้องการทราบงานแจ้งซ่อมประจำเดือนแต่ละเดือน'

        self.assertTrue(_should_force_summary_tool(message))
        self.assertFalse(_should_force_recurring_tool(message))

    def test_recurring_monthly_task_still_uses_recurring_tool(self):
        self.assertTrue(_should_force_recurring_tool('ขอดูงานประจำรายเดือนของสาขา A'))
        self.assertTrue(_should_force_recurring_tool('PM รายเดือนของสาขา A'))

    def test_air_conditioning_category_question_uses_summary_tool(self):
        self.assertTrue(_should_force_summary_tool('งานระบบแอร์มีห้องไหนบ้าง'))

    def test_monthly_recurring_count_question_uses_recurring_tool(self):
        message = 'งานประจำเดือนแต่ละเดือนมีกี่งาน'

        self.assertTrue(_should_force_recurring_tool(message))


class AISummaryCategoryDetailsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='tech', password='pass')
        self.property = Property.objects.create(name='Test Hotel')
        self.room_101 = Room.objects.create(name='101', room_type='Guest Room')
        self.room_102 = Room.objects.create(name='102', room_type='Guest Room')
        self.property.users.add(self.user)
        self.room_101.properties.add(self.property)
        self.room_102.properties.add(self.property)
        self.air_topic = Topic.objects.create(title='ระบบแอร์')
        self.plumbing_topic = Topic.objects.create(title='ประปา')

        air_job_101 = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            description='แอร์ไม่เย็น',
            remarks='ตรวจเช็กคอยล์เย็น',
            status='pending',
        )
        air_job_101.rooms.add(self.room_101)
        air_job_101.topics.add(self.air_topic)

        air_job_102 = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            description='น้ำหยดจากแอร์',
            remarks='รออะไหล่',
            status='in_progress',
        )
        air_job_102.rooms.add(self.room_102)
        air_job_102.topics.add(self.air_topic)

        plumbing_job = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            description='อ่างล้างหน้ารั่ว',
            remarks='เปลี่ยนข้อต่อ',
            status='completed',
        )
        plumbing_job.rooms.add(self.room_101)
        plumbing_job.topics.add(self.plumbing_topic)

    def test_summary_includes_rooms_for_selected_category(self):
        summary = get_maintenance_summary(
            property_name='Test Hotel',
            category_name='ระบบแอร์',
        )

        self.assertEqual(summary['category']['title'], 'ระบบแอร์')
        self.assertEqual(summary['total_jobs'], 2)
        self.assertEqual(len(summary['category_details']), 1)
        detail = summary['category_details'][0]
        self.assertEqual(detail['category'], 'ระบบแอร์')
        self.assertEqual(detail['job_count'], 2)
        self.assertEqual(
            {room['name'] for room in detail['rooms']},
            {'101', '102'},
        )

    def test_extracts_category_from_thai_air_conditioning_question(self):
        self.assertEqual(
            _extract_category_name_from_message('งานระบบแอร์มีห้องไหนบ้าง'),
            'ระบบแอร์',
        )

    def test_extracts_category_from_example_without_generic_category_text(self):
        self.assertEqual(
            _extract_category_name_from_message('รายละเอียดของงานแต่ละ category เช่น งานระบบแอร์ มีห้องไหนบ้าง'),
            'ระบบแอร์',
        )


class AIRecurringMonthlyCountsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='pm-tech', password='pass')
        self.property = Property.objects.create(name='Monthly PM Hotel')
        self.room = Room.objects.create(name='201', room_type='Guest Room')
        self.property.users.add(self.user)
        self.room.properties.add(self.property)

    def _create_pm(self, title, scheduled_date):
        job = Job.objects.create(
            user=self.user,
            updated_by=self.user,
            description=title,
            remarks='PM',
            status='pending',
            is_preventivemaintenance=True,
        )
        job.rooms.add(self.room)
        return PreventiveMaintenance.objects.create(
            job=job,
            pmtitle=title,
            scheduled_date=timezone.make_aware(scheduled_date),
            frequency='monthly',
            created_by=self.user,
            assigned_to=self.user,
        )

    def test_recurring_tasks_include_monthly_counts_by_month(self):
        self._create_pm('ล้างแอร์ 1', datetime(2026, 1, 5, 9, 0))
        self._create_pm('ล้างแอร์ 2', datetime(2026, 1, 20, 9, 0))
        self._create_pm('ตรวจปั๊ม', datetime(2026, 2, 10, 9, 0))

        summary = get_recurring_maintenance_tasks(
            property_name='Monthly PM Hotel',
            frequency='monthly',
            year=2026,
        )

        self.assertEqual(summary['monthly']['month_counts'], [
            {'year': 2026, 'month': 1, 'total': 2},
            {'year': 2026, 'month': 2, 'total': 1},
        ])
        months = summary['monthly']['by_year'][0]['months']
        self.assertEqual(months[0], {'month': 1, 'total': 2})
        self.assertEqual(months[1], {'month': 2, 'total': 1})
        self.assertEqual(months[2], {'month': 3, 'total': 0})
