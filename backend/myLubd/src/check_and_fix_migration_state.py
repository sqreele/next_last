#!/usr/bin/env python
"""
Script to check and fix migration state issues.
Run this inside the Docker container: docker-compose -f docker-compose.dev.yml exec backend python check_and_fix_migration_state.py
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

def check_migration_0040():
    """Check if migration 0040 is applied"""
    recorder = MigrationRecorder(connection)
    applied = recorder.applied_migrations()
    
    migration_0040 = ('myappLubd', '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more')
    
    if migration_0040 in applied:
        print("✓ Migration 0040 is APPLIED")
        return True
    else:
        print("✗ Migration 0040 is NOT applied")
        return False

def check_fields_exist():
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

def unapply_migration_0040():
    """Manually unapply migration 0040 from the database"""
    with connection.cursor() as cursor:
        cursor.execute("""
            DELETE FROM django_migrations 
            WHERE app = 'myappLubd' 
            AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more'
        """)
        print("✓ Removed migration 0040 from django_migrations table")

if __name__ == '__main__':
    print("=" * 60)
    print("Migration State Checker")
    print("=" * 60)
    
    migration_0040_applied = check_migration_0040()
    fields_exist = check_fields_exist()
    
    print("\n" + "=" * 60)
    print("Analysis:")
    print("=" * 60)
    
    if migration_0040_applied and fields_exist:
        print("\n✓ Migration 0040 is applied and fields exist in database.")
        print("This is the correct state. The error might be due to Django's cached state.")
        print("\nTry:")
        print("1. Restart the Django container to clear any cached state")
        print("2. Then run: python manage.py migrate")
    elif migration_0040_applied and not fields_exist:
        print("\n⚠ WARNING: Migration 0040 is applied but fields are MISSING!")
        print("This suggests migration 0040 was applied with the old (incorrect) version.")
        print("\nTo fix:")
        print("1. Run this script with --fix flag to unapply migration 0040")
        print("2. Then fake apply the fixed migration 0040")
    elif not migration_0040_applied and fields_exist:
        print("\n✓ Migration 0040 is not applied and fields exist.")
        print("You can safely fake apply migration 0040:")
        print("  python manage.py migrate myappLubd 0040 --fake")
    else:
        print("\n✗ Migration 0040 is not applied and fields are missing.")
        print("This is unexpected. Check your database state.")
    
    # If --fix flag is provided, unapply migration 0040
    if '--fix' in sys.argv:
        if migration_0040_applied:
            print("\n" + "=" * 60)
            print("Fixing migration state...")
            print("=" * 60)
            unapply_migration_0040()
            print("\n✓ Migration 0040 has been unapplied.")
            print("\nNext steps:")
            print("1. Fake apply the fixed migration 0040:")
            print("   python manage.py migrate myappLubd 0040 --fake")
            print("2. Continue with remaining migrations:")
            print("   python manage.py migrate")
        else:
            print("\nMigration 0040 is not applied, nothing to fix.")

