#!/usr/bin/env python
import os
import sys
import django

# Add the src directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import Room, Property
from django.contrib.auth import get_user_model

User = get_user_model()

def main():
    print("🔍 Checking rooms in database...")
    
    # Check properties
    properties = Property.objects.all()
    print(f"\n📋 Properties in database: {properties.count()}")
    
    if properties.count() > 0:
        for prop in properties:
            print(f"   - {prop.name} (ID: {prop.property_id})")
    else:
        print("   ❌ No properties found!")
    
    # Check rooms
    rooms = Room.objects.all()
    print(f"\n🏠 Rooms in database: {rooms.count()}")
    
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
        
        # Create some sample rooms if none exist
        print("\n🏗️ Creating sample rooms...")
        
        if properties.count() > 0:
            first_property = properties.first()
            
            sample_rooms = [
                {
                    'name': 'Room 101',
                    'room_type': 'Office',
                    'is_active': True
                },
                {
                    'name': 'Room 102',
                    'room_type': 'Conference',
                    'is_active': True
                },
                {
                    'name': 'Room 201',
                    'room_type': 'Office',
                    'is_active': True
                },
                {
                    'name': 'Room 202',
                    'room_type': 'Meeting',
                    'is_active': True
                }
            ]
            
            created_rooms = []
            for room_data in sample_rooms:
                room, created = Room.objects.get_or_create(
                    name=room_data['name'],
                    defaults={
                        'room_type': room_data['room_type'],
                        'is_active': room_data['is_active']
                    }
                )
                
                if created:
                    print(f"✅ Created room: {room.name}")
                else:
                    print(f"ℹ️ Room exists: {room.name}")
                
                # Assign to the first property
                room.properties.add(first_property)
                created_rooms.append(room)
            
            print(f"\n✅ Created {len(created_rooms)} rooms and assigned to property: {first_property.name}")
            
            # Verify
            rooms = Room.objects.all()
            print(f"🎯 Total rooms now: {rooms.count()}")
            
            for room in rooms:
                print(f"   - {room.name} -> Properties: {room.properties.count()}")
                for prop in room.properties.all():
                    print(f"     - {prop.name} ({prop.property_id})")
        else:
            print("❌ Cannot create rooms - no properties exist!")

if __name__ == '__main__':
    main()
