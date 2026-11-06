import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from myappLubd.demo_categories import MACHINE_CATEGORIES, machine_category_flags


class MachineCategoryTests(unittest.TestCase):
    def test_pm_categories_are_preventive_and_not_defects(self):
        for category in ('PM', 'Preventive Monthly', 'Preventive Weekly', 'Preventive Yearly'):
            with self.subTest(category=category):
                self.assertEqual(machine_category_flags(category), {'is_preventivemaintenance': True, 'is_defective': False})

    def test_repair_parts_and_other_do_not_become_pm(self):
        self.assertEqual(machine_category_flags('Repair'), {'is_preventivemaintenance': False, 'is_defective': True})
        for category in ('Change Part', 'Service Contract', 'Other'):
            self.assertEqual(machine_category_flags(category), {'is_preventivemaintenance': False, 'is_defective': False})

    def test_machine_whitelist_rejects_room_and_unknown_categories(self):
        self.assertEqual(len(MACHINE_CATEGORIES), 8)
        for category in ('PMMs Rooms', 'Door', '', 'unknown'):
            with self.subTest(category=category), self.assertRaises(ValueError):
                machine_category_flags(category)


if __name__ == '__main__':
    unittest.main()
