#!/usr/bin/env python
import os
import sys
import django

# Add the src directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import User, UserProfile, Property
from django.contrib.auth import get_user_model

User = get_user_model()

def check_property_names():
    print("🔍 Checking Property Names in Backend Models...")
    print("=" * 60)
    
    # Check all users
    print("\n👥 USER MODEL ANALYSIS:")
    users = User.objects.all()
    print(f"Total users: {users.count()}")
    
    users_with_property_name = users.exclude(property_name__isnull=True).exclude(property_name='')
    users_without_property_name = users.filter(property_name__isnull=True) | users.filter(property_name='')
    
    print(f"Users WITH property_name: {users_with_property_name.count()}")
    print(f"Users WITHOUT property_name: {users_without_property_name.count()}")
    
    print("\n📋 Users with property names:")
    for user in users_with_property_name:
        print(f"  - {user.username}: '{user.property_name}' (ID: {user.property_id})")
    
    print("\n❌ Users without property names:")
    for user in users_without_property_name:
        print(f"  - {user.username}: (empty)")
    
    # Check all properties
    print("\n🏢 PROPERTY MODEL ANALYSIS:")
    properties = Property.objects.all()
    print(f"Total properties: {properties.count()}")
    
    for prop in properties:
        assigned_users = prop.users.all()
        print(f"  - {prop.name} ({prop.property_id}): {assigned_users.count()} assigned users")
        for user in assigned_users:
            print(f"    → {user.username}")
    
    # Check user profiles
    print("\n👤 USER PROFILE ANALYSIS:")
    profiles = UserProfile.objects.all()
    print(f"Total user profiles: {profiles.count()}")
    
    profiles_with_properties = profiles.filter(properties__isnull=False).distinct()
    profiles_without_properties = profiles.filter(properties__isnull=True)
    
    print(f"Profiles WITH properties: {profiles_with_properties.count()}")
    print(f"Profiles WITHOUT properties: {profiles_without_properties.count()}")
    
    print("\n📋 User profiles with properties:")
    for profile in profiles_with_properties:
        prop_names = [f"{p.name} ({p.property_id})" for p in profile.properties.all()]
        print(f"  - {profile.user.username}: {', '.join(prop_names)}")
    
    print("\n❌ User profiles without properties:")
    for profile in profiles_without_properties:
        print(f"  - {profile.user.username}: (no properties assigned)")

def fix_empty_property_names():
    print("\n🔧 FIXING EMPTY PROPERTY NAMES...")
    print("=" * 60)
    
    # Get first property as default
    default_property = Property.objects.first()
    if not default_property:
        print("❌ No properties exist! Create properties first.")
        return
    
    print(f"Using default property: {default_property.name} ({default_property.property_id})")
    
    # Fix users without property names
    users_fixed = 0
    for user in User.objects.filter(property_name__isnull=True) | User.objects.filter(property_name=''):
        user.property_name = default_property.name
        user.property_id = default_property.property_id
        user.save()
        
        # Also link via ManyToMany
        user.accessible_properties.add(default_property)
        users_fixed += 1
        print(f"  ✅ Fixed user: {user.username}")
    
    print(f"✅ Fixed {users_fixed} users")
    
    # Fix user profiles without properties
    profiles_fixed = 0
    for profile in UserProfile.objects.filter(properties__isnull=True):
        profile.properties.add(default_property)
        profile.property_name = default_property.name
        profile.property_id = default_property.property_id
        profile.save()
        profiles_fixed += 1
        print(f"  ✅ Fixed profile: {profile.user.username}")
    
    print(f"✅ Fixed {profiles_fixed} user profiles")

if __name__ == '__main__':
    check_property_names()
    
    # Ask if user wants to fix the issues
    fix_it = input("\n🔧 Do you want to fix empty property names? (y/n): ")
    if fix_it.lower() in ['y', 'yes']:
        fix_empty_property_names()
        print("\n🎉 Property names have been fixed!")
        print("Now check your Django admin to see the property names displayed.")
    else:
        print("\n💡 To fix the issues, run this script again and choose 'y' when prompted.")
