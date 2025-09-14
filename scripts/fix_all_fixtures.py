#!/usr/bin/env python3
"""
Fix all fixture files by removing the invalid 'images' field from Job model data.
This script will process all JSON fixture files in the specified directory.
"""

import json
import sys
import os
import glob
from pathlib import Path

def fix_fixture_file(input_file, output_file):
    """Fix the fixture file by removing invalid 'images' fields from Job model data."""
    
    print(f"Processing: {input_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File {input_file} not found")
        return False
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {input_file}: {e}")
        return False
    
    # Count how many Job objects we'll fix
    job_count = 0
    fixed_count = 0
    
    for obj in data:
        if obj.get('model') == 'myappLubd.job':
            job_count += 1
            if 'images' in obj.get('fields', {}):
                del obj['fields']['images']
                fixed_count += 1
    
    if fixed_count > 0:
        print(f"  Found {job_count} Job objects, fixed {fixed_count} objects with 'images' field")
        
        # Write the fixed data
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"  ✅ Created fixed file: {output_file}")
            return True
        except Exception as e:
            print(f"  Error writing fixed fixture: {e}")
            return False
    else:
        print(f"  No 'images' fields found in {job_count} Job objects - file is already clean")
        return True

def main():
    if len(sys.argv) != 2:
        print("Usage: python fix_all_fixtures.py <directory>")
        print("Example: python fix_all_fixtures.py backend/myLubd/src/")
        sys.exit(1)
    
    directory = sys.argv[1]
    
    if not os.path.exists(directory):
        print(f"Error: Directory {directory} does not exist")
        sys.exit(1)
    
    # Find all JSON files in the directory
    json_files = glob.glob(os.path.join(directory, "*.json"))
    
    if not json_files:
        print(f"No JSON files found in {directory}")
        sys.exit(1)
    
    print(f"Found {len(json_files)} JSON files to process:")
    for file in json_files:
        print(f"  - {os.path.basename(file)}")
    
    print("\nProcessing files...")
    
    success_count = 0
    total_count = len(json_files)
    
    for json_file in json_files:
        filename = os.path.basename(json_file)
        name, ext = os.path.splitext(filename)
        output_file = os.path.join(directory, f"{name}_fixed{ext}")
        
        if fix_fixture_file(json_file, output_file):
            success_count += 1
    
    print(f"\n🎉 Successfully processed {success_count}/{total_count} files")
    
    if success_count == total_count:
        print("All fixture files have been fixed!")
        print("\nYou can now use the fixed files with:")
        print("  python manage.py loaddata <filename>_fixed.json")
    else:
        print(f"⚠️  {total_count - success_count} files had errors")

if __name__ == "__main__":
    main()
