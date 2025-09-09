# Gmail API Setup Guide

This guide will walk you through setting up Gmail API for your Django application to send emails.

## Prerequisites

- A Google account (Gmail or Google Workspace)
- Access to Google Cloud Console
- Python environment with the required packages installed

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown and select "New Project"
3. Give your project a name (e.g., "MyLubd Email Service")
4. Click "Create"

## Step 2: Enable Gmail API

1. In the Google Cloud Console, navigate to "APIs & Services" > "Library"
2. Search for "Gmail API"
3. Click on "Gmail API" from the results
4. Click "Enable"

## Step 3: Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" if you want to allow any Google account, or "Internal" for Google Workspace only
3. Fill in the required fields:
   - App name: Your application name
   - User support email: Your email
   - Developer contact information: Your email
4. Click "Save and Continue"
5. On the Scopes page, click "Add or Remove Scopes"
6. Search for and select: `https://www.googleapis.com/auth/gmail.send`
7. Click "Update" and then "Save and Continue"
8. Add test users if in testing mode (your email address)
9. Review and click "Back to Dashboard"

## Step 4: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Desktop app" as the application type
4. Give it a name (e.g., "MyLubd Gmail Client")
5. Click "Create"
6. Click "Download JSON" to download the credentials file
7. Save this file as `gmail_credentials.json`

## Step 5: Set Up Gmail API in Your Application

### Option A: Using the Setup Script (Recommended for local development)

1. Copy the `gmail_credentials.json` file to your backend directory:
   ```bash
   cp ~/Downloads/gmail_credentials.json /workspace/backend/myLubd/
   ```

2. Run the setup script:
   ```bash
   cd /workspace/backend/myLubd
   python setup_gmail_api.py
   ```

3. Follow the prompts:
   - A browser window will open
   - Log in with the Gmail account you want to use for sending emails
   - Grant the requested permissions
   - The script will display your credentials

### Option B: Using Django Management Command

1. Copy the credentials file to your Django project:
   ```bash
   cp ~/Downloads/gmail_credentials.json /workspace/backend/myLubd/src/
   ```

2. Run the management command:
   ```bash
   cd /workspace/backend/myLubd/src
   python manage.py setup_gmail_api --test-email your-email@example.com
   ```

3. Follow the authentication flow in your browser

## Step 6: Configure Environment Variables

Add the following to your `.env` file:

```env
# Gmail API Configuration
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REFRESH_TOKEN=your_refresh_token_here

# Optional: Set your default from email
DEFAULT_FROM_EMAIL=no-reply@yourdomain.com
SERVER_EMAIL=no-reply@yourdomain.com
```

## Step 7: Test the Configuration

### Using Django Management Command:
```bash
docker compose exec backend python manage.py send_test_email recipient@example.com --subject "Test" --body "Gmail API is working!"
```

### Using Django Shell:
```python
from myappLubd.email_utils import send_email

success = send_email(
    to_email="recipient@example.com",
    subject="Test Email",
    body="This is a test email sent via Gmail API!"
)
print(f"Email sent: {success}")
```

## Security Best Practices

1. **Never commit credentials to version control**
   - Add `gmail_credentials.json` to `.gitignore`
   - Keep `.env` file private

2. **Use environment variables**
   - Store all sensitive data in environment variables
   - Use `.env.example` as a template without actual values

3. **Limit API scope**
   - Only request the minimum necessary scope (`gmail.send`)

4. **Rotate credentials regularly**
   - Periodically regenerate your refresh token
   - Update credentials if compromised

## Troubleshooting

### Common Issues:

1. **"Gmail API has not been used in project..."**
   - Solution: Enable Gmail API in Google Cloud Console

2. **"Access blocked: Authorization Error"**
   - Solution: Complete OAuth consent screen configuration
   - Add your email as a test user if in testing mode

3. **"Invalid client"**
   - Solution: Ensure you're using Desktop app type credentials
   - Check that client ID and secret match

4. **"Refresh token not found"**
   - Solution: Complete the OAuth flow to obtain a refresh token
   - Ensure you granted the correct permissions

5. **Rate limiting**
   - Gmail API has quotas (250 quota units per user per second)
   - Implement retry logic for production use

### Debug Mode:

To see detailed logs, set Django logging level:

```python
# In settings.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'myappLubd.email_utils': {
            'handlers': ['console'],
            'level': 'DEBUG',
        },
    },
}
```

## Production Considerations

1. **Service Account** (for server applications):
   - Consider using a service account instead of OAuth for production
   - Service accounts don't require interactive authentication

2. **Email Quotas**:
   - Gmail API: 1,000,000,000 quota units per day
   - Each send operation costs 100 quota units
   - Monitor your usage in Google Cloud Console

3. **Error Handling**:
   - Implement retry logic for temporary failures
   - Log failed email attempts for monitoring
   - Consider a fallback SMTP configuration

4. **Domain Verification**:
   - Verify your sending domain for better deliverability
   - Set up SPF, DKIM, and DMARC records

## Additional Resources

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Gmail API Python Quickstart](https://developers.google.com/gmail/api/quickstart/python)
- [Gmail API Quotas](https://developers.google.com/gmail/api/reference/quota)