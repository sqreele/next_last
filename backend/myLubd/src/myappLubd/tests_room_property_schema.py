"""Regression coverage for the additive nullable Room.property schema field."""

from django.test import TestCase

from .models import Property, Room


class RoomPropertySchemaTests(TestCase):
    def setUp(self):
        self.property = Property.objects.create(name='Canonical Room Hotel')

    def test_canonical_property_is_nullable_during_transition(self):
        room = Room.objects.create(name='B2-NULL-ROOM', room_type='Standard')

        self.assertIsNone(room.property_id)

    def test_canonical_and_legacy_relations_coexist_without_sync(self):
        room = Room.objects.create(
            name='B2-DIRECT-ROOM',
            room_type='Standard',
            property=self.property,
        )
        legacy_only = Room.objects.create(name='B2-LEGACY-ROOM', room_type='Standard')
        legacy_only.properties.add(self.property)

        self.assertEqual(room.property_id, self.property.id)
        self.assertFalse(room.properties.exists())
        self.assertIsNone(legacy_only.property_id)
        self.assertIn(self.property, legacy_only.properties.all())

    def test_legacy_and_canonical_reverse_accessors_are_independent(self):
        canonical = Room.objects.create(
            name='B2-CANONICAL-REVERSE',
            room_type='Suite',
            property=self.property,
        )
        legacy = Room.objects.create(name='B2-LEGACY-REVERSE', room_type='Suite')
        legacy.properties.add(self.property)

        self.assertIn(canonical, self.property.canonical_rooms.all())
        self.assertNotIn(legacy, self.property.canonical_rooms.all())
        self.assertIn(legacy, self.property.rooms.all())
        self.assertNotIn(canonical, self.property.rooms.all())
