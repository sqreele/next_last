#!/usr/bin/env python3
"""
Simple script to fix property relationships by linking existing data
"""

import os
import sys
import django

# Add the project directory to Python path
sys.path.append('/app/src')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import User, UserProfile, Property

def fix_property_links():
    """Fix property relationships by linking users to properties"""
    print("🔧 Fixing Property Relationships...")
    
    # Get all properties
    properties = Property.objects.all()
    print(f"Found {properties.count()} properties")
    
    if not properties.exists():
        print("❌ No properties found. Creating a default property...")
        default_property = Property.objects.create(
            name="Default Property",
            description="Default property for users"
        )
        properties = Property.objects.all()
        print(f"✅ Created default property: {default_property.name}")
    
    # Create a mapping of property names to property objects
    property_map = {prop.name: prop for prop in properties}
    
    # Fix User model property relationships
    users_fixed = 0
    for user in User.objects.all():
        if user.property_name and user.property_name in property_map:
            # Link user to property via ManyToMany
            property_obj = property_map[user.property_name]
            user.accessible_properties.add(property_obj)
            users_fixed += 1
            print(f"  ✅ Linked user {user.username} to property {property_obj.name}")
        elif not user.property_name:
            # Assign to first available property
            first_property = properties.first()
            user.accessible_properties.add(first_property)
            user.property_name = first_property.name
            user.property_id = first_property.property_id
            user.save()
            users_fixed += 1
            print(f"  ✅ Assigned user {user.username} to default property {first_property.name}")
    
    print(f"✅ Fixed {users_fixed} user property relationships")
    
    # Fix UserProfile model property relationships
    profiles_fixed = 0
    for profile in UserProfile.objects.all():
        if profile.property_name and profile.property_name in property_map:
            # Link profile to property via ManyToMany
            property_obj = property_map[profile.property_name]
            profile.properties.add(property_obj)
            profiles_fixed += 1
            print(f"  ✅ Linked profile for {profile.user.username} to property {property_obj.name}")
        elif not profile.property_name:
            # Assign to first available property
            first_property = properties.first()
            profile.properties.add(first_property)
            profile.property_name = first_property.name
            profile.property_id = first_property.property_id
            profile.save()
            profiles_fixed += 1
            print(f"  ✅ Assigned profile for {profile.user.username} to default property {first_property.name}")
    
    print(f"✅ Fixed {profiles_fixed} user profile property relationships")
    
    # Summary
    print("\n📊 Final Status:")
    print(f"  Users with property access: {User.objects.filter(accessible_properties__isnull=False).distinct().count()}")
    print(f"  UserProfiles with property access: {UserProfile.objects.filter(properties__isnull=False).distinct().count()}")
    
    print("\n✅ Property relationships fixed successfully!")

if __name__ == "__main__":
    fix_property_links()
