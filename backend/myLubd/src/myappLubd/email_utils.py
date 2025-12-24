import base64
import logging
import os
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Dict, Any

from django.conf import settings
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

try:
    # Lazy import to avoid hard dependency if not configured yet
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    _GOOGLE_LIBS_AVAILABLE = True
except Exception:
    _GOOGLE_LIBS_AVAILABLE = False


def _build_gmail_service():
    if not _GOOGLE_LIBS_AVAILABLE:
        logger.warning("Google API libraries not available; cannot use Gmail API")
        return None

    client_id = os.getenv('GMAIL_CLIENT_ID')
    client_secret = os.getenv('GMAIL_CLIENT_SECRET')
    refresh_token = os.getenv('GMAIL_REFRESH_TOKEN')

    if not (client_id and client_secret and refresh_token):
        logger.warning("Gmail API environment variables missing; falling back to SMTP")
        return None

    creds = Credentials(
        None,
        refresh_token=refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=client_id,
        client_secret=client_secret,
        scopes=['https://www.googleapis.com/auth/gmail.send'],
    )

    try:
        service = build('gmail', 'v1', credentials=creds, cache_discovery=False)
        return service
    except Exception as e:
        logger.error(f"Failed to build Gmail service: {e}")
        return None


def send_email(to_email: str, subject: str, body: str, from_email: Optional[str] = None, html_body: Optional[str] = None) -> bool:
    """Send an email either via Gmail API (preferred) or SMTP fallback.

    Returns True on success, False otherwise.
    """
    # Try Gmail API first
    service = _build_gmail_service()
    from_addr = from_email or getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@pcms.live')
    # If a placeholder default is in use but SMTP user is configured, prefer that as from address
    if from_addr == 'no-reply@pcms.live':
        _smtp_user = getattr(settings, 'EMAIL_HOST_USER', '')
        if _smtp_user:
            from_addr = _smtp_user

    if service is not None:
        try:
            if html_body:
                container = MIMEMultipart('alternative')
                container['to'] = to_email
                container['from'] = from_addr
                container['subject'] = subject
                # Plain text part first for clients that prefer it
                container.attach(MIMEText(body or '', 'plain', 'utf-8'))
                # HTML part
                container.attach(MIMEText(html_body, 'html', 'utf-8'))
                raw = base64.urlsafe_b64encode(container.as_bytes()).decode()
            else:
                message = MIMEText(body or '', 'plain', 'utf-8')
                message['to'] = to_email
                message['from'] = from_addr
                message['subject'] = subject
                raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

            service.users().messages().send(userId='me', body={'raw': raw}).execute()
            logger.info(f"Email sent via Gmail API to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Gmail API send failed: {e}")
            # Continue to try SMTP fallback

    # SMTP fallback using Django's send_mail
    # Enforce SMTP auth when required to avoid 530 Authentication errors (e.g., Gmail)
    email_host = getattr(settings, 'EMAIL_HOST', '')
    email_user = getattr(settings, 'EMAIL_HOST_USER', '')
    email_password = getattr(settings, 'EMAIL_HOST_PASSWORD', '')
    require_auth = os.getenv('EMAIL_REQUIRE_AUTH', 'True').lower() in ('true', '1', 'yes')

    if require_auth and (not email_user or not email_password):
        logger.error("SMTP auth not configured (set EMAIL_HOST_USER and EMAIL_HOST_PASSWORD).")
        return False
    try:
        from django.core.mail import send_mail
        sent = send_mail(subject, body or '', from_addr, [to_email], fail_silently=False, html_message=html_body)
        if sent:
            logger.info(f"Email sent via SMTP to {to_email}")
            return True
    except Exception as e:
        logger.error(f"SMTP send failed: {e}")

    return False


