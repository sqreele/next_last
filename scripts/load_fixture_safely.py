#!/usr/bin/env python3
"""
Safe fixture loading script that handles common Django fixture issues
"""

import os
import sys
import django
from pathlib import Path

# Add the Django project to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / 'backend' / 'myLubd' / 'src'))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import transaction
import json

def load_fixture_safely(fixture_path, app_name='myappLubd'):
    """Load fixture with error handling and rollback"""
    
    print(f"Loading fixture: {fixture_path}")
    
    if not os.path.exists(fixture_path):
        print(f"❌ Fixture file not found: {fixture_path}")
        return False
    
    try:
        # Try to load the fixture
        with transaction.atomic():
            call_command('loaddata', fixture_path, verbosity=2)
        print("✅ Fixture loaded successfully!")
        return True
        
    except CommandError as e:
        print(f"❌ Command error: {e}")
        return False
        
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def validate_fixture(fixture_path):
    """Validate fixture file before loading"""
    
    print(f"Validating fixture: {fixture_path}")
    
    try:
        with open(fixture_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not isinstance(data, list):
            print("❌ Fixture must be a JSON array")
            return False
        
        print(f"✅ Fixture contains {len(data)} objects")
        
        # Check for common issues
        issues = []
        for i, obj in enumerate(data):
            if not isinstance(obj, dict):
                issues.append(f"Object {i} is not a dictionary")
                continue
            
            if 'model' not in obj:
                issues.append(f"Object {i} missing 'model' field")
                continue
            
            if 'pk' not in obj:
                issues.append(f"Object {i} missing 'pk' field")
                continue
            
            if 'fields' not in obj:
                issues.append(f"Object {i} missing 'fields' field")
                continue
        
        if issues:
            print(f"⚠️  Found {len(issues)} issues:")
            for issue in issues[:10]:  # Show first 10 issues
                print(f"  - {issue}")
            if len(issues) > 10:
                print(f"  ... and {len(issues) - 10} more issues")
            return False
        
        print("✅ Fixture validation passed")
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        return False
    except Exception as e:
        print(f"❌ Validation error: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python load_fixture_safely.py <fixture_file>")
        sys.exit(1)
    
    fixture_path = sys.argv[1]
    
    # Validate fixture first
    if not validate_fixture(fixture_path):
        print("❌ Fixture validation failed. Please fix the fixture file first.")
        sys.exit(1)
    
    # Load fixture
    if load_fixture_safely(fixture_path):
        print("🎉 Fixture loading completed successfully!")
    else:
        print("💥 Fixture loading failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
