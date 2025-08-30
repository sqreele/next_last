#!/usr/bin/env python3
"""
Script to delete the development user from the Django database.
This script should be run from within the Django environment.
"""

import os
import sys
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.db import transaction

def delete_developer_user():
    """Delete the development user if it exists"""
    User = get_user_model()
    
    try:
        # Find the developer user
        developer_user = User.objects.filter(username='developer').first()
        
        if developer_user:
            print(f"🔍 Found development user: {developer_user.username} (ID: {developer_user.id})")
            print(f"   Email: {developer_user.email}")
            print(f"   Name: {developer_user.first_name} {developer_user.last_name}")
            print(f"   Created: {developer_user.date_joined}")
            
            # Confirm deletion
            confirm = input("\n❓ Are you sure you want to delete this user? (yes/no): ").lower().strip()
            
            if confirm in ['yes', 'y']:
                with transaction.atomic():
                    developer_user.delete()
                    print("✅ Development user deleted successfully!")
            else:
                print("❌ Deletion cancelled.")
        else:
            print("ℹ️  No development user found with username 'developer'")
            
    except Exception as e:
        print(f"❌ Error deleting development user: {e}")
        return False
    
    return True

if __name__ == '__main__':
    print("🗑️  Development User Deletion Script")
    print("=" * 40)
    
    success = delete_developer_user()
    
    if success:
        print("\n✅ Script completed successfully!")
    else:
        print("\n❌ Script failed!")
        sys.exit(1)
