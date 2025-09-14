#!/usr/bin/env python3
"""
Script to fix common Django fixture deserialization errors
"""

import json
import sys
import os
from datetime import datetime

def fix_fixture_file(input_file, output_file):
    """Fix common issues in Django fixture files"""
    
    print(f"Reading fixture file: {input_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        return False
    except Exception as e:
        print(f"Error reading file: {e}")
        return False
    
    print(f"Loaded {len(data)} objects from fixture")
    
    fixed_count = 0
    removed_count = 0
    
    # Common fixes
    for i, obj in enumerate(data):
        try:
            # Fix 1: Remove invalid foreign key references
            if 'fields' in obj:
                fields = obj['fields']
                
                # Fix 2: Handle None values in foreign keys
                for field_name, field_value in fields.items():
                    if field_value is None and field_name.endswith('_id'):
                        # Set to None or remove the field
                        fields[field_name] = None
                        fixed_count += 1
                
                # Fix 3: Fix datetime format issues
                for field_name, field_value in fields.items():
                    if isinstance(field_value, str) and 'T' in field_value and 'Z' in field_value:
                        try:
                            # Try to parse and reformat datetime
                            dt = datetime.fromisoformat(field_value.replace('Z', '+00:00'))
                            fields[field_name] = dt.isoformat()
                            fixed_count += 1
                        except:
                            pass
                
                # Fix 4: Fix content_type references
                if obj.get('model') == 'admin.logentry' and 'content_type' in fields:
                    content_type = fields['content_type']
                    if not isinstance(content_type, int) or content_type <= 0:
                        # Remove invalid log entries
                        data[i] = None
                        removed_count += 1
                        continue
                
                # Fix 5: Fix user references
                if 'user' in fields:
                    user_id = fields['user']
                    if not isinstance(user_id, int) or user_id <= 0:
                        fields['user'] = 1  # Default to admin user
                        fixed_count += 1
                
                # Fix 6: Fix object_id format
                if 'object_id' in fields:
                    obj_id = fields['object_id']
                    if isinstance(obj_id, str) and not obj_id.isdigit():
                        # Convert string IDs to integers where possible
                        try:
                            fields['object_id'] = int(obj_id)
                            fixed_count += 1
                        except ValueError:
                            pass
                
                # Fix 7: Remove empty or invalid change_message
                if 'change_message' in fields:
                    change_msg = fields['change_message']
                    if not change_msg or change_msg == '[]' or change_msg == '{}':
                        fields['change_message'] = '[{"added": {}}]'
                        fixed_count += 1
                
                # Fix 8: Fix action_flag values
                if 'action_flag' in fields:
                    action_flag = fields['action_flag']
                    if not isinstance(action_flag, int) or action_flag not in [1, 2, 3]:
                        fields['action_flag'] = 1  # ADDITION
                        fixed_count += 1
                
                # Fix 9: Fix action_time format
                if 'action_time' in fields:
                    action_time = fields['action_time']
                    if isinstance(action_time, str):
                        try:
                            # Parse and reformat action_time
                            dt = datetime.fromisoformat(action_time.replace('Z', '+00:00'))
                            fields['action_time'] = dt.isoformat()
                            fixed_count += 1
                        except:
                            # Set to current time if parsing fails
                            fields['action_time'] = datetime.now().isoformat()
                            fixed_count += 1
                
        except Exception as e:
            print(f"Error processing object {i}: {e}")
            # Remove problematic objects
            data[i] = None
            removed_count += 1
    
    # Remove None objects
    data = [obj for obj in data if obj is not None]
    
    print(f"Fixed {fixed_count} issues, removed {removed_count} invalid objects")
    print(f"Final object count: {len(data)}")
    
    # Write fixed data
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Fixed fixture saved to: {output_file}")
        return True
    except Exception as e:
        print(f"Error writing fixed file: {e}")
        return False

def create_minimal_fixture(input_file, output_file):
    """Create a minimal fixture with only essential data"""
    
    print(f"Creating minimal fixture from: {input_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading file: {e}")
        return False
    
    # Keep only essential models
    essential_models = [
        'auth.user',
        'auth.group',
        'contenttypes.contenttype',
        'myappLubd.property',
        'myappLubd.room',
        'myappLubd.topic',
        'myappLubd.job',
        'myappLubd.jobimage',
        'myappLubd.profile'
    ]
    
    minimal_data = []
    for obj in data:
        if obj.get('model') in essential_models:
            # Clean up the object
            if 'fields' in obj:
                # Remove problematic fields
                fields = obj['fields']
                for field in ['last_login', 'date_joined', 'password']:
                    if field in fields:
                        del fields[field]
                
                # Fix foreign key references
                for field_name, field_value in fields.items():
                    if field_name.endswith('_id') and (field_value is None or field_value == ''):
                        fields[field_name] = None
                
            minimal_data.append(obj)
    
    print(f"Minimal fixture contains {len(minimal_data)} objects")
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(minimal_data, f, indent=2, ensure_ascii=False)
        print(f"Minimal fixture saved to: {output_file}")
        return True
    except Exception as e:
        print(f"Error writing minimal file: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python fix_fixture_errors.py <input_file> [output_file]")
        print("       python fix_fixture_errors.py <input_file> --minimal [output_file]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    minimal_mode = '--minimal' in sys.argv
    
    if not os.path.exists(input_file):
        print(f"File not found: {input_file}")
        sys.exit(1)
    
    if minimal_mode:
        output_file = sys.argv[-1] if len(sys.argv) > 3 else input_file.replace('.json', '_minimal.json')
        success = create_minimal_fixture(input_file, output_file)
    else:
        output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.json', '_fixed.json')
        success = fix_fixture_file(input_file, output_file)
    
    if success:
        print("✅ Fixture fixing completed successfully!")
        print(f"Use the fixed file: {output_file}")
    else:
        print("❌ Fixture fixing failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
