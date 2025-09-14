#!/usr/bin/env python3
"""
Script to fix fixture loading issues by creating a clean database state
and loading only the essential data without conflicts.
"""

import json
import os
import sys
from pathlib import Path

def clean_fixture_file(input_file, output_file):
    """Clean a fixture file by removing problematic records"""
    print(f"Cleaning {input_file} -> {output_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        cleaned_data = []
        skipped_count = 0
        
        for item in data:
            if isinstance(item, dict) and 'model' in item:
                model_name = item['model']
                
                # Skip problematic models
                if model_name in [
                    'contenttypes.contenttype',
                    'admin.logentry',
                    'auth.permission',
                    'auth.group',
                    'sessions.session',
                    'django_migrations.migration'
                ]:
                    skipped_count += 1
                    continue
                
                # Convert auth.user to myappLubd.user
                if model_name == 'auth.user':
                    item['model'] = 'myappLubd.user'
                
                # Remove invalid fields for Job model
                if model_name == 'myappLubd.job' and 'fields' in item:
                    fields = item['fields']
                    # Remove fields that don't exist in current model
                    invalid_fields = ['images', 'title']  # Add other invalid fields as needed
                    for field in invalid_fields:
                        if field in fields:
                            del fields[field]
                            print(f"  Removed invalid field '{field}' from job record")
                
                # Skip UserProfile records that might cause foreign key conflicts
                if model_name == 'myappLubd.userprofile':
                    print(f"  Skipping UserProfile record (pk={item.get('pk', 'unknown')}) to avoid foreign key conflicts")
                    skipped_count += 1
                    continue
                
                cleaned_data.append(item)
        
        # Write the cleaned data
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(cleaned_data, f, indent=2, ensure_ascii=False)
        
        print(f"  Cleaned {len(cleaned_data)} records, skipped {skipped_count} problematic records")
        return True
        
    except Exception as e:
        print(f"  Error cleaning {input_file}: {e}")
        return False

def main():
    """Main function to clean fixture files"""
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    backend_src = project_root / "backend" / "myLubd" / "src"
    
    if not backend_src.exists():
        print(f"Backend source directory not found: {backend_src}")
        sys.exit(1)
    
    # Clean backup_3.json specifically
    input_file = backend_src / "backup_3.json"
    output_file = backend_src / "backup_3_clean.json"
    
    if not input_file.exists():
        print(f"Input file not found: {input_file}")
        sys.exit(1)
    
    if clean_fixture_file(input_file, output_file):
        print(f"\n✅ Cleaned fixture created: {output_file}")
        print("You can now load it with:")
        print("  docker-compose -f docker-compose.dev.yml exec backend python manage.py loaddata backup_3_clean.json")
    else:
        print("❌ Failed to clean fixture file")
        sys.exit(1)

if __name__ == "__main__":
    main()
