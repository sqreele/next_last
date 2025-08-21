#!/usr/bin/env python
import os
import sys
import django

# Add the src directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import Property, UserProfile
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

def main():
    print("🏗️  Creating properties...")
    
    # Create properties
    properties = []
    
    # Property 1
    prop1, created = Property.objects.get_or_create(
        property_id='PAA1A6A0E',
        defaults={
            'name': 'Main Building',
            'description': 'Primary office building with 5 floors',
            'created_at': timezone.now()
        }
    )
    if created:
        print(f"✅ Created property: {prop1.name}")
    else:
        print(f"ℹ️  Property exists: {prop1.name}")
    properties.append(prop1)
    
    # Property 2
    prop2, created = Property.objects.get_or_create(
        property_id='PBB2B7B1F',
        defaults={
            'name': 'Warehouse Complex',
            'description': 'Storage and logistics facility',
            'created_at': timezone.now()
        }
    )
    if created:
        print(f"✅ Created property: {prop2.name}")
    else:
        print(f"ℹ️  Property exists: {prop2.name}")
    properties.append(prop2)
    
    print(f"\n👤 Assigning properties to admin1...")
    
    try:
        # Get user
        user = User.objects.get(username='admin1')
        print(f"✅ Found user: {user.username}")
        
        # Get or create user profile
        profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={
                'positions': 'Administrator',
                'created_at': timezone.now()
            }
        )
        
        if created:
            print(f"✅ Created user profile")
        else:
            print(f"ℹ️  User profile exists")
        
        # Assign properties
        profile.properties.set(properties)
        print(f"✅ Assigned {len(properties)} properties to {user.username}")
        
        # Verify
        count = profile.properties.count()
        print(f"🎯 User now has {count} properties")
        
        for prop in profile.properties.all():
            print(f"   - {prop.name} ({prop.property_id})")
            
    except User.DoesNotExist:
        print(f"❌ User 'admin1' not found")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == '__main__':
    main()