def send_welcome_email(
    user_email: str,
    username: str,
    properties: List[Dict[str, Any]],
    base_url: Optional[str] = None
) -> bool:
    """
    Send a welcome email to a new user after they complete onboarding.
    
    Args:
        user_email: The user's email address
        username: The user's display name/username
        properties: List of property dicts with 'name' and 'property_id' keys
        base_url: Optional base URL for the application
    
    Returns:
        True if email was sent successfully, False otherwise
    """
    if not user_email:
        logger.warning("Cannot send welcome email: no email address provided")
        return False
    
    # Determine base URL
    if not base_url:
        base_url = os.getenv('APP_BASE_URL', 'https://pcms.live')
    
    dashboard_url = f"{base_url}/dashboard"
    
    # Prepare template context
    context = {
        'username': username or 'User',
        'email': user_email,
        'properties': properties or [],
        'property_count': len(properties) if properties else 0,
        'base_url': base_url,
        'dashboard_url': dashboard_url,
        'year': datetime.now().year,
    }
    
    try:
        # Render HTML template
        html_body = render_to_string('emails/welcome_new_user.html', context)
        
        # Plain text version
        property_names = ', '.join([p.get('name', 'Unknown') for p in properties]) if properties else 'None'
        plain_text = f"""
Welcome to MaintenancePro, {username}!

Your account has been successfully created.

Account Details:
- Email: {user_email}
- Username: {username}
- Properties: {len(properties)} assigned

Assigned Properties:
{property_names}

Getting Started:
1. Log into your dashboard at {dashboard_url}
2. View your assigned maintenance jobs
3. Start managing preventive maintenance

Visit {base_url} to access your dashboard.

Best regards,
The MaintenancePro Team
        """.strip()
        
        subject = "🎉 Welcome to MaintenancePro - Your Account is Ready!"
        
        success = send_email(
            to_email=user_email,
            subject=subject,
            body=plain_text,
            html_body=html_body
        )
        
        if success:
            logger.info(f"Welcome email sent successfully to {user_email}")
        else:
            logger.warning(f"Failed to send welcome email to {user_email}")
        
        return success
        
    except Exception as e:
        logger.error(f"Error sending welcome email to {user_email}: {e}")
        return False


def send_new_user_notification_to_admin(
    new_user_email: str,
    new_username: str,
    properties: List[Dict[str, Any]],
    admin_emails: Optional[List[str]] = None
) -> bool:
    """
    Send notification to admin(s) when a new user completes onboarding.
    
    Args:
        new_user_email: The new user's email address
        new_username: The new user's username
        properties: List of properties the user was assigned to
        admin_emails: Optional list of admin email addresses to notify
    
    Returns:
        True if at least one notification was sent successfully
    """
    if not admin_emails:
        # Get admin emails from environment or settings
        admin_email_str = os.getenv('ADMIN_NOTIFICATION_EMAILS', '')
        if admin_email_str:
            admin_emails = [e.strip() for e in admin_email_str.split(',') if e.strip()]
        else:
            # Try to get from Django User model
            try:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                admin_users = User.objects.filter(is_superuser=True, email__isnull=False).exclude(email='')
                admin_emails = list(admin_users.values_list('email', flat=True))
            except Exception:
                admin_emails = []
    
    if not admin_emails:
        logger.info("No admin emails configured for new user notifications")
        return False
    
    property_names = ', '.join([p.get('name', 'Unknown') for p in properties]) if properties else 'None'
    
    subject = f"🆕 New User Registered: {new_username}"
    
    body = f"""
A new user has completed onboarding on MaintenancePro.

New User Details:
- Username: {new_username}
- Email: {new_user_email}
- Properties Assigned: {len(properties)}
- Property Names: {property_names}

Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

This is an automated notification from MaintenancePro.
    """.strip()
    
    success_count = 0
    for admin_email in admin_emails:
        try:
            if send_email(to_email=admin_email, subject=subject, body=body):
                success_count += 1
        except Exception as e:
            logger.error(f"Failed to send admin notification to {admin_email}: {e}")
    
    logger.info(f"Admin notifications sent: {success_count}/{len(admin_emails)}")
    return success_count > 0