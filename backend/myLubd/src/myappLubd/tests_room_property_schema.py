"""Regression coverage for the required canonical Room.property field."""

from django.db import IntegrityError, transaction
from django.core.exceptions import FieldDoesNotExist
from django.test import TestCase

from .models import Property, Room


class RoomPropertySchemaTests(TestCase):
    def setUp(self):
        self.property = Property.objects.create(name='Canonical Room Hotel')
        self.other_property = Property.objects.create(name='Other Canonical Room Hotel')

    def test_canonical_property_is_required_by_model_and_database(self):
        field = Room._meta.get_field('property')
        self.assertFalse(field.null)
        self.assertFalse(field.blank)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Room.objects.create(
                    name='B7-NULL-ROOM',
                    room_type='Standard',
                    property=None,
                )

    def test_legacy_m2m_field_is_removed(self):
        room = Room.objects.create(
            name='B2-DIRECT-ROOM',
            room_type='Standard',
            property=self.property,
        )
        self.assertEqual(room.property_id, self.property.id)
        with self.assertRaises(FieldDoesNotExist):
            Room._meta.get_field('properties')
        self.assertIn(room, self.property.canonical_rooms.all())
