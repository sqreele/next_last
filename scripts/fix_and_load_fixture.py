#!/usr/bin/env python3
"""
Complete solution for fixing and loading Django fixtures
"""

import json
import sys
import os
from datetime import datetime
import subprocess

def fix_common_fixture_issues(input_file, output_file):
    """Fix common Django fixture issues"""
    
    print(f"🔧 Fixing fixture: {input_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return False
    
    print(f"📊 Loaded {len(data)} objects")
    
    fixed_count = 0
    removed_count = 0
    
    for i, obj in enumerate(data):
        if not isinstance(obj, dict):
            data[i] = None
            removed_count += 1
            continue
        
        try:
            if 'fields' in obj:
                fields = obj['fields']
                
                # Fix 1: Remove problematic admin log entries
                if obj.get('model') == 'admin.logentry':
                    # Check for invalid content_type
                    if 'content_type' in fields:
                        content_type = fields['content_type']
                        if not isinstance(content_type, int) or content_type <= 0:
                            data[i] = None
                            removed_count += 1
                            continue
                    
                    # Fix action_time format
                    if 'action_time' in fields:
                        action_time = fields['action_time']
                        if isinstance(action_time, str):
                            try:
                                # Parse and reformat datetime
                                if action_time.endswith('Z'):
                                    action_time = action_time[:-1] + '+00:00'
                                dt = datetime.fromisoformat(action_time)
                                fields['action_time'] = dt.isoformat()
                                fixed_count += 1
                            except:
                                # Set to current time if parsing fails
                                fields['action_time'] = datetime.now().isoformat()
                                fixed_count += 1
                    
                    # Fix action_flag
                    if 'action_flag' in fields:
                        action_flag = fields['action_flag']
                        if not isinstance(action_flag, int) or action_flag not in [1, 2, 3]:
                            fields['action_flag'] = 1
                            fixed_count += 1
                    
                    # Fix object_id
                    if 'object_id' in fields:
                        obj_id = fields['object_id']
                        if isinstance(obj_id, str) and obj_id.isdigit():
                            fields['object_id'] = int(obj_id)
                            fixed_count += 1
                    
                    # Fix change_message
                    if 'change_message' in fields:
                        change_msg = fields['change_message']
                        if not change_msg or change_msg in ['[]', '{}', '']:
                            fields['change_message'] = '[{"added": {}}]'
                            fixed_count += 1
                
                # Fix 2: Handle foreign key references
                for field_name, field_value in fields.items():
                    if field_name.endswith('_id'):
                        if field_value is None or field_value == '':
                            fields[field_name] = None
                            fixed_count += 1
                        elif isinstance(field_value, str) and field_value.isdigit():
                            fields[field_name] = int(field_value)
                            fixed_count += 1
                
                # Fix 3: Fix datetime fields
                datetime_fields = ['created_at', 'updated_at', 'last_login', 'date_joined']
                for field_name in datetime_fields:
                    if field_name in fields:
                        field_value = fields[field_name]
                        if isinstance(field_value, str):
                            try:
                                if field_value.endswith('Z'):
                                    field_value = field_value[:-1] + '+00:00'
                                dt = datetime.fromisoformat(field_value)
                                fields[field_name] = dt.isoformat()
                                fixed_count += 1
                            except:
                                pass
                
                # Fix 4: Remove problematic fields
                problematic_fields = ['password', 'last_login', 'date_joined']
                for field in problematic_fields:
                    if field in fields:
                        del fields[field]
                        fixed_count += 1
                
                # Fix 5: Fix user references
                if 'user' in fields:
                    user_id = fields['user']
                    if not isinstance(user_id, int) or user_id <= 0:
                        fields['user'] = 1  # Default to admin
                        fixed_count += 1
                
        except Exception as e:
            print(f"⚠️  Error processing object {i}: {e}")
            data[i] = None
            removed_count += 1
    
    # Remove None objects
    data = [obj for obj in data if obj is not None]
    
    print(f"✅ Fixed {fixed_count} issues, removed {removed_count} invalid objects")
    print(f"📊 Final object count: {len(data)}")
    
    # Write fixed data
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"💾 Fixed fixture saved to: {output_file}")
        return True
    except Exception as e:
        print(f"❌ Error writing fixed file: {e}")
        return False

def load_fixture_with_docker(fixture_file):
    """Load fixture using Docker"""
    
    print(f"🐳 Loading fixture with Docker: {fixture_file}")
    
    try:
        # Copy fixture to container
        copy_cmd = [
            'docker', 'compose', 'cp', 
            fixture_file, 
            'backend:/app/src/'
        ]
        result = subprocess.run(copy_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"❌ Error copying fixture: {result.stderr}")
            return False
        
        # Load fixture in container
        fixture_name = os.path.basename(fixture_file)
        load_cmd = [
            'docker', 'compose', 'exec', '-T', 'backend',
            'python', 'manage.py', 'loaddata', fixture_name
        ]
        
        result = subprocess.run(load_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Fixture loaded successfully!")
            print(result.stdout)
            return True
        else:
            print(f"❌ Error loading fixture: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Docker error: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage: python fix_and_load_fixture.py <fixture_file>")
        print("       python fix_and_load_fixture.py <fixture_file> --no-fix")
        sys.exit(1)
    
    input_file = sys.argv[1]
    skip_fix = '--no-fix' in sys.argv
    
    if not os.path.exists(input_file):
        print(f"❌ File not found: {input_file}")
        sys.exit(1)
    
    if skip_fix:
        print("⏭️  Skipping fix step, loading directly...")
        success = load_fixture_with_docker(input_file)
    else:
        # Fix the fixture first
        output_file = input_file.replace('.json', '_fixed.json')
        
        if fix_common_fixture_issues(input_file, output_file):
            # Load the fixed fixture
            success = load_fixture_with_docker(output_file)
        else:
            print("❌ Failed to fix fixture")
            sys.exit(1)
    
    if success:
        print("🎉 Fixture loading completed successfully!")
    else:
        print("💥 Fixture loading failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
