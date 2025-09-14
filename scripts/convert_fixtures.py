#!/usr/bin/env python3
"""
Script to convert Django fixture files from auth.User to myappLubd.User
This fixes the issue where fixtures reference auth_user table that doesn't exist
because the project uses a custom user model.
"""

import json
import os
import sys
from pathlib import Path

def convert_fixture_file(input_file, output_file):
    """Convert a single fixture file from auth.User to myappLubd.User"""
    print(f"Converting {input_file} -> {output_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        converted_count = 0
        
        for item in data:
            if isinstance(item, dict) and 'model' in item:
                # Convert auth.user to myappLubd.user
                if item['model'] == 'auth.user':
                    item['model'] = 'myappLubd.user'
                    converted_count += 1
                    print(f"  Converted auth.user to myappLubd.user (pk={item.get('pk', 'unknown')})")
                
                # Also check for any references to auth.user in foreign key fields
                if 'fields' in item:
                    fields = item['fields']
                    # Check common foreign key fields that might reference auth.user
                    for field_name in ['user', 'created_by', 'updated_by', 'author']:
                        if field_name in fields and isinstance(fields[field_name], int):
                            # This is a foreign key reference - we'll keep the same ID
                            # since we're converting the user model itself
                            pass
        
        # Write the converted data
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"  Converted {converted_count} user records")
        return True
        
    except Exception as e:
        print(f"  Error converting {input_file}: {e}")
        return False

def main():
    """Main function to convert all fixture files"""
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    backend_src = project_root / "backend" / "myLubd" / "src"
    
    if not backend_src.exists():
        print(f"Backend source directory not found: {backend_src}")
        sys.exit(1)
    
    # Find all backup fixture files
    fixture_files = list(backend_src.glob("backup*.json"))
    
    if not fixture_files:
        print("No backup fixture files found")
        sys.exit(1)
    
    print(f"Found {len(fixture_files)} fixture files to convert:")
    for f in fixture_files:
        print(f"  - {f.name}")
    
    # Create backup directory
    backup_dir = backend_src / "fixture_backups"
    backup_dir.mkdir(exist_ok=True)
    
    # Convert each file
    success_count = 0
    for fixture_file in fixture_files:
        # Create backup of original
        backup_file = backup_dir / f"{fixture_file.stem}_original.json"
        if not backup_file.exists():
            import shutil
            shutil.copy2(fixture_file, backup_file)
            print(f"  Backed up original to {backup_file}")
        
        # Convert the file
        if convert_fixture_file(fixture_file, fixture_file):
            success_count += 1
    
    print(f"\nConversion complete: {success_count}/{len(fixture_files)} files converted successfully")
    
    if success_count > 0:
        print("\nYou can now try loading the fixtures:")
        print("  docker-compose -f docker-compose.dev.yml exec backend python manage.py loaddata backup_defalt.json")

if __name__ == "__main__":
    main()
