#!/usr/bin/env python
"""
Direct fix for migration state - checks database and fixes if needed.
Run inside container: python fix_migration_state_direct.py
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from django.db import connection

print("=" * 60)
print("Checking Migration State")
print("=" * 60)

# Check if migration 0040 is applied
with connection.cursor() as cursor:
    cursor.execute("""
        SELECT name, applied 
        FROM django_migrations 
        WHERE app = 'myappLubd' 
        AND name LIKE '0040%'
    """)
    result = cursor.fetchone()
    
    if result:
        name, applied = result
        print(f"Migration 0040 found: {name}")
        print(f"Applied at: {applied}")
        
        # Check if fields exist
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'myappLubd_preventivemaintenance'
            AND column_name IN ('after_image', 'before_image')
        """)
        fields = [row[0] for row in cursor.fetchall()]
        
        if 'after_image' in fields and 'before_image' in fields:
            print("\n✓ Fields exist in database")
            print("\nMigration 0040 was likely applied with the old (incorrect) version.")
            print("Removing it from django_migrations so Django can rebuild state correctly...")
            
            cursor.execute("""
                DELETE FROM django_migrations 
                WHERE app = 'myappLubd' 
                AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more'
            """)
            print("✓ Removed migration 0040 from django_migrations")
            print("\nNext steps:")
            print("1. Exit this container")
            print("2. Run: python manage.py migrate myappLubd 0040 --fake")
            print("3. Then: python manage.py migrate")
        else:
            print("\n✗ Fields are MISSING from database!")
            print("This is unexpected. The fields should exist.")
    else:
        print("Migration 0040 is NOT applied in database")
        print("\nYou can try:")
        print("  python manage.py migrate myappLubd 0040 --fake")

