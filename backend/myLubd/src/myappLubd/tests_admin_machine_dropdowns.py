from django.contrib.admin.sites import AdminSite
from django.test import TestCase

from .admin import MachineAdmin, MachineAdminForm
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

    def test_brand_and_category_are_select_dropdowns_with_existing_values(self):
        form = MachineAdminForm()

        self.assertEqual(form.fields['brand'].widget.input_type, 'select')
        self.assertEqual(form.fields['category'].widget.input_type, 'select')
        self.assertEqual(
            list(form.fields['brand'].choices),
            [
                ('', '-- Select brand --'),
                ('Daikin', 'Daikin'),
                ('Mitsubishi', 'Mitsubishi'),
            ],
        )
        self.assertEqual(
            list(form.fields['category'].choices),
            [('', '-- Select category --'), ('HVAC', 'HVAC')],
        )

    def test_edit_form_keeps_the_machine_current_values(self):
        machine = Machine.objects.get(name='Lobby Air Conditioner')
        Machine.objects.filter(pk=machine.pk).update(brand='Legacy Brand')
        machine.refresh_from_db()

        form = MachineAdminForm(instance=machine)

        self.assertIn(('Legacy Brand', 'Legacy Brand'), form.fields['brand'].choices)
