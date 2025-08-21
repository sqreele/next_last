#!/usr/bin/env python
"""
Django script to create sample properties and assign them to users
Run this from the Django shell or as a management command
"""

import os
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import Property, UserProfile, User
from django.utils import timezone

def create_sample_properties():
    """Create sample properties if they don't exist"""
    
    # Sample properties data
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
            print(f"✅ Created property: {property_obj.name} ({property_obj.property_id})")
        else:
            print(f"ℹ️  Property already exists: {property_obj.name} ({property_obj.property_id})")
        
        created_properties.append(property_obj)
    
    return created_properties

def assign_properties_to_user(username, properties):
    """Assign properties to a specific user"""
    
    try:
        # Get the user
        user = User.objects.get(username=username)
        
        # Get or create user profile
        user_profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={
                'positions': 'Administrator',
                'created_at': timezone.now()
            }
        )
        
        if created:
            print(f"✅ Created user profile for {username}")
        
        # Assign properties
        user_profile.properties.set(properties)
        
        print(f"✅ Assigned {len(properties)} properties to user {username}:")
        for prop in properties:
            print(f"   - {prop.name} ({prop.property_id})")
        
        return user_profile
        
    except User.DoesNotExist:
        print(f"❌ User '{username}' not found")
        return None
    except Exception as e:
        print(f"❌ Error assigning properties: {e}")
        return None

def main():
    """Main function to create properties and assign them"""
    
    print("🏗️  Creating sample properties...")
    properties = create_sample_properties()
    
    print(f"\n👤 Assigning properties to users...")
    
    # Assign properties to admin1 user
    admin_profile = assign_properties_to_user('admin1', properties)
    
    if admin_profile:
        print(f"\n✅ Successfully assigned properties to admin1")
        print(f"   Properties count: {admin_profile.properties.count()}")
    else:
        print(f"\n❌ Failed to assign properties to admin1")
    
    print(f"\n🎯 Properties are now available for the application!")

if __name__ == '__main__':
    main()
