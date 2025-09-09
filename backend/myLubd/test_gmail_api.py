#!/usr/bin/env python3
"""
Test script for Gmail API integration.

This script tests the Gmail API setup by attempting to:
1. Load credentials from environment variables
2. Build a Gmail service
3. Send a test email

Usage:
    python test_gmail_api.py --to recipient@example.com
"""

import argparse
import os
import sys
from pathlib import Path

# Add the Django project to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
import django
django.setup()

from myappLubd.email_utils import send_email, _build_gmail_service


def test_credentials():
    """Test if Gmail API credentials are properly configured."""
    print("Testing Gmail API Configuration...")
    print("-" * 50)
    
    # Check environment variables
    client_id = os.getenv('GMAIL_CLIENT_ID')
    client_secret = os.getenv('GMAIL_CLIENT_SECRET')
    refresh_token = os.getenv('GMAIL_REFRESH_TOKEN')
    
    print(f"✓ GMAIL_CLIENT_ID: {'Set' if client_id else 'Not set'}")
    print(f"✓ GMAIL_CLIENT_SECRET: {'Set' if client_secret else 'Not set'}")
    print(f"✓ GMAIL_REFRESH_TOKEN: {'Set' if refresh_token else 'Not set'}")
    
    if not all([client_id, client_secret, refresh_token]):
        print("\n❌ Missing required environment variables!")
        print("Please run: python setup_gmail_api.py")
        return False
    
    # Test building Gmail service
    print("\nTesting Gmail service connection...")
    service = _build_gmail_service()
    
    if service:
        print("✓ Successfully connected to Gmail API!")
        return True
    else:
        print("❌ Failed to connect to Gmail API")
        return False


def test_send_email(to_email):
    """Test sending an email via Gmail API."""
    print(f"\nSending test email to {to_email}...")
    
    subject = "Gmail API Test - Integration Working"
    body = """Hello!

This is a test email sent from your Django application using Gmail API.

If you're receiving this, it means your Gmail API integration is working correctly!

Test Details:
- Sent via: Gmail API
- From: Django Application
- Time: {}

Best regards,
Your Django App
""".format(django.utils.timezone.now())
    
    success = send_email(
        to_email=to_email,
        subject=subject,
        body=body
    )
    
    if success:
        print(f"✓ Test email sent successfully to {to_email}!")
        return True
    else:
        print(f"❌ Failed to send test email to {to_email}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Test Gmail API integration')
    parser.add_argument(
        '--to',
        type=str,
        help='Email address to send test email to',
        required=False
    )
    parser.add_argument(
        '--check-only',
        action='store_true',
        help='Only check credentials without sending email'
    )
    
    args = parser.parse_args()
    
    print("Gmail API Integration Test")
    print("=" * 50)
    print()
    
    # Test credentials
    creds_ok = test_credentials()
    
    if not creds_ok:
        sys.exit(1)
    
    # Send test email if requested
    if args.to and not args.check_only:
        email_ok = test_send_email(args.to)
        if not email_ok:
            sys.exit(1)
    elif not args.check_only:
        print("\nTo send a test email, run:")
        print("  python test_gmail_api.py --to your@email.com")
    
    print("\n✓ All tests passed!")


if __name__ == "__main__":
    main()