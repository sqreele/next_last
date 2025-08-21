#!/usr/bin/env python
import os
import sys
import django
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import Room, Property
from django.contrib.auth import get_user_model
User = get_user_model()

def test_room_queries():
    print("🔍 Testing room queries...")
    
    # Get admin user
    try:
        admin_user = User.objects.get(username='admin')
        print(f"✅ Admin user: {admin_user.username}")
    except User.DoesNotExist:
        print("❌ Admin user not found")
        return
    
    # Get user properties
    user_properties = Property.objects.filter(users=admin_user)
    print(f"📋 User properties: {user_properties.count()}")
    for prop in user_properties:
        print(f"  - {prop.name} ({prop.property_id})")
    
    # Get all rooms
    all_rooms = Room.objects.all()
    print(f"\n🏠 All rooms: {all_rooms.count()}")
    for room in all_rooms:
        print(f"  - {room.name} (ID: {room.room_id})")
        print(f"    Properties: {[p.property_id for p in room.properties.all()]}")
    
    # Test different query approaches
    print(f"\n🔍 Testing query approaches...")
    
    # Approach 1: properties__in=user_properties
    queryset1 = Room.objects.filter(properties__in=user_properties).distinct()
    print(f"Query 1 (properties__in): {queryset1.count()} rooms")
    for room in queryset1:
        print(f"  - {room.name}")
    
    # Approach 2: properties__property_id__in
    property_ids = [p.property_id for p in user_properties]
    queryset2 = Room.objects.filter(properties__property_id__in=property_ids).distinct()
    print(f"Query 2 (properties__property_id__in): {queryset2.count()} rooms")
    for room in queryset2:
        print(f"  - {room.name}")
    
    # Approach 3: Direct property filter
    if user_properties.count() > 0:
        first_property = user_properties.first()
        queryset3 = Room.objects.filter(properties=first_property)
        print(f"Query 3 (properties=first_property): {queryset3.count()} rooms")
        for room in queryset3:
            print(f"  - {room.name}")
    
    # Approach 4: Check if room has any of user's properties
    print(f"\n🔍 Manual check...")
    for room in all_rooms:
        room_property_ids = [p.property_id for p in room.properties.all()]
        user_property_ids = [p.property_id for p in user_properties]
        has_access = any(pid in user_property_ids for pid in room_property_ids)
        print(f"Room {room.name}: Properties {room_property_ids}, User has access: {has_access}")

if __name__ == '__main__':
    test_room_queries()
