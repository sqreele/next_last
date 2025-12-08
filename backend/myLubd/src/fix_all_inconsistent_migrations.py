#!/usr/bin/env python
"""
Comprehensive fix for all inconsistent migration history issues.
This script removes migrations that are applied but their dependencies are missing,
then re-applies them in the correct order.
Run: python fix_all_inconsistent_migrations.py
"""
import os
import sys
import django
from datetime import datetime
import importlib.util

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')

try:
    django.setup()
except Exception as e:
    print(f"Error: Django setup failed: {e}")
    sys.exit(1)

from django.db import connection
from django.db.migrations.loader import MigrationLoader

def get_migration_dependencies():
    """Get all migrations and their dependencies"""
    loader = MigrationLoader(connection)
    migrations = {}
    
    for key, migration in loader.disk_migrations.items():
        app, name = key
        if app == 'myappLubd' and name >= '0040':
            migrations[name] = {
                'dependencies': migration.dependencies,
                'app': app
            }
    
    return migrations

def get_applied_migrations():
    """Get all applied migrations from database"""
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT name, applied 
            FROM django_migrations 
            WHERE app = 'myappLubd' 
            AND name >= '0040'
            ORDER BY name
        """)
        return {name: applied for name, applied in cursor.fetchall()}

def check_dependencies_satisfied(migration_name, migration_deps, applied_migrations):
    """Check if all dependencies of a migration are satisfied"""
    for dep_app, dep_name in migration_deps:
        if dep_app == 'myappLubd' and dep_name >= '0040':
            if dep_name not in applied_migrations:
                return False, dep_name
    return True, None

def fix_inconsistent_migrations():
    """Fix all inconsistent migrations"""
    print("=" * 60)
    print("Fixing All Inconsistent Migrations")
    print("=" * 60)
    
    try:
        # Get migration dependencies
        print("\nStep 1: Loading migration dependencies...")
        migrations = get_migration_dependencies()
        print(f"  Found {len(migrations)} migrations to check")
        
        # Get applied migrations
        print("\nStep 2: Checking applied migrations...")
        applied_migrations = get_applied_migrations()
        print(f"  Found {len(applied_migrations)} applied migrations")
        
        # Find inconsistent migrations
        print("\nStep 3: Finding inconsistent migrations...")
        inconsistent = []
        
        for name, info in migrations.items():
            if name in applied_migrations:
                satisfied, missing_dep = check_dependencies_satisfied(
                    name, info['dependencies'], applied_migrations
                )
                if not satisfied:
                    inconsistent.append((name, missing_dep))
                    print(f"  ✗ {name} depends on {missing_dep} (not applied)")
        
        if not inconsistent:
            print("  ✓ No inconsistent migrations found!")
            return True
        
        # Remove inconsistent migrations
        print(f"\nStep 4: Removing {len(inconsistent)} inconsistent migrations...")
        with connection.cursor() as cursor:
            for name, missing_dep in inconsistent:
                cursor.execute("""
                    DELETE FROM django_migrations 
                    WHERE app = 'myappLubd' 
                    AND name = %s
                """, [name])
                print(f"  ✓ Removed {name}")
        
        # Now ensure all dependencies are applied
        print("\nStep 5: Ensuring all dependencies are applied...")
        with connection.cursor() as cursor:
            # Get current applied migrations again
            cursor.execute("""
                SELECT name FROM django_migrations 
                WHERE app = 'myappLubd' 
                AND name >= '0040'
            """)
            current_applied = {row[0] for row in cursor.fetchall()}
            
            # Apply migrations in dependency order
            to_apply = []
            for name, info in sorted(migrations.items()):
                if name not in current_applied:
                    # Check if dependencies are satisfied
                    satisfied, missing = check_dependencies_satisfied(
                        name, info['dependencies'], current_applied
                    )
                    if satisfied:
                        to_apply.append(name)
            
            # Apply migrations
            for name in to_apply:
                cursor.execute("""
                    INSERT INTO django_migrations (app, name, applied)
                    VALUES (%s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, ['myappLubd', name, datetime.now()])
                current_applied.add(name)
                print(f"  ✓ Fake applied {name}")
        
        print("\n" + "=" * 60)
        print("SUCCESS! All inconsistent migrations fixed.")
        print("=" * 60)
        print("\nNext step: Run normal migrations")
        print("  python manage.py migrate")
        return True
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = fix_inconsistent_migrations()
    sys.exit(0 if success else 1)

