#!/usr/bin/env python
"""
Script to diagnose and fix migration state issues with preventivemaintenance fields.
Run this inside the Docker container: docker-compose -f docker-compose.dev.yml exec backend python fix_migration_state.py
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

def check_migration_state():
    """Check which migrations are applied"""
    recorder = MigrationRecorder(connection)
    applied = recorder.applied_migrations()
    
    print("Applied migrations for myappLubd:")
    for migration in sorted(applied):
        if 'myappLubd' in migration[0]:
            print(f"  {migration[0]}.{migration[1]}")
    
    # Check specifically for migration 0040
    migration_0040 = ('myappLubd', '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more')
    if migration_0040 in applied:
        print(f"\n✓ Migration 0040 is applied")
        return True
    else:
        print(f"\n✗ Migration 0040 is NOT applied")
        return False

def check_database_fields():
    """Check if preventivemaintenance fields exist in database"""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'myappLubd_preventivemaintenance'
            AND column_name IN ('after_image', 'before_image', 'after_image_jpeg_path', 'before_image_jpeg_path')
            ORDER BY column_name
        """)
        fields = [row[0] for row in cursor.fetchall()]
        
        print("\nFields in myappLubd_preventivemaintenance table:")
        expected_fields = ['after_image', 'after_image_jpeg_path', 'before_image', 'before_image_jpeg_path']
        for field in expected_fields:
            if field in fields:
                print(f"  ✓ {field} exists")
            else:
                print(f"  ✗ {field} MISSING")
        
        return len(fields) == len(expected_fields)

if __name__ == '__main__':
    print("=" * 60)
    print("Migration State Diagnostic")
    print("=" * 60)
    
    migration_0040_applied = check_migration_state()
    fields_exist = check_database_fields()
    
    print("\n" + "=" * 60)
    print("Recommendations:")
    print("=" * 60)
    
    if migration_0040_applied and not fields_exist:
        print("ERROR: Migration 0040 was applied but fields are missing from database!")
        print("This suggests migration 0040 was applied with the old (incorrect) version.")
        print("\nTo fix:")
        print("1. Fake unapply migration 0040:")
        print("   python manage.py migrate myappLubd 0039 --fake")
        print("2. Fake apply the fixed migration 0040:")
        print("   python manage.py migrate myappLubd 0040 --fake")
        print("3. Continue with migrations:")
        print("   python manage.py migrate")
    elif migration_0040_applied and fields_exist:
        print("Migration 0040 is applied and fields exist in database.")
        print("The issue might be with Django's migration state building.")
        print("\nTry:")
        print("1. Fake unapply migration 0040:")
        print("   python manage.py migrate myappLubd 0039 --fake")
        print("2. Fake apply migration 0040:")
        print("   python manage.py migrate myappLubd 0040 --fake")
        print("3. Continue with migrations:")
        print("   python manage.py migrate")
    elif not migration_0040_applied:
        print("Migration 0040 is not applied yet.")
        print("You can try applying it:")
        print("   python manage.py migrate myappLubd 0040")
        print("\nIf that fails, fake it:")
        print("   python manage.py migrate myappLubd 0040 --fake")

