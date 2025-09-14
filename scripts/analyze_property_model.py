#!/usr/bin/env python3
"""
Script to analyze the Property model and its relationships
"""

import json

def analyze_property_model():
    print("🏢 Property Model Analysis")
    print("=" * 50)
    
    print("\n📋 Property Model Fields:")
    print("  - id: AutoField (Primary Key)")
    print("  - property_id: CharField (unique, auto-generated)")
    print("  - name: CharField (unique)")
    print("  - description: TextField")
    print("  - created_at: DateTimeField")
    print("  - is_preventivemaintenance: BooleanField")
    
    print("\n🔗 Property Model Relationships:")
    print("  - users: ManyToManyField -> User (accessible_properties)")
    
    print("\n👤 User Model Property Fields:")
    print("  - property_name: CharField (❌ Should be ForeignKey)")
    print("  - property_id: CharField (❌ Should be ForeignKey)")
    
    print("\n👤 UserProfile Model Property Fields:")
    print("  - properties: ManyToManyField -> Property (✅ Correct)")
    print("  - property_name: CharField (❌ Redundant)")
    print("  - property_id: CharField (❌ Redundant)")
    
    print("\n❌ Current Issues:")
    print("  1. User model stores property info as strings instead of ForeignKey")
    print("  2. UserProfile has both ManyToMany and string fields (redundant)")
    print("  3. No direct ForeignKey relationship between User and Property")
    
    print("\n✅ Recommended Solution:")
    print("  1. Add ForeignKey field to User model: property = ForeignKey(Property)")
    print("  2. Remove property_name and property_id from User model")
    print("  3. Keep only ManyToManyField in UserProfile")
    print("  4. Create migration to convert existing data")
    
    print("\n🔧 Migration Strategy:")
    print("  1. Create new ForeignKey field (nullable)")
    print("  2. Populate it from existing property_name/property_id")
    print("  3. Remove old CharField fields")
    print("  4. Update UserProfile to use only ManyToManyField")

if __name__ == "__main__":
    analyze_property_model()
