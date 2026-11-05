from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from myappLubd.models import Area, Job, JobImage, Machine, Property, Room, Tenant, TenantMembership, Topic, User


PROPERTY_ID = 'PB749146D'


class Command(BaseCommand):
    help = 'Create and reset the isolated public-demo database.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        tenant, _ = Tenant.objects.get_or_create(
            tenant_id='TDEMO0001',
            defaults={'name': 'StayMaint Public Demo', 'slug': 'staymaint-public-demo', 'status': 'active'},
        )
        property_obj, _ = Property.objects.get_or_create(
            property_id=PROPERTY_ID,
            defaults={
                'tenant': tenant,
                'name': 'StayMaint Demo Hotel - Chinatown',
                'description': 'Isolated public demonstration property.',
                'is_preventivemaintenance': True,
            },
        )
        if property_obj.tenant_id != tenant.id:
            property_obj.tenant = tenant
            property_obj.save(update_fields=['tenant'])

        user_specs = [
            ('demo-admin', 'Demo', 'Manager', 'admin'),
            ('demo-somchai', 'Somchai', 'Engineer', 'technician'),
            ('demo-narin', 'Narin', 'Technician', 'technician'),
            ('demo-krit', 'Krit', 'Engineer', 'technician'),
        ]
        for username, first_name, last_name, role in user_specs:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': f'{username}@demo.invalid',
                    'is_active': True,
                    'property_id': PROPERTY_ID,
                    'property_name': property_obj.name,
                },
            )
            if created:
                user.set_unusable_password()
                user.save(update_fields=['password'])
            membership, _ = TenantMembership.objects.get_or_create(
                tenant=tenant,
                user=user,
                defaults={'role': role, 'is_active': True},
            )
            membership.properties.add(property_obj)

        room_specs = {
            '306': 'The Compact', '315': 'The Compact', '402': 'The Duo Twin',
            '420': 'The Compact', '501': 'The Duo Twin', '520': 'The Compact',
            '601': 'The Duo Twin', '620': 'The Compact', '1900': 'Engineer Rooms',
        }
        for name, room_type in room_specs.items():
            Room.objects.get_or_create(
                property=property_obj,
                name=name,
                defaults={'room_type': room_type, 'is_active': True},
            )
        Area.objects.get_or_create(property=property_obj, name='Lobby', defaults={'is_active': True})

        topic_titles = [
            'Air-Conditions(ระบบทำความเย็น)',
            'Barth Room(ห้องน้ำ)',
            'Door( ประตู)',
            'Internet and TV(ระบบอินเตอร์เน็ต,ระบบทีวี)',
            'Ligthting(ระบบแสงสว่าง)',
            'Orther (อาการอื่นๆ)',
            'PM (ทำความสะอาดฟิลเตอร์แอร์)',
            'Wall and Repaint (ฝ้าเพดาน,ผนัง,งานสี)',
            'Water Leasks (น้ำรั่ว)',
            'Water and Hot water (น้ำร้อน,น้ำเย็น)',
        ]
        for title in topic_titles:
            Topic.objects.get_or_create(title=title)
        Machine.objects.get_or_create(
            machine_id='DEMO-HVAC-001',
            defaults={
                'name': 'Demo Condensing Unit',
                'category': 'HVAC',
                'location': 'Rooftop',
                'property': property_obj,
                'status': 'active',
            },
        )

        has_demo_data = property_obj.jobs.filter(job_id__startswith='DEMO-CT-').exists()
        if options['reset']:
            public_jobs = Job.all_objects.filter(property=property_obj, job_id__startswith='DWEB')
            for image in JobImage.objects.filter(job__in=public_jobs):
                image.delete()
            public_jobs.hard_delete()
            if has_demo_data:
                call_command('seed_presentation_demo', property_id=PROPERTY_ID, cleanup=True, verbosity=0)
                has_demo_data = False
        if not has_demo_data:
            call_command('seed_presentation_demo', property_id=PROPERTY_ID, apply=True, verbosity=0)
        self.stdout.write(self.style.SUCCESS('Public demo database is ready.'))
