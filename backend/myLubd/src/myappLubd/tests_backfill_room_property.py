from copy import copy
from io import StringIO

from django.core.management import CommandError, call_command
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase

from .models import Job, Property, Room


User = get_user_model()


class BackfillRoomPropertyTests(TransactionTestCase):
    """Exercise the historical backfill against its nullable migration state."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.required_field = Room._meta.get_field('property')
        cls.nullable_field = copy(cls.required_field)
        cls.nullable_field.null = True
        cls.nullable_field.blank = True
        cls.nullable_field.model = Room
        with connection.schema_editor() as schema_editor:
            schema_editor.alter_field(
                Room,
                cls.required_field,
                cls.nullable_field,
                strict=True,
            )

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as schema_editor:
            schema_editor.alter_field(
                Room,
                cls.nullable_field,
                cls.required_field,
                strict=True,
            )
        super().tearDownClass()

    def setUp(self):
        self.chinatown = Property.objects.create(name='Backfill Chinatown')
        self.siam = Property.objects.create(name='Backfill Siam')
        self.user = User.objects.create_user(username='room-backfill-user')

    def room(self, name, *, canonical=None, legacy=()):
        room = Room.objects.create(name=name, room_type='Standard', property=canonical)
        room.properties.add(*legacy)
        return room

    def command(self, *args):
        output = StringIO()
        call_command('backfill_room_property', *args, stdout=output)
        return output.getvalue()

    def test_dry_run_classifies_without_writes(self):
        one = self.room('BR-ONE', legacy=[self.chinatown])
        missing = self.room('BR-MISSING')
        multi = self.room('BR-MULTI', legacy=[self.chinatown, self.siam])
        output = self.command('--dry-run')
        self.assertIn('UNAMBIGUOUS: 1', output)
        self.assertIn('MISSING: 1', output)
        self.assertIn('CONFLICTING: 1', output)
        one.refresh_from_db(); missing.refresh_from_db(); multi.refresh_from_db()
        self.assertIsNone(one.property_id)
        self.assertIsNone(missing.property_id)
        self.assertIsNone(multi.property_id)

    def test_apply_backfills_only_unambiguous_and_is_idempotent(self):
        one = self.room('BR-APPLY', legacy=[self.chinatown])
        missing = self.room('BR-APPLY-MISSING')
        multi = self.room('BR-APPLY-MULTI', legacy=[self.chinatown, self.siam])
        matching = self.room('BR-MATCHING', canonical=self.chinatown, legacy=[self.chinatown])
        first = self.command('--apply')
        self.assertIn('UPDATED: 1', first)
        one.refresh_from_db(); missing.refresh_from_db(); multi.refresh_from_db(); matching.refresh_from_db()
        self.assertEqual(one.property, self.chinatown)
        self.assertIsNone(missing.property_id)
        self.assertIsNone(multi.property_id)
        self.assertEqual(matching.property, self.chinatown)
        self.assertIn(self.chinatown, one.properties.all())
        self.assertIn(one, self.chinatown.canonical_rooms.all())
        second = self.command('--apply')
        self.assertIn('UPDATED: 0', second)

    def test_canonical_legacy_conflict_is_never_overwritten(self):
        room = self.room('BR-CONFLICT', canonical=self.siam, legacy=[self.chinatown])
        with self.assertRaises(CommandError):
            self.command('--apply')
        room.refresh_from_db()
        self.assertEqual(room.property, self.siam)

    def test_backfilled_room_remains_consistent_with_linked_job_property(self):
        room = self.room('BR-JOB-LINK', legacy=[self.chinatown])
        job = Job.objects.create(
            user=self.user,
            property=self.chinatown,
            description='Room property backfill regression',
        )
        job.rooms.add(room)

        self.command('--apply')
        room.refresh_from_db()

        self.assertEqual(room.property_id, self.chinatown.pk)
        self.assertEqual(job.property_id, room.property_id)
