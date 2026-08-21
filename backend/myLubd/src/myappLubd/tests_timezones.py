from django.test import SimpleTestCase

from .models import Property, Room, Tenant
from .timezones import DEFAULT_TENANT_TIMEZONE, object_timezone


class _RoomsRelation:
    """Small queryset stand-in for exercising the rooms fallback without a DB."""

    def __init__(self, room):
        self.room = room
        self.selected_related = ()

    def select_related(self, *fields):
        self.selected_related = fields
        return self

    def first(self):
        return self.room


class ObjectTimezoneTests(SimpleTestCase):
    @staticmethod
    def make_room(name, timezone_name):
        tenant = Tenant(name=f'{name} tenant', timezone=timezone_name)
        property_obj = Property(name=f'{name} property', tenant=tenant)
        return Room(name=name, room_type='Guest', property=property_obj)

    def test_room_uses_canonical_property_tenant_timezone(self):
        room = self.make_room('Room A', 'Asia/Tokyo')

        self.assertEqual(object_timezone(room).key, 'Asia/Tokyo')

    def test_rooms_fallback_uses_first_room_canonical_property(self):
        room = self.make_room('Room B', 'Europe/London')
        rooms = _RoomsRelation(room)
        room_container = type('RoomContainer', (), {'rooms': rooms})()

        self.assertEqual(object_timezone(room_container).key, 'Europe/London')
        self.assertEqual(rooms.selected_related, ('property__tenant',))

    def test_rooms_with_different_properties_resolve_distinct_timezones(self):
        bangkok_room = self.make_room('Room C', 'Asia/Bangkok')
        new_york_room = self.make_room('Room D', 'America/New_York')

        self.assertEqual(object_timezone(bangkok_room).key, 'Asia/Bangkok')
        self.assertEqual(object_timezone(new_york_room).key, 'America/New_York')

    def test_object_without_property_context_uses_default_timezone(self):
        self.assertEqual(object_timezone(object()).key, DEFAULT_TENANT_TIMEZONE)
