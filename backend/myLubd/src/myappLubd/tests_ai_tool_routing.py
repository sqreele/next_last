from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

from rest_framework import status
from rest_framework.test import APIClient

from .models import Job, Machine, PreventiveMaintenance, Property, Room, Topic
from .views import (
    _extract_category_name_from_message,
    _should_force_recurring_tool,
    _should_force_summary_tool,
)
from .view_modules.ai_tools import (
    _get_maintenance_summary_for_property,
    _get_recurring_maintenance_tasks_for_property,
    get_maintenance_summary,
    get_recurring_maintenance_tasks,
    get_today_maintenance_jobs,
)
from .view_modules.ai_context import (
    _extract_property_name_from_message,
    _property_required_reply,
    _resolve_property,
)
from .view_modules.ai_provider import _authorized_ai_property


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


class AIChatEndpointRegressionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='ai-user', password='pass')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch('myappLubd.view_modules.ai_provider._build_gemini_client')
    def test_blank_message_is_rejected_before_provider_call(self, build_client):
        response = self.client.post('/api/v1/ai/chat/', {'message': '   '}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
        self.assertEqual(response.data, {'detail': 'กรุณาระบุ message ใน request body'})
        build_client.assert_not_called()

    @patch('myappLubd.view_modules.ai_provider._build_gemini_client')
    def test_provider_configuration_failure_preserves_service_unavailable_contract(self, build_client):
        build_client.side_effect = ValueError('GEMINI_API_KEY environment variable is not configured.')

        response = self.client.post('/api/v1/ai/chat/', {'message': 'hello'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, response.content)
        self.assertEqual(
            response.data,
            {'detail': 'GEMINI_API_KEY environment variable is not configured.'},
        )

    @patch('myappLubd.view_modules.ai_provider._gemini_config', return_value=object())
    @patch('myappLubd.view_modules.ai_provider._genai_modules', return_value=(None, object()))
    @patch('myappLubd.view_modules.ai_provider._build_gemini_client')
    def test_successful_provider_response_preserves_reply_shape(
        self, build_client, _genai_modules, _gemini_config
    ):
        response_obj = SimpleNamespace(function_calls=[], text='provider reply')
        build_client.return_value = SimpleNamespace(
            models=SimpleNamespace(generate_content=Mock(return_value=response_obj))
        )

        response = self.client.post('/api/v1/ai/chat/', {'message': 'hello'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data, {'reply': 'provider reply'})


class AIChatTenantIsolationTests(TestCase):
    class FakePart:
        def __init__(self, text=None):
            self.text = text

        @staticmethod
        def from_function_response(name, response):
            return {'name': name, 'response': response}

    class FakeContent:
        def __init__(self, role=None, parts=None):
            self.role = role
            self.parts = parts

    def setUp(self):
        self.user_a = get_user_model().objects.create_user(username='ai-tenant-a', password='pass')
        self.user_b = get_user_model().objects.create_user(username='ai-tenant-b', password='pass')
        self.property_a = Property.objects.create(name='Hotel Alpha')
        # Property.name is globally unique in the current schema. These names
        # deliberately collide after the AI resolver's normalization step.
        self.property_b = Property.objects.create(name='Hotel-Alpha')
        self.property_a.users.add(self.user_a)
        self.property_b.users.add(self.user_b)
        self.room_a = Room.objects.create(name='A-101', room_type='Guest Room')
        self.room_b = Room.objects.create(name='B-101', room_type='Guest Room')
        self.room_a.properties.add(self.property_a)
        self.room_b.properties.add(self.property_b)
        job_a = Job.objects.create(user=self.user_a, description='Tenant A repair', status='pending')
        job_b = Job.objects.create(user=self.user_b, description='Tenant B secret', status='pending')
        job_a.rooms.add(self.room_a)
        job_b.rooms.add(self.room_b)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user_a)

    @property
    def fake_types(self):
        return SimpleNamespace(Part=self.FakePart, Content=self.FakeContent)

    def test_duplicate_name_resolution_and_tool_query_use_authorized_property_only(self):
        accessible = [self.property_a]

        selected = _authorized_ai_property(self.user_a, 'HotelAlpha', accessible)
        summary = _get_maintenance_summary_for_property(selected)

        self.assertEqual(selected, self.property_a)
        self.assertEqual(summary['property']['property_id'], self.property_a.property_id)
        self.assertEqual(summary['total_jobs'], 1)
        self.assertNotIn('Tenant B secret', str(summary))

    def test_extraction_and_suggestions_are_limited_to_accessible_properties(self):
        inaccessible = Property.objects.create(name='Tenant B Exclusive')
        inaccessible.users.add(self.user_b)
        accessible = [self.property_a]

        self.assertEqual(
            _extract_property_name_from_message('สรุป Tenant B Exclusive', accessible),
            '',
        )
        # Explicit context remains untrusted input; authorization must reject it.
        self.assertIsNone(
            _authorized_ai_property(self.user_a, 'Tenant B Exclusive', accessible)
        )
        self.assertIsNone(
            _authorized_ai_property(self.user_a, inaccessible.property_id, accessible)
        )
        reply = _property_required_reply(accessible)
        self.assertIn(self.property_a.property_id, reply)
        self.assertNotIn(inaccessible.property_id, reply)
        self.assertNotIn(inaccessible.name, reply)

    def test_no_global_property_fallback_is_available_to_tool_layer(self):
        property_obj, error = _resolve_property('Hotel Alpha')

        self.assertIsNone(property_obj)
        self.assertEqual(error['available_properties'], [])
        self.assertEqual(
            get_maintenance_summary(property_name='Hotel Alpha'),
            {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'},
        )
        self.assertEqual(
            get_today_maintenance_jobs(property_name='Hotel Alpha'),
            {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'},
        )
        self.assertEqual(
            get_recurring_maintenance_tasks(property_name='Hotel Alpha'),
            {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'},
        )

    @patch('myappLubd.view_modules.ai_provider._gemini_config', return_value=object())
    @patch('myappLubd.view_modules.ai_provider._genai_modules')
    @patch('myappLubd.view_modules.ai_provider._build_gemini_client')
    def test_actual_chat_path_passes_authorized_object_to_tool(
        self, build_client, genai_modules, _gemini_config
    ):
        first_response = SimpleNamespace(function_calls=[], text='', candidates=[])
        final_response = SimpleNamespace(function_calls=[], text='Tenant A summary', candidates=[])
        build_client.return_value = SimpleNamespace(
            models=SimpleNamespace(generate_content=Mock(side_effect=[first_response, final_response]))
        )
        genai_modules.return_value = (None, self.fake_types)

        with patch(
            'myappLubd.view_modules.ai_provider._get_maintenance_summary_for_property',
            wraps=_get_maintenance_summary_for_property,
        ) as secured_tool:
            response = self.client.post(
                '/api/v1/ai/chat/',
                {'message': 'งานระบบแอร์มีห้องไหนบ้าง', 'property_name': 'Hotel Alpha'},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(secured_tool.call_args.args[0], self.property_a)

    @patch('myappLubd.view_modules.ai_provider._gemini_config', return_value=object())
    @patch('myappLubd.view_modules.ai_provider._genai_modules', return_value=(None, object()))
    @patch('myappLubd.view_modules.ai_provider._build_gemini_client')
    def test_provider_exception_is_sanitized(self, build_client, _genai_modules, _gemini_config):
        sensitive_text = 'provider secret diagnostic api_key=do-not-expose'
        build_client.return_value = SimpleNamespace(
            models=SimpleNamespace(generate_content=Mock(side_effect=RuntimeError(sensitive_text)))
        )

        response = self.client.post('/api/v1/ai/chat/', {'message': 'hello'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY, response.content)
        self.assertEqual(response.data, {'detail': 'ไม่สามารถเชื่อมต่อ Gemini ได้ในขณะนี้'})
        self.assertNotIn(sensitive_text, response.content.decode())


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
        summary = _get_maintenance_summary_for_property(
            self.property,
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

        summary = _get_recurring_maintenance_tasks_for_property(
            self.property,
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

    def test_recurring_tasks_include_machine_only_pm_for_property(self):
        machine = Machine.objects.create(
            machine_id='M-201',
            name='Pump 201',
            category='Pump',
            location='Plant Room',
            property=self.property,
        )
        pm = PreventiveMaintenance.objects.create(
            pmtitle='ตรวจปั๊มน้ำ',
            scheduled_date=timezone.make_aware(datetime(2026, 7, 14, 9, 0)),
            frequency='monthly',
            created_by=self.user,
            assigned_to=self.user,
        )
        pm.machines.add(machine)

        summary = _get_recurring_maintenance_tasks_for_property(
            self.property,
            frequency='monthly',
            year=2026,
            month=7,
        )

        self.assertEqual(summary['total'], 1)
        self.assertEqual(summary['monthly']['total'], 1)
        item = summary['monthly']['by_month'][0]['items'][0]
        self.assertEqual(item['title'], 'ตรวจปั๊มน้ำ')
        self.assertEqual(item['machines'][0]['machine_id'], 'M-201')
        self.assertEqual(item['machines'][0]['property_name'], 'Monthly PM Hotel')
