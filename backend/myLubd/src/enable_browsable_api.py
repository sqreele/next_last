#!/usr/bin/env python
"""
Script to ensure Django REST Framework's browsable API is enabled
"""
import os
import sys
import django

# Add the project directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from django.conf import settings

print("Current REST_FRAMEWORK settings:")
print("-" * 50)

rf_settings = getattr(settings, 'REST_FRAMEWORK', {})
for key, value in rf_settings.items():
    print(f"{key}: {value}")

print("\n" + "-" * 50)

# Check if BrowsableAPIRenderer is in the renderer classes
renderer_classes = rf_settings.get('DEFAULT_RENDERER_CLASSES', [])

if renderer_classes:
    if 'rest_framework.renderers.BrowsableAPIRenderer' in renderer_classes:
        print("✅ BrowsableAPIRenderer is already enabled!")
    else:
        print("❌ BrowsableAPIRenderer is NOT in the renderer classes")
        print("\nTo enable it, add this to your settings.py REST_FRAMEWORK configuration:")
        print("""
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
""")
else:
    print("ℹ️  No DEFAULT_RENDERER_CLASSES specified.")
    print("DRF uses default renderers which include BrowsableAPIRenderer.")
    print("The browsable API should be available by default!")

print("\n" + "=" * 50)
print("BROWSABLE API ACCESS:")
print("=" * 50)
print(f"1. Login at: https://pcms.live/api-auth/login/")
print(f"2. Then visit any API endpoint, for example:")
print(f"   - https://pcms.live/api/v1/properties/")
print(f"   - https://pcms.live/api/v1/rooms/")
print(f"   - https://pcms.live/api/v1/jobs/")
print("\nNote: You must be authenticated to see the browsable interface.")