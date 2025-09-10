import base64
import logging
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from django.conf import settings

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
    # Determine which transport to use: 'smtp', 'gmail', or 'auto' (default)
    transport = os.getenv('EMAIL_TRANSPORT', 'auto').lower()

    gmail_client_id = os.getenv('GMAIL_CLIENT_ID')
    gmail_client_secret = os.getenv('GMAIL_CLIENT_SECRET')
    gmail_refresh_token = os.getenv('GMAIL_REFRESH_TOKEN')
    gmail_configured = bool(
        _GOOGLE_LIBS_AVAILABLE and gmail_client_id and gmail_client_secret and gmail_refresh_token
    )

    use_gmail = False
    if transport == 'gmail':
        if not gmail_configured:
            logger.warning("EMAIL_TRANSPORT=gmail set but Gmail API not configured; falling back to SMTP")
        else:
            use_gmail = True
    elif transport == 'auto':
        # Auto mode: only use Gmail if everything is configured; otherwise, silently prefer SMTP
        use_gmail = gmail_configured
    # For 'smtp' or any unknown value, default to SMTP without attempting Gmail

    service = _build_gmail_service() if use_gmail else None
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