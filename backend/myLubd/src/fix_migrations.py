#!/usr/bin/env python3
"""
Script to fix Django migration conflicts when migrations reference nonexistent parents.
This script can be run inside the Docker container.
"""

import os
import sys

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Try to set up Django
try:
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
    import django
    django.setup()
    DJANGO_AVAILABLE = True
except Exception as e:
    print(f"Warning: Could not set up Django: {e}")
    DJANGO_AVAILABLE = False

def fix_migration_conflict():
    """Fix the migration conflict by analyzing and creating necessary merge migration"""
    
    migrations_dir = os.path.join(os.path.dirname(__file__), 'myappLubd', 'migrations')
    
    # List all migration files
    migration_files = []
    for filename in sorted(os.listdir(migrations_dir)):
        if filename.endswith('.py') and filename != '__init__.py':
            migration_files.append(filename[:-3])  # Remove .py extension
    
    print("Current migration files:")
    for mf in migration_files:
        print(f"  - {mf}")
    
    # Check if the problematic merge migration exists
    problematic_migration = '0021_merge_20250909_0901'
    if problematic_migration not in migration_files:
        print(f"\nThe problematic migration '{problematic_migration}' does not exist.")
        print("\nPossible solutions:")
        print("1. The migration might be recorded in the database but the file is missing.")
        print("2. Django might be trying to create this merge migration due to conflicting branches.")
        
        # Check for potential conflicts
        print("\nChecking for potential conflicts...")
        
        # Look for migrations with the same number prefix
        prefix_021_migrations = [m for m in migration_files if m.startswith('0021_')]
        if len(prefix_021_migrations) > 0:
            print(f"\nFound existing migrations with prefix 0021: {prefix_021_migrations}")
            print("This might be causing Django to try to create a merge migration.")
        
        # Create the merge migration if needed
        print("\nCreating an empty merge migration to resolve the conflict...")
        
        merge_content = '''# Auto-generated merge migration to resolve conflict
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('myappLubd', '0020_alter_job_created_at_alter_job_updated_at'),
        ('myappLubd', '0021_add_performance_indexes'),
    ]

    operations = [
        # Empty merge migration to resolve branch conflict
    ]
'''
        
        merge_file_path = os.path.join(migrations_dir, f'{problematic_migration}.py')
        
        try:
            with open(merge_file_path, 'w') as f:
                f.write(merge_content)
            print(f"\nCreated merge migration: {merge_file_path}")
            print("\nThe migration conflict should now be resolved.")
            print("Try running 'python manage.py makemigrations' again.")
        except Exception as e:
            print(f"\nError creating merge migration: {e}")
            
    else:
        print(f"\nThe migration '{problematic_migration}' already exists.")

    # If Django is available, try to get more info
    if DJANGO_AVAILABLE:
        try:
            from django.db import connection
            from django.db.migrations.recorder import MigrationRecorder
            
            recorder = MigrationRecorder(connection)
            applied_migrations = recorder.applied_migrations()
            
            app_migrations = [m for app, m in applied_migrations if app == 'myappLubd']
            
            print("\n\nApplied migrations in database:")
            for m in sorted(app_migrations):
                print(f"  - {m}")
                
            # Check for migrations in DB but not on disk
            db_only = set(app_migrations) - set(migration_files)
            if db_only:
                print("\n\nMigrations in database but NOT on disk (this is the problem!):")
                for m in sorted(db_only):
                    print(f"  - {m}")
                    
        except Exception as e:
            print(f"\n\nCould not check database state: {e}")

if __name__ == '__main__':
    fix_migration_conflict()