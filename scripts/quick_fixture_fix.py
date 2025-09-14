#!/usr/bin/env python3
"""
Quick fixture fixer for common Django deserialization errors
"""

import json
import sys
import os
from datetime import datetime

def quick_fix_fixture(input_file):
    """Quick fix for common fixture issues"""
    
    print(f"🔧 Quick fixing: {input_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    fixed = 0
    
    for obj in data:
        if not isinstance(obj, dict) or 'fields' not in obj:
            continue
            
        fields = obj['fields']
        
        # Fix 1: Admin log entries
        if obj.get('model') == 'admin.logentry':
            # Fix content_type
            if 'content_type' in fields and (not isinstance(fields['content_type'], int) or fields['content_type'] <= 0):
                fields['content_type'] = 8  # Default content type
                fixed += 1
            
            # Fix action_flag
            if 'action_flag' in fields and (not isinstance(fields['action_flag'], int) or fields['action_flag'] not in [1, 2, 3]):
                fields['action_flag'] = 1
                fixed += 1
            
            # Fix action_time
            if 'action_time' in fields and isinstance(fields['action_time'], str):
                try:
                    if fields['action_time'].endswith('Z'):
                        fields['action_time'] = fields['action_time'][:-1] + '+00:00'
                    datetime.fromisoformat(fields['action_time'])
                except:
                    fields['action_time'] = datetime.now().isoformat()
                    fixed += 1
            
            # Fix object_id
            if 'object_id' in fields and isinstance(fields['object_id'], str) and fields['object_id'].isdigit():
                fields['object_id'] = int(fields['object_id'])
                fixed += 1
            
            # Fix change_message
            if 'change_message' in fields and not fields['change_message']:
                fields['change_message'] = '[{"added": {}}]'
                fixed += 1
        
        # Fix 2: Foreign keys
        for field_name, field_value in fields.items():
            if field_name.endswith('_id'):
                if field_value is None or field_value == '':
                    fields[field_name] = None
                    fixed += 1
                elif isinstance(field_value, str) and field_value.isdigit():
                    fields[field_name] = int(field_value)
                    fixed += 1
        
        # Fix 3: User references
        if 'user' in fields and (not isinstance(fields['user'], int) or fields['user'] <= 0):
            fields['user'] = 1
            fixed += 1
    
    print(f"✅ Fixed {fixed} issues")
    
    # Save fixed file
    output_file = input_file.replace('.json', '_quick_fixed.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"💾 Saved to: {output_file}")
    return output_file

def main():
    if len(sys.argv) < 2:
        print("Usage: python quick_fixture_fix.py <fixture_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    if not os.path.exists(input_file):
        print(f"❌ File not found: {input_file}")
        sys.exit(1)
    
    fixed_file = quick_fix_fixture(input_file)
    
    if fixed_file:
        print(f"\n🚀 To load the fixed fixture:")
        print(f"   docker compose exec backend python manage.py loaddata {os.path.basename(fixed_file)}")
        print(f"\n   Or copy to container first:")
        print(f"   docker compose cp {fixed_file} backend:/app/src/")
        print(f"   docker compose exec backend python manage.py loaddata {os.path.basename(fixed_file)}")

if __name__ == "__main__":
    main()
