from django.contrib.admin.sites import AdminSite
from django.test import TestCase

from .admin import DatalistTextInput, MachineAdmin, MachineAdminForm
from .models import Machine, Property


class MachineAdminDropdownTests(TestCase):
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

    def test_machine_admin_uses_custom_dropdown_form(self):
        machine_admin = MachineAdmin(Machine, AdminSite())

        self.assertIs(machine_admin.form, MachineAdminForm)

    def test_brand_and_category_suggest_existing_values(self):
        form = MachineAdminForm()

        self.assertIsInstance(form.fields['brand'].widget, DatalistTextInput)
        self.assertIsInstance(form.fields['category'].widget, DatalistTextInput)
        self.assertEqual(
            form.fields['brand'].widget.options,
            ['Daikin', 'Mitsubishi'],
        )
        self.assertEqual(
            form.fields['category'].widget.options,
            ['HVAC'],
        )

        html = form['brand'].as_widget()
        self.assertIn('list="id_brand_options"', html)
        self.assertIn('<datalist id="id_brand_options">', html)
        self.assertIn('<option value="Daikin"></option>', html)

    def test_edit_form_keeps_the_machine_current_values(self):
        machine = Machine.objects.get(name='Lobby Air Conditioner')
        Machine.objects.filter(pk=machine.pk).update(brand='Legacy Brand')
        machine.refresh_from_db()

        form = MachineAdminForm(instance=machine)

        self.assertIn('Legacy Brand', form.fields['brand'].widget.options)

    def test_form_accepts_and_saves_new_brand_and_category(self):
        form = MachineAdminForm(data={
            'name': 'New Pool Pump',
            'brand': 'New Pump Brand',
            'category': 'Pool Equipment',
            'property': self.property.pk,
            'status': 'active',
        })

        self.assertTrue(form.is_valid(), form.errors)
        machine = form.save()
        self.assertEqual(machine.brand, 'New Pump Brand')
        self.assertEqual(machine.category, 'Pool Equipment')
