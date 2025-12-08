#!/usr/bin/env python
"""
Directly fake apply migration 0040 by inserting it into django_migrations table.
This bypasses Django's state building which is causing the error.
Run: python fake_migration_0040_direct.py
"""
import os
import sys
import django
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')

try:
    django.setup()
except Exception as e:
    print(f"Warning: Django setup failed: {e}")
    print("Trying to proceed anyway...")

from django.db import connection

def fake_migration_0040():
    """Directly insert migration 0040 into django_migrations table"""
    print("=" * 60)
    print("Fake Applying Migration 0040 (Direct Method)")
    print("=" * 60)
    
    migration_name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more'
    
    try:
        with connection.cursor() as cursor:
            # Check if already applied
            cursor.execute("""
                SELECT name, applied 
                FROM django_migrations 
                WHERE app = 'myappLubd' 
                AND name = %s
            """, [migration_name])
            
            result = cursor.fetchone()
            
            if result:
                print(f"✓ Migration 0040 is already applied at: {result[1]}")
                print("No action needed.")
                return True
            
            # Insert migration directly
            print("Inserting migration 0040 into django_migrations...")
            cursor.execute("""
                INSERT INTO django_migrations (app, name, applied)
                VALUES (%s, %s, %s)
            """, ['myappLubd', migration_name, datetime.now()])
            
            print("✓ Migration 0040 has been fake applied!")
            print("\n" + "=" * 60)
            print("SUCCESS!")
            print("=" * 60)
            print("\nNext step: Run remaining migrations")
            print("  python manage.py migrate")
            return True
            
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = fake_migration_0040()
    sys.exit(0 if success else 1)

