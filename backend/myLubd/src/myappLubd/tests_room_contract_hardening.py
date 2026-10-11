from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from .models import Job, Property, Room, Tenant


User = get_user_model()


class RoomContractHardeningTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Room contract tenant')
        self.property_a = Property.objects.create(name='Room contract A', tenant=self.tenant)
        self.property_b = Property.objects.create(name='Room contract B', tenant=self.tenant)
        self.user = User.objects.create_user(username='room-contract-user')

    def test_room_name_is_unique_within_property_not_globally(self):
        Room.objects.create(name='101', room_type='Standard', property=self.property_a)
        Room.objects.create(name='101', room_type='Standard', property=self.property_b)

        with self.assertRaises(IntegrityError), transaction.atomic():
            Room.objects.create(name='101', room_type='Suite', property=self.property_a)

    def test_job_rooms_reject_cross_property_links_from_job_side(self):
        job = Job.objects.create(
            user=self.user,
            property=self.property_a,
            description='Cross-property guard',
        )
        foreign_room = Room.objects.create(
            name='201',
            room_type='Standard',
            property=self.property_b,
        )

        with self.assertRaises(ValidationError):
            with transaction.atomic():
                job.rooms.add(foreign_room)

        self.assertFalse(job.rooms.exists())

    def test_job_rooms_reject_cross_property_links_from_room_side(self):
        job = Job.objects.create(
            user=self.user,
            property=self.property_a,
            description='Reverse cross-property guard',
        )
        foreign_room = Room.objects.create(
            name='301',
            room_type='Standard',
            property=self.property_b,
        )

        with self.assertRaises(ValidationError):
            with transaction.atomic():
                foreign_room.jobs.add(job)

        self.assertFalse(foreign_room.jobs.exists())
