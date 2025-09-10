#!/usr/bin/env python
"""Debug script to check Django settings configuration."""
import os
import sys
import django

# Add the source directory to Python path
sys.path.insert(0, '/app/src')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')

# Setup Django
django.setup()

from django.conf import settings

print("=" * 60)
print("Django Settings Debug Information")
print("=" * 60)
print(f"DEBUG: {settings.DEBUG}")
print(f"ALLOWED_HOSTS: {settings.ALLOWED_HOSTS}")
print(f"DJANGO_ALLOWED_HOSTS env var: {os.getenv('DJANGO_ALLOWED_HOSTS')}")
print()
print("Auth0 Configuration:")
print(f"AUTH0_DOMAIN: {settings.AUTH0_DOMAIN}")
print(f"AUTH0_ISSUER: {settings.AUTH0_ISSUER}")
print(f"AUTH0_AUDIENCE: {settings.AUTH0_AUDIENCE}")
print(f"AUTH0_CLIENT_ID: {settings.AUTH0_CLIENT_ID}")
print(f"AUTH0_CLIENT_SECRET: {'***' if settings.AUTH0_CLIENT_SECRET else 'Not Set'}")
print("=" * 60)

# Test if 'backend' is in ALLOWED_HOSTS
if 'backend' in settings.ALLOWED_HOSTS:
    print("✓ 'backend' is in ALLOWED_HOSTS")
else:
    print("✗ 'backend' is NOT in ALLOWED_HOSTS")

if 'backend:8000' in settings.ALLOWED_HOSTS:
    print("✓ 'backend:8000' is in ALLOWED_HOSTS")
else:
    print("✗ 'backend:8000' is NOT in ALLOWED_HOSTS")