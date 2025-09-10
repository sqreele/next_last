#!/usr/bin/env python3
"""
Gmail API Setup Script

This script helps you set up Gmail API for your application by:
1. Guiding you through the OAuth2 flow
2. Obtaining a refresh token
3. Displaying the necessary environment variables

Prerequisites:
- You need to have created a Google Cloud Project
- Enable Gmail API in the project
- Create OAuth 2.0 Client ID credentials (Desktop type)
"""

import os
import sys
import json
from pathlib import Path

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials
except ImportError:
    print("Error: Google auth libraries not installed.")
    print("Please run: pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client")
    sys.exit(1)

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


def main():
    print("=" * 60)
    print("Gmail API Setup for Django Application")
    print("=" * 60)
    print()
    
    print("This script will help you set up Gmail API authentication.")
    print("You will need:")
    print("1. A Google Cloud Project with Gmail API enabled")
    print("2. OAuth 2.0 Client ID credentials (Desktop type)")
    print()
    
    # Check if credentials file exists
    creds_file = Path("gmail_credentials.json")
    if creds_file.exists():
        print(f"Found credentials file: {creds_file}")
        use_existing = input("Use this file? (y/n): ").lower().strip() == 'y'
        if not use_existing:
            creds_file = None
    else:
        creds_file = None
    
    if not creds_file:
        print("\nPlease download your OAuth 2.0 credentials from Google Cloud Console:")
        print("1. Go to https://console.cloud.google.com/apis/credentials")
        print("2. Select your project")
        print("3. Click on your OAuth 2.0 Client ID")
        print("4. Click 'DOWNLOAD JSON'")
        print("5. Save the file as 'gmail_credentials.json' in this directory")
        print()
        input("Press Enter when you have saved the credentials file...")
        
        if not Path("gmail_credentials.json").exists():
            print("Error: gmail_credentials.json not found!")
            sys.exit(1)
        creds_file = Path("gmail_credentials.json")
    
    # Load credentials
    try:
        with open(creds_file, 'r') as f:
            client_config = json.load(f)
    except Exception as e:
        print(f"Error loading credentials: {e}")
        sys.exit(1)
    
    # Extract client ID and secret
    if 'installed' in client_config:
        client_id = client_config['installed']['client_id']
        client_secret = client_config['installed']['client_secret']
    elif 'web' in client_config:
        client_id = client_config['web']['client_id']
        client_secret = client_config['web']['client_secret']
    else:
        print("Error: Invalid credentials format")
        sys.exit(1)
    
    print(f"\nClient ID: {client_id[:30]}...")
    print(f"Client Secret: {client_secret[:10]}...")
    
    print("\nStarting OAuth2 flow...")
    print("A browser window will open for authentication.")
    print("Please log in with the Gmail account you want to use for sending emails.")
    print()
    
    try:
        # Run the OAuth flow
        flow = InstalledAppFlow.from_client_secrets_file(
            str(creds_file), SCOPES
        )
        creds = flow.run_local_server(port=0)
        
        print("\nAuthentication successful!")
        print("\nYour refresh token is:")
        print(f"{creds.refresh_token}")
        
        # Generate .env content
        print("\n" + "=" * 60)
        print("Add these environment variables to your .env file:")
        print("=" * 60)
        print(f"GMAIL_CLIENT_ID={client_id}")
        print(f"GMAIL_CLIENT_SECRET={client_secret}")
        print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
        print("=" * 60)
        
        # Optionally save to .env.example
        save_example = input("\nCreate .env.example file with these variables? (y/n): ").lower().strip() == 'y'
        if save_example:
            env_example_path = Path("/workspace/.env.example")
            with open(env_example_path, 'a') as f:
                f.write("\n# Gmail API Configuration\n")
                f.write("GMAIL_CLIENT_ID=your_client_id_here\n")
                f.write("GMAIL_CLIENT_SECRET=your_client_secret_here\n")
                f.write("GMAIL_REFRESH_TOKEN=your_refresh_token_here\n")
            print(f"\nCreated {env_example_path}")
        
        print("\nSetup complete! Your application can now send emails using Gmail API.")
        print("\nIMPORTANT: Keep your credentials secure and never commit them to version control!")
        
    except Exception as e:
        print(f"\nError during authentication: {e}")
        print("\nTroubleshooting tips:")
        print("1. Make sure Gmail API is enabled in your Google Cloud Project")
        print("2. Ensure the OAuth consent screen is configured")
        print("3. Check that your credentials are for 'Desktop' application type")
        sys.exit(1)


if __name__ == "__main__":
    main()