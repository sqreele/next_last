"""
Django management command to set up Gmail API authentication.

Usage:
    python manage.py setup_gmail_api

This command guides you through the Gmail API setup process and helps you
obtain the necessary credentials and refresh token.
"""

import json
import os
import sys
from pathlib import Path

from django.core.management.base import BaseCommand
from django.conf import settings

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials
except ImportError:
    print("Error: Google auth libraries not installed.")
    print("Please ensure google-auth, google-auth-oauthlib, and google-api-python-client are in requirements.txt")
    sys.exit(1)


class Command(BaseCommand):
    help = 'Set up Gmail API authentication for sending emails'
    
    SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--credentials-file',
            type=str,
            help='Path to the OAuth2 credentials JSON file downloaded from Google Cloud Console',
            default='gmail_credentials.json'
        )
        parser.add_argument(
            '--test-email',
            type=str,
            help='Email address to send a test message to after setup',
        )
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Gmail API Setup for Django Application"))
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write("")
        
        # Check if already configured
        if all([
            os.getenv('GMAIL_CLIENT_ID'),
            os.getenv('GMAIL_CLIENT_SECRET'),
            os.getenv('GMAIL_REFRESH_TOKEN')
        ]):
            self.stdout.write(self.style.WARNING("Gmail API appears to be already configured."))
            proceed = input("Do you want to reconfigure? (y/n): ").lower().strip() == 'y'
            if not proceed:
                return
        
        self.stdout.write("This command will help you set up Gmail API authentication.")
        self.stdout.write("You will need:")
        self.stdout.write("1. A Google Cloud Project with Gmail API enabled")
        self.stdout.write("2. OAuth 2.0 Client ID credentials (Desktop type)")
        self.stdout.write("")
        
        # Check for credentials file
        creds_file = Path(options['credentials_file'])
        if not creds_file.exists():
            self.stdout.write(self.style.ERROR(f"Credentials file not found: {creds_file}"))
            self.stdout.write("")
            self.stdout.write("Please download your OAuth 2.0 credentials:")
            self.stdout.write("1. Go to https://console.cloud.google.com/apis/credentials")
            self.stdout.write("2. Select your project")
            self.stdout.write("3. Create or click on your OAuth 2.0 Client ID (Desktop type)")
            self.stdout.write("4. Click 'DOWNLOAD JSON'")
            self.stdout.write(f"5. Save the file as '{creds_file}' in the current directory")
            return
        
        # Load credentials
        try:
            with open(creds_file, 'r') as f:
                client_config = json.load(f)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error loading credentials: {e}"))
            return
        
        # Extract client ID and secret
        if 'installed' in client_config:
            client_id = client_config['installed']['client_id']
            client_secret = client_config['installed']['client_secret']
        elif 'web' in client_config:
            self.stdout.write(self.style.WARNING("Note: Using 'web' credentials. 'Desktop' type is recommended."))
            client_id = client_config['web']['client_id']
            client_secret = client_config['web']['client_secret']
        else:
            self.stdout.write(self.style.ERROR("Invalid credentials format"))
            return
        
        self.stdout.write(f"\nClient ID: {client_id[:30]}...")
        self.stdout.write(f"Client Secret: {client_secret[:10]}...")
        
        self.stdout.write("\nStarting OAuth2 flow...")
        self.stdout.write("A browser window will open for authentication.")
        self.stdout.write("Please log in with the Gmail account you want to use for sending emails.")
        self.stdout.write("")
        
        try:
            # Run the OAuth flow
            flow = InstalledAppFlow.from_client_secrets_file(
                str(creds_file), self.SCOPES
            )
            creds = flow.run_local_server(port=0)
            
            self.stdout.write(self.style.SUCCESS("\nAuthentication successful!"))
            
            # Display the credentials
            self.stdout.write("\n" + "=" * 60)
            self.stdout.write(self.style.SUCCESS("Add these to your .env file:"))
            self.stdout.write("=" * 60)
            self.stdout.write(f"GMAIL_CLIENT_ID={client_id}")
            self.stdout.write(f"GMAIL_CLIENT_SECRET={client_secret}")
            self.stdout.write(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
            self.stdout.write("=" * 60)
            
            # Update .env file if it exists
            env_file = Path('.env')
            if env_file.exists():
                update_env = input("\nUpdate .env file with these values? (y/n): ").lower().strip() == 'y'
                if update_env:
                    self._update_env_file(env_file, client_id, client_secret, creds.refresh_token)
                    self.stdout.write(self.style.SUCCESS("Updated .env file!"))
            
            # Test email
            if options['test_email']:
                self.stdout.write("\nSending test email...")
                if self._send_test_email(options['test_email'], client_id, client_secret, creds.refresh_token):
                    self.stdout.write(self.style.SUCCESS(f"Test email sent to {options['test_email']}!"))
                else:
                    self.stdout.write(self.style.ERROR("Failed to send test email"))
            
            self.stdout.write(self.style.SUCCESS("\nSetup complete! Your application can now send emails using Gmail API."))
            self.stdout.write(self.style.WARNING("\nIMPORTANT: Keep your credentials secure and never commit them to version control!"))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"\nError during authentication: {e}"))
            self.stdout.write("\nTroubleshooting tips:")
            self.stdout.write("1. Make sure Gmail API is enabled in your Google Cloud Project")
            self.stdout.write("2. Ensure the OAuth consent screen is configured")
            self.stdout.write("3. Check that your credentials are for 'Desktop' application type")
            self.stdout.write("4. If using a Google Workspace account, ensure API access is allowed")
    
    def _update_env_file(self, env_file, client_id, client_secret, refresh_token):
        """Update .env file with Gmail API credentials."""
        lines = []
        with open(env_file, 'r') as f:
            lines = f.readlines()
        
        # Update or add Gmail API settings
        gmail_vars = {
            'GMAIL_CLIENT_ID': client_id,
            'GMAIL_CLIENT_SECRET': client_secret,
            'GMAIL_REFRESH_TOKEN': refresh_token
        }
        
        # Check if variables exist and update them
        updated = {key: False for key in gmail_vars}
        new_lines = []
        
        for line in lines:
            updated_line = line
            for key, value in gmail_vars.items():
                if line.startswith(f'{key}='):
                    updated_line = f'{key}={value}\n'
                    updated[key] = True
                    break
            new_lines.append(updated_line)
        
        # Add any missing variables
        for key, value in gmail_vars.items():
            if not updated[key]:
                new_lines.append(f'{key}={value}\n')
        
        # Write back to file
        with open(env_file, 'w') as f:
            f.writelines(new_lines)
    
    def _send_test_email(self, to_email, client_id, client_secret, refresh_token):
        """Send a test email using the provided credentials."""
        # Temporarily set environment variables
        old_env = {}
        for key, value in [
            ('GMAIL_CLIENT_ID', client_id),
            ('GMAIL_CLIENT_SECRET', client_secret),
            ('GMAIL_REFRESH_TOKEN', refresh_token)
        ]:
            old_env[key] = os.environ.get(key)
            os.environ[key] = value
        
        try:
            from myappLubd.email_utils import send_email
            result = send_email(
                to_email=to_email,
                subject="Gmail API Test - Setup Successful",
                body="This is a test email from your Django application using Gmail API.\n\nYour Gmail API setup is working correctly!",
                from_email=settings.DEFAULT_FROM_EMAIL
            )
            return result
        finally:
            # Restore environment
            for key, value in old_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value