from django.contrib.admin.sites import AdminSite
from django.test import TestCase

from .admin import DatalistTextInput, MachineAdmin, MachineAdminForm
from .models import Machine, Property


class MachineAdminDatalistTests(TestCase):
    def setUp(self):
        self.property = Property.objects.create(name='Dropdown Test Hotel')
        Machine.objects.create(
            name='Lobby Air Conditioner',
            brand='Daikin',
            category='HVAC',
            property=self.property,
        )
        Machine.objects.create(
            name='Back Office Air Conditioner',
            brand='Mitsubishi',
            category='HVAC',
            property=self.property,
        )

    def test_machine_admin_uses_custom_datalist_form(self):
        machine_admin = MachineAdmin(Machine, AdminSite())

        self.assertIs(machine_admin.form, MachineAdminForm)

    def test_brand_and_category_are_text_inputs_with_existing_suggestions(self):
        form = MachineAdminForm()

        self.assertIsInstance(form.fields['brand'].widget, DatalistTextInput)
        self.assertIsInstance(form.fields['category'].widget, DatalistTextInput)
        self.assertEqual(
            form.fields['brand'].widget.suggestions,
            ['Daikin', 'Mitsubishi'],
        )
        self.assertEqual(
            form.fields['category'].widget.suggestions,
            ['HVAC'],
        )

        brand_html = str(form['brand'])
        self.assertIn('list="id_brand_suggestions"', brand_html)
        self.assertIn('<datalist id="id_brand_suggestions">', brand_html)
        self.assertIn('<option value="Daikin"></option>', brand_html)

    def test_new_brand_and_category_values_are_allowed(self):
        form = MachineAdminForm(data={
            'name': 'Kitchen Extractor',
            'brand': 'New Manufacturer',
            'category': 'Ventilation',
            'property': self.property.pk,
            'status': 'active',
        })

        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data['brand'], 'New Manufacturer')
        self.assertEqual(form.cleaned_data['category'], 'Ventilation')
