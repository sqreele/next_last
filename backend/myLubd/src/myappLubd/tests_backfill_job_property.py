from io import StringIO
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase

from .models import Area, Job, Property, Room
from .management.commands.backfill_job_property import Command


User = get_user_model()


class BackfillJobPropertyCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='backfill-job-property', password='pw12345!')
        self.chinatown = Property.objects.create(name='Chinatown')
        self.siam = Property.objects.create(name='Siam')
        self.area = Area.objects.create(property=self.chinatown, name='Lobby')
        self.chinatown_room = Room.objects.create(
            name='BF-C-101', room_type='Standard', property=self.chinatown,
        )
        self.siam_room = Room.objects.create(
            name='BF-S-101', room_type='Standard', property=self.siam,
        )

    def make_job(self, **kwargs):
        defaults = {
            'user': self.user,
            'updated_by': self.user,
            'property': self.chinatown,
            'description': 'Backfill test',
            'remarks': 'test',
        }
        defaults.update(kwargs)
        return Job.objects.create(**defaults)

    def run_command(self, *args):
        output = StringIO()
        call_command('backfill_job_property', *args, stdout=output)
        return output.getvalue()

    def test_historical_candidate_classification_without_weakening_constraint(self):
        relation = lambda values: SimpleNamespace(all=lambda: values)
        room = lambda property_obj: SimpleNamespace(property_id=property_obj.pk, property=property_obj)
        area_only = SimpleNamespace(area_id=self.area.pk, area=self.area, rooms=relation([]))
        rooms_only = SimpleNamespace(area_id=None, area=None, rooms=relation([room(self.chinatown)]))
        matching = SimpleNamespace(area_id=self.area.pk, area=self.area, rooms=relation([room(self.chinatown)]))
        missing = SimpleNamespace(area_id=None, area=None, rooms=relation([]))
        conflicting = SimpleNamespace(area_id=self.area.pk, area=self.area, rooms=relation([room(self.siam)]))

        self.assertEqual(Command._candidate_property_ids(area_only)[0], {self.chinatown.pk})
        self.assertEqual(Command._candidate_property_ids(rooms_only)[0], {self.chinatown.pk})
        self.assertEqual(Command._candidate_property_ids(matching)[0], {self.chinatown.pk})
        self.assertEqual(Command._candidate_property_ids(missing)[0], set())
        self.assertEqual(Command._candidate_property_ids(conflicting)[0], {self.chinatown.pk, self.siam.pk})

    def test_apply_is_a_noop_for_fully_canonical_database(self):
        job = self.make_job(area=self.area)

        output = self.run_command('--apply')

        self.assertIn('PROPERTY NULL: 0', output)
        self.assertIn('WOULD UPDATE: 0', output)
        self.assertIn('UPDATED: 0', output)
        job.refresh_from_db()
        self.assertEqual(job.property_id, self.chinatown.id)

    def test_existing_conflicting_property_is_not_overwritten(self):
        job = self.make_job(property=self.siam, area=self.area)

        with self.assertRaises(CommandError):
            self.run_command('--apply')

        job.refresh_from_db()
        self.assertEqual(job.property_id, self.siam.id)
