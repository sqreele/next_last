#!/usr/bin/env python
"""
Fix inconsistent migration history.
Migration 0041 is applied but its dependency 0040 is not.
This script removes migrations 0041+ and then re-applies them in order.
Run: python fix_inconsistent_migrations.py
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
    sys.exit(1)

from django.db import connection

def fix_inconsistent_migrations():
    """Fix inconsistent migration history"""
    print("=" * 60)
    print("Fixing Inconsistent Migration History")
    print("=" * 60)
    
    try:
        with connection.cursor() as cursor:
            # Check current state
            cursor.execute("""
                SELECT name, applied 
                FROM django_migrations 
                WHERE app = 'myappLubd' 
                AND name >= '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more'
                ORDER BY name
            """)
            migrations = cursor.fetchall()
            
            print("\nCurrent migrations 0040+ in database:")
            for name, applied in migrations:
                print(f"  [{applied}] {name}")
            
            # Find migrations that need to be removed (0041 and later)
            migrations_to_remove = []
            migration_0040_found = False
            
            for name, applied in migrations:
                if '0040_rename_myapplubd_mp_category_idx' in name:
                    migration_0040_found = True
                elif migration_0040_found == False:
                    # Migration 0040 not found, but later migrations exist
                    migrations_to_remove.append(name)
                else:
                    # Migration 0040 found, but we need to check dependencies
                    # Actually, if 0040 is not applied, we should remove all 0041+
                    if '0041' <= name[:4] <= '0050':
                        migrations_to_remove.append(name)
            
            # Also check if 0040 exists
            cursor.execute("""
                SELECT name FROM django_migrations 
                WHERE app = 'myappLubd' 
                AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more'
            """)
            migration_0040_exists = cursor.fetchone() is not None
            
            if not migration_0040_exists:
                # Remove all migrations 0041+ that depend on 0040
                print("\nMigration 0040 is NOT applied, but later migrations are.")
                print("Removing migrations 0041+ that depend on 0040...")
                
                cursor.execute("""
                    DELETE FROM django_migrations 
                    WHERE app = 'myappLubd' 
                    AND name >= '0041_add_group_id_to_machine'
                    AND name <= '0050_add_email_notifications_enabled'
                """)
                removed_count = cursor.rowcount
                print(f"✓ Removed {removed_count} migrations")
                
                # Now insert migration 0040
                print("\nFake applying migration 0040...")
                cursor.execute("""
                    INSERT INTO django_migrations (app, name, applied)
                    VALUES (%s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, ['myappLubd', '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more', datetime.now()])
                print("✓ Migration 0040 fake applied")
                
                print("\n" + "=" * 60)
                print("SUCCESS! Migration history fixed.")
                print("=" * 60)
                print("\nNext steps:")
                print("1. Fake apply remaining migrations:")
                print("   python manage.py migrate myappLubd 0041 --fake")
                print("   python manage.py migrate myappLubd 0042 --fake")
                print("   # ... continue for all migrations up to latest")
                print("\n2. Or run normal migrations (will apply any new ones):")
                print("   python manage.py migrate")
                return True
            else:
                print("\n✓ Migration 0040 is already applied")
                print("Migration history should be consistent now.")
                return True
                
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = fix_inconsistent_migrations()
    sys.exit(0 if success else 1)

