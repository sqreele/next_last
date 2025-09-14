#!/usr/bin/env python3
"""
Script to fix User and UserProfile property relationships by creating proper ForeignKey links
"""

import os
import sys
import django

# Add the project directory to Python path
sys.path.append('/app/src')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import User, UserProfile, Property

def fix_property_relationships():
    """Fix property relationships for users and user profiles"""
    print("🔧 Fixing property relationships...")
    
    # Get all users
    users = User.objects.all()
    print(f"Found {users.count()} users")
    
    # Get all properties
    properties = Property.objects.all()
    print(f"Found {properties.count()} properties")
    
    if not properties.exists():
        print("❌ No properties found. Creating a default property first...")
        default_property = Property.objects.create(
            name="Default Property",
            description="Default property for users without specific property assignment"
        )
        properties = Property.objects.all()
        print(f"✅ Created default property: {default_property.name}")
    
    # Fix User model property relationships
    users_updated = 0
    for user in users:
        if user.property_name and not user.property_id:
            # Try to find matching property by name
            try:
                property_obj = Property.objects.get(name=user.property_name)
                user.property_id = str(property_obj.id)
                user.save()
                users_updated += 1
                print(f"  ✅ Updated user {user.username}: linked to property {property_obj.name}")
            except Property.DoesNotExist:
                print(f"  ⚠️  User {user.username}: property '{user.property_name}' not found")
        elif not user.property_name and not user.property_id:
            # Assign to default property
            default_property = properties.first()
            user.property_name = default_property.name
            user.property_id = str(default_property.id)
            user.save()
            users_updated += 1
            print(f"  ✅ Updated user {user.username}: assigned to default property")
    
    print(f"✅ Updated {users_updated} users")
    
    # Fix UserProfile model property relationships
    profiles_updated = 0
    for profile in UserProfile.objects.all():
        if profile.property_name and not profile.property_id:
            # Try to find matching property by name
            try:
                property_obj = Property.objects.get(name=profile.property_name)
                profile.property_id = str(property_obj.id)
                profile.save()
                
                # Also add to the many-to-many relationship
                profile.properties.add(property_obj)
                profiles_updated += 1
                print(f"  ✅ Updated profile for {profile.user.username}: linked to property {property_obj.name}")
            except Property.DoesNotExist:
                print(f"  ⚠️  Profile for {profile.user.username}: property '{profile.property_name}' not found")
        elif not profile.property_name and not profile.property_id:
            # Assign to default property
            default_property = properties.first()
            profile.property_name = default_property.name
            profile.property_id = str(default_property.id)
            profile.save()
            profile.properties.add(default_property)
            profiles_updated += 1
            print(f"  ✅ Updated profile for {profile.user.username}: assigned to default property")
    
    print(f"✅ Updated {profiles_updated} user profiles")
    
    # Summary
    print("\n📊 Summary:")
    print(f"  Users with property assignments: {User.objects.exclude(property_id='').count()}")
    print(f"  UserProfiles with property assignments: {UserProfile.objects.exclude(property_id='').count()}")
    print(f"  UserProfiles with many-to-many property links: {UserProfile.objects.filter(properties__isnull=False).distinct().count()}")
    
    print("\n✅ Property relationships fixed successfully!")

if __name__ == "__main__":
    fix_property_relationships()
