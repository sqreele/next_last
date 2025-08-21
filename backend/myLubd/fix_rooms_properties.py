#!/usr/bin/env python
"""
Fix script to associate rooms with properties if they're missing
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
    print("🔧 Fixing room-property associations...")
    print("=" * 50)
    
    # 1. Check current state
    print("\n1. 📊 CURRENT STATE:")
    properties = Property.objects.all()
    rooms = Room.objects.all()
    
    print(f"   Properties: {properties.count()}")
    print(f"   Rooms: {rooms.count()}")
    
    if properties.count() == 0:
        print("   ❌ No properties exist! Cannot fix rooms.")
        return
    
    if rooms.count() == 0:
        print("   ❌ No rooms exist! Nothing to fix.")
        return
    
    # 2. Find rooms without properties
    rooms_without_props = Room.objects.filter(properties__isnull=True)
    print(f"\n2. 🚨 ROOMS WITHOUT PROPERTIES: {rooms_without_props.count()}")
    
    if rooms_without_props.count() == 0:
        print("   ✅ All rooms already have properties assigned!")
        return
    
    # 3. Get the first property as default
    default_property = properties.first()
    print(f"\n3. 🎯 DEFAULT PROPERTY: {default_property.name} ({default_property.property_id})")
    
    # 4. Fix rooms without properties
    print(f"\n4. 🔧 FIXING ROOMS...")
    fixed_count = 0
    
    for room in rooms_without_props:
        print(f"   - Fixing {room.name} (ID: {room.room_id})")
        
        # Associate room with default property
        room.properties.add(default_property)
        fixed_count += 1
        
        print(f"     ✅ Associated with {default_property.name}")
    
    print(f"\n5. ✅ FIX COMPLETE:")
    print(f"   Fixed {fixed_count} rooms")
    
    # 5. Verify the fix
    print(f"\n6. 🔍 VERIFICATION:")
    rooms_without_props_after = Room.objects.filter(properties__isnull=True)
    print(f"   Rooms without properties after fix: {rooms_without_props_after.count()}")
    
    if rooms_without_props_after.count() == 0:
        print("   ✅ SUCCESS: All rooms now have properties!")
    else:
        print("   ⚠️  WARNING: Some rooms still don't have properties")
    
    # 6. Test the API query
    print(f"\n7. 🧪 TESTING API QUERY:")
    rooms_for_property = Room.objects.filter(properties__property_id=default_property.property_id)
    print(f"   Rooms for property {default_property.property_id}: {rooms_for_property.count()}")
    
    if rooms_for_property.count() > 0:
        print("   ✅ API query should now return rooms!")
    else:
        print("   ❌ API query still returns no rooms - check permission logic")
    
    print("\n" + "=" * 50)
    print("🔧 FIX COMPLETE")

if __name__ == '__main__':
    main()
