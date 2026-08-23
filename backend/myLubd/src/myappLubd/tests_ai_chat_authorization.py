from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Property, Room, Tenant, TenantMembership
from .views import (
    _ai_accessible_properties,
    _property_required_reply,
    _resolve_room,
    _serialize_user,
)


User = get_user_model()


class FakePart:
    def __init__(self, text=None):
        self.text = text

    @classmethod
    def from_function_response(cls, name, response):
        return {'name': name, 'response': response}


class FakeContent:
    def __init__(self, role, parts):
        self.role = role
        self.parts = parts


FAKE_TYPES = SimpleNamespace(Part=FakePart, Content=FakeContent)


def fake_response(*, text='', function_calls=None):
    return SimpleNamespace(
        text=text,
        function_calls=function_calls or [],
        candidates=[SimpleNamespace(content=SimpleNamespace(parts=[]))],
    )


class FakeClient:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []
        self.models = self

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class AIChatAuthorizationTests(APITestCase):
    url = '/api/v1/ai/chat/'

    def setUp(self):
        self.allowed_tenant = Tenant.objects.create(name='AI allowed tenant')
        self.foreign_tenant = Tenant.objects.create(name='AI foreign tenant')
        self.allowed_property = Property.objects.create(
            name='Allowed Hotel', tenant=self.allowed_tenant,
        )
        self.foreign_property = Property.objects.create(
            name='Foreign Secret Hotel', tenant=self.foreign_tenant,
        )
        self.user = User.objects.create_user(username='ai-user', password='pw')
        membership = TenantMembership.objects.create(
            user=self.user,
            tenant=self.allowed_tenant,
            role='viewer',
        )
        membership.properties.add(self.allowed_property)
        self.allowed_room = Room.objects.create(
            name='AI-ROOM-ALLOWED',
            room_type='Guest Room',
            property=self.allowed_property,
        )
        self.foreign_room = Room.objects.create(
            name='AI-ROOM-FOREIGN',
            room_type='Secret Room',
            property=self.foreign_property,
        )

    def test_anonymous_request_is_denied(self):
        response = self.client.post(self.url, {'message': 'hello'}, format='json')

        self.assertIn(response.status_code, {401, 403})

    @patch('myappLubd.views._gemini_config', return_value=object())
    @patch('myappLubd.views._genai_modules', return_value=(None, FAKE_TYPES))
    @patch('myappLubd.views._build_gemini_client')
    def test_authenticated_user_can_chat_in_accessible_property(
        self, build_client, _genai_modules, _gemini_config,
    ):
        fake_client = FakeClient(fake_response(text='สวัสดี'))
        build_client.return_value = fake_client
        self.client.force_authenticate(self.user)

        response = self.client.post(self.url, {
            'message': 'hello',
            'property_id': self.allowed_property.property_id,
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['reply'], 'สวัสดี')
        self.assertIn(
            f'Property context: {self.allowed_property.property_id}',
            fake_client.calls[0]['contents'],
        )

    @patch('myappLubd.views._build_gemini_client')
    def test_cross_tenant_explicit_property_is_hidden_before_provider_call(
        self, build_client,
    ):
        self.client.force_authenticate(self.user)

        response = self.client.post(self.url, {
            'message': 'show jobs',
            'property_id': self.foreign_property.property_id,
        }, format='json')

        self.assertEqual(response.status_code, 404)
        self.assertNotIn(self.foreign_property.name, str(response.data))
        build_client.assert_not_called()

    def test_property_prompt_and_room_resolution_only_expose_accessible_scope(self):
        token = _ai_accessible_properties.set(
            Property.objects.filter(pk=self.allowed_property.pk),
        )
        try:
            prompt = _property_required_reply()
            room, error = _resolve_room('missing room')
        finally:
            _ai_accessible_properties.reset(token)

        self.assertIn(self.allowed_property.name, prompt)
        self.assertNotIn(self.foreign_property.name, prompt)
        self.assertIsNone(room)
        self.assertIn(self.allowed_room.name, str(error))
        self.assertNotIn(self.foreign_room.name, str(error))

    def test_provider_user_context_omits_internal_ids_and_email(self):
        self.user.email = 'private-ai-user@example.com'
        self.user.first_name = 'Visible'
        self.user.last_name = 'Name'
        self.user.save(update_fields=['email', 'first_name', 'last_name'])

        payload = _serialize_user(self.user)

        self.assertEqual(payload, {'name': 'Visible Name'})

    @patch('myappLubd.views.get_today_maintenance_jobs')
    @patch('myappLubd.views._gemini_config', return_value=object())
    @patch('myappLubd.views._genai_modules', return_value=(None, FAKE_TYPES))
    @patch('myappLubd.views._build_gemini_client')
    def test_selected_property_overrides_provider_tool_arguments(
        self,
        build_client,
        _genai_modules,
        _gemini_config,
        get_today_jobs,
    ):
        function_call = SimpleNamespace(
            name='get_today_maintenance_jobs',
            args={'property_name': self.foreign_property.property_id},
        )
        build_client.return_value = FakeClient(
            fake_response(function_calls=[function_call]),
            fake_response(text='safe result'),
        )
        get_today_jobs.return_value = {'total': 0}
        self.client.force_authenticate(self.user)

        response = self.client.post(self.url, {
            'message': f'งานแจ้งซ่อมวันนี้ของ {self.foreign_property.name}',
            'property_id': self.allowed_property.property_id,
        }, format='json')

        self.assertEqual(response.status_code, 200)
        get_today_jobs.assert_called_once_with(
            property_name=self.allowed_property.property_id,
        )

    @patch('myappLubd.views._gemini_config', return_value=object())
    @patch('myappLubd.views._genai_modules', return_value=(None, FAKE_TYPES))
    @patch('myappLubd.views._build_gemini_client')
    def test_provider_exception_is_not_returned_to_client(
        self, build_client, _genai_modules, _gemini_config,
    ):
        build_client.return_value = FakeClient(RuntimeError('provider-secret-123'))
        self.client.force_authenticate(self.user)

        response = self.client.post(self.url, {
            'message': 'hello',
            'property_id': self.allowed_property.property_id,
        }, format='json')

        self.assertEqual(response.status_code, 502)
        self.assertNotIn('provider-secret-123', str(response.data))
