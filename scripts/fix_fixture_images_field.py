#!/usr/bin/env python3
"""
Fix fixture file by removing the invalid 'images' field from Job model data.
The Job model doesn't have an 'images' field - it has a reverse relationship 'job_images'.
"""

import json
import sys
import os

def fix_fixture_file(input_file, output_file):
    """Fix the fixture file by removing invalid 'images' fields from Job model data."""
    
    print(f"Reading fixture file: {input_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File {input_file} not found")
        return False
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {input_file}: {e}")
        return False
    
    print(f"Loaded {len(data)} objects from fixture")
    
    # Count how many Job objects we'll fix
    job_count = 0
    fixed_count = 0
    
    for obj in data:
        if obj.get('model') == 'myappLubd.job':
            job_count += 1
            if 'images' in obj.get('fields', {}):
                del obj['fields']['images']
                fixed_count += 1
    
    print(f"Found {job_count} Job objects, fixed {fixed_count} objects with 'images' field")
    
    # Write the fixed data
    print(f"Writing fixed fixture to: {output_file}")
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("✅ Successfully fixed fixture file")
        return True
    except Exception as e:
        print(f"Error writing fixed fixture: {e}")
        return False

def main():
    if len(sys.argv) != 3:
        print("Usage: python fix_fixture_images_field.py <input_file> <output_file>")
        print("Example: python fix_fixture_images_field.py backup_3.json backup_3_fixed.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    if not os.path.exists(input_file):
        print(f"Error: Input file {input_file} does not exist")
        sys.exit(1)
    
    success = fix_fixture_file(input_file, output_file)
    
    if success:
        print(f"\n🎉 Fixed fixture file created: {output_file}")
        print("You can now use this fixed file with: python manage.py loaddata backup_3_fixed.json")
    else:
        print("\n❌ Failed to fix fixture file")
        sys.exit(1)

if __name__ == "__main__":
    main()
