from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from myappLubd.models import Property, Room, Job, Topic, UserProfile
from django.utils import timezone
import random

User = get_user_model()

class Command(BaseCommand):
    help = 'Populate the database with sample data for development'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before populating',
        )

    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write('Clearing existing data...')
            Job.objects.all().delete()
            Room.objects.all().delete()
            Property.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
            self.stdout.write('Existing data cleared.')

        # Create sample properties
        properties = []
        property_names = [
            "Lubd Bangkok Chainatown",
            "Lubd Bangkok Talad Noi",
            "Lubd Bangkok Sathorn",
            "Lubd Bangkok Sukhumvit"
        ]
        
        for name in property_names:
            prop, created = Property.objects.get_or_create(
                name=name,
                defaults={
                    'address': f"123 {name} Street, Bangkok",
                    'description': f"Sample property: {name}",
                    'is_active': True
                }
            )
            properties.append(prop)
            if created:
                self.stdout.write(f'Created property: {name}')

        # Create sample rooms for each property
        room_types = ['Deluxe', 'Standard', 'Suite', 'Family']
        for prop in properties:
            for i in range(1, 6):  # 5 rooms per property
                room_name = f"{random.choice(room_types)} - {i:03d}"
                room, created = Room.objects.get_or_create(
                    name=room_name,
                    property=prop,
                    defaults={
                        'room_type': random.choice(room_types),
                        'description': f"Sample room {room_name}",
                        'is_active': True
                    }
                )
                if created:
                    self.stdout.write(f'Created room: {room_name}')

        # Create sample users
        users = []
        user_data = [
            {'username': 'manager1', 'email': 'manager1@example.com', 'is_staff': True},
            {'username': 'staff1', 'email': 'staff1@example.com', 'is_staff': False},
            {'username': 'staff2', 'email': 'staff2@example.com', 'is_staff': False},
            {'username': 'maintenance1', 'email': 'maintenance1@example.com', 'is_staff': False},
        ]
        
        for user_info in user_data:
            user, created = User.objects.get_or_create(
                username=user_info['username'],
                defaults={
                    'email': user_info['email'],
                    'is_staff': user_info['is_staff'],
                    'is_active': True,
                    'property_name': random.choice(property_names),
                    'property_id': str(random.randint(1000, 9999))
                }
            )
            if created:
                user.set_password('password123')
                user.save()
                users.append(user)
                self.stdout.write(f'Created user: {user_info["username"]}')

        # Create sample topics
        topics = []
        topic_names = [
            'Cleaning', 'Maintenance', 'Repair', 'Inspection', 
            'Safety Check', 'Deep Clean', 'Equipment Check'
        ]
        
        for topic_name in topic_names:
            topic, created = Topic.objects.get_or_create(
                name=topic_name,
                defaults={'description': f"Sample topic: {topic_name}"}
            )
            topics.append(topic)
            if created:
                self.stdout.write(f'Created topic: {topic_name}')

        # Create sample jobs
        job_statuses = ['pending', 'in_progress', 'completed', 'cancelled']
        rooms = list(Room.objects.all())
        
        for i in range(20):  # Create 20 sample jobs
            room = random.choice(rooms)
            topic = random.choice(topics)
            user = random.choice(users)
            
            job = Job.objects.create(
                title=f"Sample Job {i+1}",
                description=f"Sample job description for {topic.name} in {room.name}",
                room=room,
                assigned_to=user,
                status=random.choice(job_statuses),
                priority=random.choice(['low', 'medium', 'high']),
                created_at=timezone.now(),
                updated_at=timezone.now()
            )
            
            # Add topics to job
            job.topics.add(topic)
            
            if i < 5:  # Show first 5 jobs
                self.stdout.write(f'Created job: {job.title}')

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully populated database with sample data:\n'
                f'- {Property.objects.count()} properties\n'
                f'- {Room.objects.count()} rooms\n'
                f'- {User.objects.count()} users\n'
                f'- {Topic.objects.count()} topics\n'
                f'- {Job.objects.count()} jobs'
            )
        )
