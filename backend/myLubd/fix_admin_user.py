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

User = get_user_model()

def main():
    print("🔧 Fixing admin user...")
    
    try:
        # Get or create admin user
        admin_user, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@example.com',
                'is_staff': True,
                'is_superuser': True,
                'is_active': True,
                'first_name': 'Admin',
                'last_name': 'User'
            }
        )
        
        if created:
            print(f"✅ Created admin user: {admin_user.username}")
        else:
            print(f"ℹ️  Admin user exists: {admin_user.username}")
        
        # Ensure admin user has proper permissions
        if not admin_user.is_superuser:
            admin_user.is_superuser = True
            admin_user.is_staff = True
            admin_user.save()
            print(f"✅ Made {admin_user.username} a superuser")
        else:
            print(f"ℹ️  {admin_user.username} is already a superuser")
        
        # Get or create user profile
        profile, created = UserProfile.objects.get_or_create(
            user=admin_user,
            defaults={
                'positions': 'Administrator',
            }
        )
        
        if created:
            print(f"✅ Created user profile for {admin_user.username}")
        else:
            print(f"ℹ️  User profile exists for {admin_user.username}")
        
        # Get all properties
        properties = Property.objects.all()
        print(f"📋 Found {properties.count()} properties in database")
        
        if properties.count() == 0:
            print("❌ No properties found! Creating sample properties...")
            
            # Create sample properties
            sample_properties = [
                {
                    'name': 'Main Building',
                    'description': 'Primary office building with 5 floors'
                },
                {
                    'name': 'Warehouse Complex',
                    'description': 'Storage and logistics facility'
                },
                {
                    'name': 'Residential Block',
                    'description': 'Staff accommodation building'
                }
            ]
            
            created_properties = []
            for prop_data in sample_properties:
                prop, created = Property.objects.get_or_create(
                    name=prop_data['name'],
                    defaults={
                        'description': prop_data['description']
                    }
                )
                if created:
                    print(f"✅ Created property: {prop.name} ({prop.property_id})")
                else:
                    print(f"ℹ️  Property exists: {prop.name} ({prop.property_id})")
                created_properties.append(prop)
            
            properties = created_properties
        
        # Assign all properties to admin user in the users field
        admin_user.accessible_properties.set(properties)
        print(f"✅ Assigned {properties.count()} properties to {admin_user.username} in users field")
        
        # Assign all properties to admin user profile
        profile.properties.set(properties)
        print(f"✅ Assigned {properties.count()} properties to {admin_user.username} profile")
        
        # Verify
        user_properties_count = admin_user.accessible_properties.count()
        profile_properties_count = profile.properties.count()
        
        print(f"\n🎯 Verification:")
        print(f"   Properties in users field: {user_properties_count}")
        print(f"   Properties in profile: {profile_properties_count}")
        
        if user_properties_count > 0 and profile_properties_count > 0:
            print(f"✅ Success! Admin user now has access to properties")
        else:
            print(f"❌ Something went wrong with property assignment")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == '__main__':
    main()
