"""Global issuer settings: restricted Admin writes and immutable issued bills."""
from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.urls import reverse

from .billing.documents import issuer_details
from .billing.stripe_service import StripeBillingError
from .models import BillingIssuerSettings


ISSUER = {
    'legal_name': 'ผู้ให้บริการ StayMaint', 'address': 'กรุงเทพมหานคร',
    'tax_id': '1234567890123', 'email': 'issuer@example.test',
}


@override_settings(BILLING_ISSUER={})
class BillingIssuerAdminTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin_user = user_model.objects.create_superuser('issuer-superuser', 'root@example.test', 'test-password')
        self.staff = user_model.objects.create_user('issuer-staff', is_staff=True)
        content_type = ContentType.objects.get_for_model(BillingIssuerSettings)
        self.staff.user_permissions.set(Permission.objects.filter(content_type=content_type))
        self.add_url = reverse('admin:myappLubd_billingissuersettings_add')
        self.list_url = reverse('admin:myappLubd_billingissuersettings_changelist')
        self.change_url = reverse('admin:myappLubd_billingissuersettings_change', args=[1])
        self.client.force_login(self.admin_user)

    def test_superuser_can_save_form_and_issuer_is_used_immediately(self):
        response = self.client.get(self.add_url, secure=True)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'legal_name')
        self.assertContains(response, 'tax_id')
        self.assertNotContains(response, 'STRIPE_SECRET_KEY')
        self.assertEqual(self.client.post(self.add_url, ISSUER, secure=True).status_code, 302)
        stored = BillingIssuerSettings.objects.get(pk=1)
        self.assertEqual(stored.updated_by, self.admin_user)
        self.assertIsNotNone(stored.updated_at)
        self.assertEqual(issuer_details(), ISSUER)

    def test_admin_edit_is_immediate_and_logged(self):
        BillingIssuerSettings.objects.create(**ISSUER)
        updated = {**ISSUER, 'legal_name': 'ชื่อผู้ออกบิลใหม่'}
        self.assertEqual(self.client.post(self.change_url, updated, secure=True).status_code, 302)
        self.assertEqual(issuer_details(), updated)
        self.assertTrue(LogEntry.objects.filter(user=self.admin_user, action_flag=CHANGE, object_id='1').exists())

    def test_staff_permissions_cannot_read_or_change_the_global_issuer(self):
        BillingIssuerSettings.objects.create(**ISSUER)
        self.client.force_login(self.staff)
        for url in (self.list_url, self.add_url, self.change_url):
            self.assertEqual(self.client.get(url, secure=True).status_code, 403)
        response = self.client.post(self.change_url, {**ISSUER, 'legal_name': 'Unauthorized'}, secure=True)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(issuer_details(), ISSUER)

    def test_issuer_cannot_be_deleted_or_duplicated_in_admin(self):
        BillingIssuerSettings.objects.create(**ISSUER)
        self.assertEqual(self.client.get(self.add_url, secure=True).status_code, 403)
        self.assertEqual(self.client.post(self.add_url, ISSUER, secure=True).status_code, 403)
        delete_url = reverse('admin:myappLubd_billingissuersettings_delete', args=[1])
        self.assertEqual(self.client.post(delete_url, {'post': 'yes'}, secure=True).status_code, 403)
        self.assertEqual(BillingIssuerSettings.objects.count(), 1)

    def test_required_fields_email_and_ascii_tax_id_are_validated(self):
        invalid = [
            {'legal_name': ' '}, {'address': ' '}, {'tax_id': ''},
            {'tax_id': '123'}, {'tax_id': '123456789012a'},
            {'tax_id': '๑๒๓๔๕๖๗๘๙๐๑๒๓'}, {'email': 'invalid'},
        ]
        for values in invalid:
            with self.subTest(values=values):
                response = self.client.post(self.add_url, {**ISSUER, **values}, secure=True)
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.context['adminform'].form.errors)
                self.assertFalse(BillingIssuerSettings.objects.exists())

    def test_database_enforces_a_single_settings_row(self):
        BillingIssuerSettings.objects.create(**ISSUER)
        with self.assertRaises(IntegrityError), transaction.atomic():
            BillingIssuerSettings.objects.create(pk=2, **ISSUER)
        self.assertEqual(BillingIssuerSettings.objects.count(), 1)

    @override_settings(BILLING_ISSUER=ISSUER)
    def test_existing_environment_config_remains_a_fallback(self):
        self.assertEqual(issuer_details(), ISSUER)
        saved = {**ISSUER, 'legal_name': 'ข้อมูลจาก Admin'}
        BillingIssuerSettings.objects.create(**saved)
        self.assertEqual(issuer_details(), saved)

    def test_missing_configuration_still_blocks_issuing_documents(self):
        with self.assertRaises(StripeBillingError) as caught:
            issuer_details()
        self.assertEqual(caught.exception.code, 'billing_issuer_missing')
