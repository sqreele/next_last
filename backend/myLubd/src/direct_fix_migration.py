#!/usr/bin/env python
"""
Direct fix for migration state issue.
This script directly manipulates the django_migrations table to fix the state.
Run: docker-compose -f docker-compose.dev.yml exec backend python direct_fix_migration.py
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from django.db import connection

def check_migrations():
    """Check which migrations are applied"""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT app, name, applied 
            FROM django_migrations 
            WHERE app = 'myappLubd' 
            AND name LIKE '004%'
            ORDER BY applied DESC
        """)
        migrations = cursor.fetchall()
        
        print("Applied migrations 0040-0049:")
        for app, name, applied in migrations:
            print(f"  [{applied}] {name}")
        
        return migrations

def remove_migration_0040():
    """Remove migration 0040 from django_migrations table"""
    with connection.cursor() as cursor:
        cursor.execute("""
            DELETE FROM django_migrations 
            WHERE app = 'myappLubd' 
            AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more'
        """)
        print("✓ Removed migration 0040 from django_migrations table")
        return cursor.rowcount > 0

def check_fields():
    """Check if fields exist in database"""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'myappLubd_preventivemaintenance'
            AND column_name IN ('after_image', 'before_image', 'after_image_jpeg_path', 'before_image_jpeg_path')
        """)
        fields = [row[0] for row in cursor.fetchall()]
        print(f"\nFields found: {fields}")
        return len(fields) == 4

if __name__ == '__main__':
    print("=" * 60)
    print("Direct Migration Fix")
    print("=" * 60)
    
    migrations = check_migrations()
    fields_exist = check_fields()
    
    migration_0040_applied = any('0040' in name for _, name, _ in migrations)
    
    print(f"\nMigration 0040 applied: {migration_0040_applied}")
    print(f"Fields exist: {fields_exist}")
    
    if migration_0040_applied:
        print("\n" + "=" * 60)
        print("Removing migration 0040 from database...")
        print("=" * 60)
        if remove_migration_0040():
            print("\n✓ Success! Migration 0040 has been removed.")
            print("\nNext steps:")
            print("1. Fake apply the fixed migration 0040:")
            print("   python manage.py migrate myappLubd 0040 --fake")
            print("2. Continue with remaining migrations:")
            print("   python manage.py migrate")
        else:
            print("\n✗ Migration 0040 was not found in database.")
    else:
        print("\nMigration 0040 is not applied. You can try:")
        print("  python manage.py migrate myappLubd 0040 --fake")

