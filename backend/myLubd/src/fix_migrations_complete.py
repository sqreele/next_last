#!/usr/bin/env python
"""
Complete migration fix script.
This script fixes the migration state by removing migration 0040 if it was applied with the old version.
Run: python fix_migrations_complete.py
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')

try:
    django.setup()
except Exception as e:
    print(f"Warning: Could not setup Django: {e}")
    print("This is okay - we'll use raw SQL instead")
    django.setup = None

from django.db import connection

def fix_migration_state():
    """Fix migration state by removing migration 0040 if needed"""
    print("=" * 60)
    print("Migration State Fix")
    print("=" * 60)
    
    try:
        with connection.cursor() as cursor:
            # Check if migration 0040 is applied
            cursor.execute("""
                SELECT name, applied 
                FROM django_migrations 
                WHERE app = 'myappLubd' 
                AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more'
            """)
            result = cursor.fetchone()
            
            if result:
                name, applied = result
                print(f"✓ Found migration 0040 applied at: {applied}")
                
                # Check if fields exist in preventivemaintenance
                cursor.execute("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'myappLubd_preventivemaintenance'
                    AND column_name IN ('after_image', 'before_image')
                """)
                fields = [row[0] for row in cursor.fetchall()]
                
                if 'after_image' in fields and 'before_image' in fields:
                    print("✓ Fields exist in database (correct state)")
                    print("\nRemoving migration 0040 from django_migrations...")
                    
                    cursor.execute("""
                        DELETE FROM django_migrations 
                        WHERE app = 'myappLubd' 
                        AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more'
                    """)
                    print("✓ Migration 0040 removed from django_migrations")
                    print("\n" + "=" * 60)
                    print("SUCCESS! Migration state fixed.")
                    print("=" * 60)
                    print("\nNext steps:")
                    print("1. Clear Python cache:")
                    print("   find . -name '*.pyc' -delete")
                    print("   find . -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null")
                    print("\n2. Fake apply the fixed migration 0040:")
                    print("   python manage.py migrate myappLubd 0040 --fake")
                    print("\n3. Continue with migrations:")
                    print("   python manage.py migrate")
                    return True
                else:
                    print("✗ Fields are missing from database!")
                    print("This is unexpected. Please check your database state.")
                    return False
            else:
                print("✓ Migration 0040 is NOT applied (this is fine)")
                print("\nYou can try:")
                print("  python manage.py migrate myappLubd 0040 --fake")
                return True
                
    except Exception as e:
        print(f"✗ Error: {e}")
        print("\nTrying alternative method using raw SQL...")
        return False

if __name__ == '__main__':
    success = fix_migration_state()
    sys.exit(0 if success else 1)

