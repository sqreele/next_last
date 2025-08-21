from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from myappLubd.models import Property, UserProfile
from django.utils import timezone

User = get_user_model()

class Command(BaseCommand):
    help = 'Create sample properties and assign them to users'

    def handle(self, *args, **options):
        self.stdout.write('🏗️  Creating sample properties...')
        
        # Create sample properties
        properties_data = [
            {
                'property_id': 'PAA1A6A0E',
                'name': 'Main Building',
                'description': 'Primary office building with 5 floors'
            },
            {
                'property_id': 'PBB2B7B1F',
                'name': 'Warehouse Complex',
                'description': 'Storage and logistics facility'
            },
            {
                'property_id': 'PCC3C8C2G',
                'name': 'Residential Block',
                'description': 'Staff accommodation building'
            }
        ]
        
        created_properties = []
        
        for prop_data in properties_data:
            property_obj, created = Property.objects.get_or_create(
                property_id=prop_data['property_id'],
                defaults={
                    'name': prop_data['name'],
                    'description': prop_data['description'],
                    'created_at': timezone.now()
                }
            )
            
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Created property: {property_obj.name} ({property_obj.property_id})')
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'ℹ️  Property already exists: {property_obj.name} ({property_obj.property_id})')
                )
            
            created_properties.append(property_obj)
        
        self.stdout.write(f'\n👤 Assigning properties to users...')
        
        # Assign properties to admin1 user
        try:
            user = User.objects.get(username='admin1')
            
            # Get or create user profile
            user_profile, created = UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'positions': 'Administrator',
                    'created_at': timezone.now()
                }
            )
            
            if created:
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Created user profile for admin1')
                )
            
            # Assign properties
            user_profile.properties.set(created_properties)
            
            self.stdout.write(
                self.style.SUCCESS(f'✅ Assigned {len(created_properties)} properties to user admin1:')
            )
            for prop in created_properties:
                self.stdout.write(f'   - {prop.name} ({prop.property_id})')
            
            self.stdout.write(f'\n🎯 Properties are now available for the application!')
            self.stdout.write(f'   Properties count: {user_profile.properties.count()}')
            
        except User.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f'❌ User admin1 not found')
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'❌ Error assigning properties: {e}')
            )
