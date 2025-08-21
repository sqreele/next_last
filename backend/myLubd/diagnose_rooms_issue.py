#!/usr/bin/env python
"""
Diagnostic script to identify why rooms API is returning empty responses
"""
import os
import sys
import django

# Add the src directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import Room, Property, User
from django.contrib.auth import get_user_model

AuthUser = get_user_model()

def main():
    print("🔍 Diagnosing rooms API issue...")
    print("=" * 50)
    
    # 1. Check users
    print("\n1. 👥 USERS:")
    users = AuthUser.objects.all()
    print(f"   Total users: {users.count()}")
    
    for user in users:
        print(f"   - {user.username}")
        print(f"     Is superuser: {user.is_superuser}")
        print(f"     Is staff: {user.is_staff}")
        print(f"     Is active: {user.is_active}")
        
        # Check if user has properties assigned
        user_properties = Property.objects.filter(users=user)
        print(f"     Properties assigned: {user_properties.count()}")
        for prop in user_properties:
            print(f"       - {prop.name} ({prop.property_id})")
    
    # 2. Check properties
    print("\n2. 📋 PROPERTIES:")
    properties = Property.objects.all()
    print(f"   Total properties: {properties.count()}")
    
    for prop in properties:
        print(f"   - {prop.name} ({prop.property_id})")
        print(f"     Users assigned: {prop.users.count()}")
        for user in prop.users.all():
            print(f"       - {user.username}")
    
    # 3. Check rooms
    print("\n3. 🏠 ROOMS:")
    rooms = Room.objects.all()
    print(f"   Total rooms: {rooms.count()}")
    
    if rooms.count() > 0:
        for room in rooms:
            print(f"   - {room.name} (ID: {room.room_id})")
            print(f"     Type: {room.room_type}")
            print(f"     Active: {room.is_active}")
            print(f"     Properties: {room.properties.count()}")
            for prop in room.properties.all():
                print(f"       - {prop.name} ({prop.property_id})")
    else:
        print("   ❌ No rooms found!")
    
    # 4. Check specific user (admin)
    print("\n4. 👑 ADMIN USER CHECK:")
    try:
        admin_user = AuthUser.objects.get(username='admin')
        print(f"   Admin user found: {admin_user.username}")
        print(f"   Is superuser: {admin_user.is_superuser}")
        print(f"   Is staff: {admin_user.is_staff}")
        
        # Check admin's properties
        admin_properties = Property.objects.filter(users=admin_user)
        print(f"   Properties assigned to admin: {admin_properties.count()}")
        for prop in admin_properties:
            print(f"     - {prop.name} ({prop.property_id})")
        
        # Check admin's accessible rooms
        admin_rooms = Room.objects.filter(properties__in=admin_properties).distinct()
        print(f"   Rooms accessible to admin: {admin_rooms.count()}")
        
    except AuthUser.DoesNotExist:
        print("   ❌ Admin user not found!")
    
    # 5. Check room-property relationships
    print("\n5. 🔗 ROOM-PROPERTY RELATIONSHIPS:")
    rooms_with_properties = Room.objects.filter(properties__isnull=False).distinct()
    print(f"   Rooms with properties: {rooms_with_properties.count()}")
    
    rooms_without_properties = Room.objects.filter(properties__isnull=True)
    print(f"   Rooms without properties: {rooms_without_properties.count()}")
    
    if rooms_without_properties.count() > 0:
        print("   ⚠️  Rooms without properties (this could be the issue!):")
        for room in rooms_without_properties:
            print(f"     - {room.name} (ID: {room.room_id})")
    
    # 6. Test queries
    print("\n6. 🧪 TEST QUERIES:")
    
    # Test 1: All rooms
    all_rooms = Room.objects.all()
    print(f"   Query: Room.objects.all() -> {all_rooms.count()} rooms")
    
    # Test 2: Rooms with any properties
    rooms_with_any_props = Room.objects.filter(properties__isnull=False).distinct()
    print(f"   Query: Room.objects.filter(properties__isnull=False).distinct() -> {rooms_with_any_props.count()} rooms")
    
    # Test 3: Rooms for a specific property (if exists)
    if properties.count() > 0:
        first_prop = properties.first()
        rooms_for_prop = Room.objects.filter(properties=first_prop)
        print(f"   Query: Room.objects.filter(properties={first_prop.property_id}) -> {rooms_for_prop.count()} rooms")
    
    # Test 4: Rooms accessible to admin user
    try:
        admin_user = AuthUser.objects.get(username='admin')
        admin_props = Property.objects.filter(users=admin_user)
        admin_accessible_rooms = Room.objects.filter(properties__in=admin_props).distinct()
        print(f"   Query: Admin accessible rooms -> {admin_accessible_rooms.count()} rooms")
    except AuthUser.DoesNotExist:
        print("   Query: Admin accessible rooms -> Admin user not found")
    
    print("\n" + "=" * 50)
    print("🔍 DIAGNOSIS COMPLETE")
    
    # Summary
    print("\n📊 SUMMARY:")
    if rooms.count() == 0:
        print("   ❌ CRITICAL: No rooms exist in database")
    elif rooms_without_properties.count() > 0:
        print("   ⚠️  WARNING: Some rooms are not associated with properties")
        print("   💡 SOLUTION: Associate rooms with properties or modify permission logic")
    elif properties.count() == 0:
        print("   ⚠️  WARNING: No properties exist")
        print("   💡 SOLUTION: Create properties first")
    else:
        print("   ✅ Database structure looks good")
        print("   💡 Issue might be in permission logic or user-property assignments")

if __name__ == '__main__':
    main()
