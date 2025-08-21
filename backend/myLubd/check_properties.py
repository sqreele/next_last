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
    print("🔍 Checking database state...")
    
    # Check properties
    properties = Property.objects.all()
    print(f"\n📋 Properties in database: {properties.count()}")
    
    if properties.count() > 0:
        for prop in properties:
            print(f"   - {prop.name} (ID: {prop.property_id})")
            print(f"     Users: {prop.users.count()}")
            for user in prop.users.all():
                print(f"       - {user.username}")
    else:
        print("   ❌ No properties found!")
    
    # Check users
    users = User.objects.all()
    print(f"\n👥 Users in database: {users.count()}")
    
    for user in users:
        print(f"   - {user.username}")
        print(f"     Is superuser: {user.is_superuser}")
        print(f"     Is staff: {user.is_staff}")
        print(f"     Is active: {user.is_active}")
        
        # Check user profile
        try:
            profile = UserProfile.objects.get(user=user)
            print(f"     Profile properties: {profile.properties.count()}")
            for prop in profile.properties.all():
                print(f"       - {prop.name} ({prop.property_id})")
        except UserProfile.DoesNotExist:
            print(f"     ❌ No user profile found!")
    
    # Check if admin user exists and has properties
    try:
        admin_user = User.objects.get(username='admin')
        print(f"\n👑 Admin user found: {admin_user.username}")
        
        # Check if admin has properties in the users field
        admin_properties = Property.objects.filter(users=admin_user)
        print(f"   Properties in users field: {admin_properties.count()}")
        
        # Check if admin has properties in the profile
        try:
            admin_profile = UserProfile.objects.get(user=admin_user)
            profile_properties = admin_profile.properties.all()
            print(f"   Properties in profile: {profile_properties.count()}")
            
            if profile_properties.count() > 0:
                for prop in profile_properties:
                    print(f"     - {prop.name} ({prop.property_id})")
            else:
                print("     ❌ No properties in profile!")
                
        except UserProfile.DoesNotExist:
            print("   ❌ No user profile found!")
            
    except User.DoesNotExist:
        print(f"\n❌ User 'admin' not found!")

if __name__ == '__main__':
    main()
