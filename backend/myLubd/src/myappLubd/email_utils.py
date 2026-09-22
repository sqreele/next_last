import logging
import os
import re
from datetime import datetime
from email.utils import parseaddr
from typing import Optional, List, Dict, Any

import requests
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives
from django.core.validators import validate_email
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

MAILERSEND_EMAIL_ENDPOINT = 'https://api.mailersend.com/v1/email'
MAILERSEND_TIMEOUT_SECONDS = 10
MAILERSEND_USER_AGENT = 'StayMaint-Mailer/1.0'
MAILERSEND_ERROR_CODE_PATTERN = re.compile(r'\bMS\d{5}\b')


def normalize_email_addresses(candidates) -> List[str]:
    """Return valid, trimmed email strings, deduplicated case-insensitively."""
    normalized = []
    seen = set()
    for candidate in candidates or []:
        if not isinstance(candidate, str):
            continue
        email = candidate.strip()
        try:
            validate_email(email)
        except ValidationError:
            continue
        key = email.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(email)
    return normalized

def _build_gmail_service():
    """Legacy test seam; Gmail is no longer part of the transport chain."""
    return None


def _safe_provider_value(value, secret: str = '', max_length: int = 300) -> str:
    """Return bounded, single-line provider metadata with credentials redacted."""
    if value is None:
        return 'unavailable'
    rendered = str(value)
    if secret:
        rendered = rendered.replace(secret, '[redacted]')
    rendered = ''.join(char if char.isprintable() else ' ' for char in rendered)
    return ' '.join(rendered.split())[:max_length] or 'unavailable'


def _mailersend_error_metadata(response, api_token: str) -> Dict[str, str]:
    """Extract only safe, bounded fields from a provider or edge error response."""
    data = {}
    try:
        parsed = response.json()
        if isinstance(parsed, dict):
            data = parsed
    except (TypeError, ValueError):
        pass

    message = data.get('message') or data.get('detail')
    error_code = data.get('error_code') or data.get('code')
    if not error_code and isinstance(message, str):
        match = MAILERSEND_ERROR_CODE_PATTERN.search(message)
        if match:
            error_code = match.group(0)

    request_id = (
        response.headers.get('X-Request-Id')
        or response.headers.get('CF-Ray')
        or data.get('ray_id')
    )
    return {
        'error_code': _safe_provider_value(error_code, api_token, 64),
        'error_name': _safe_provider_value(data.get('error_name'), api_token, 100),
        'message': _safe_provider_value(message, api_token),
        'request_id': _safe_provider_value(request_id, api_token, 128),
    }


def _send_via_mailersend(
    api_token: str,
    to_email: str,
    subject: str,
    body: str,
    from_email: str,
    html_body: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """Submit one message to MailerSend without exposing sensitive data in logs."""
    from_name, from_address = parseaddr(from_email)
    payload = {
        'from': {
            'email': from_address,
            'name': from_name,
        },
        'to': [{'email': to_email}],
        'subject': subject,
        'text': body or '',
    }
    if html_body is not None:
        payload['html'] = html_body
    if reply_to:
        payload['reply_to'] = {'email': reply_to}

    try:
        response = requests.post(
            MAILERSEND_EMAIL_ENDPOINT,
            json=payload,
            headers={
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_token}',
                'User-Agent': MAILERSEND_USER_AGENT,
            },
            timeout=MAILERSEND_TIMEOUT_SECONDS,
        )
        provider_status = response.status_code
        if 200 <= provider_status < 300:
            message_id = _safe_provider_value(
                response.headers.get('X-Message-Id'),
                api_token,
                128,
            )
            logger.info(
                'Email accepted by MailerSend status=%s message_id=%s',
                provider_status,
                message_id,
            )
            return True

        metadata = _mailersend_error_metadata(response, api_token)
        logger.error(
            'MailerSend email rejected status=%s error_code=%s error_name=%s '
            'request_id=%s message=%s',
            provider_status,
            metadata['error_code'],
            metadata['error_name'],
            metadata['request_id'],
            metadata['message'],
        )
    except requests.RequestException as exc:
        logger.error(
            'MailerSend email request failed status=unavailable error_type=%s',
            type(exc).__name__,
        )
    except Exception as exc:
        logger.error(
            'MailerSend email request failed status=unavailable error_type=%s',
            type(exc).__name__,
        )
    return False


def send_email(
    to_email: str,
    subject: str,
    body: str,
    from_email: Optional[str] = None,
    html_body: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """Send an email via MailerSend when configured, then SMTP as fallback.

    Returns True on success, False otherwise.
    """
    recipients = normalize_email_addresses([to_email])
    if not recipients:
        logger.warning("Email transport rejected an invalid recipient")
        return False
    to_email = recipients[0]

    reply_to_addresses = normalize_email_addresses([reply_to]) if reply_to else []
    if reply_to and not reply_to_addresses:
        logger.warning('Email transport rejected an invalid Reply-To address')
        return False

    from_addr = from_email or getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@hotelcarepro.com')
    # If a placeholder default is in use but SMTP user is configured, prefer that as from address
    if from_addr == 'no-reply@hotelcarepro.com':
        _smtp_user = getattr(settings, 'EMAIL_HOST_USER', '')
        if _smtp_user:
            from_addr = _smtp_user

    mailersend_token = getattr(settings, 'MAILERSEND_API_TOKEN', '').strip()
    if mailersend_token:
        if _send_via_mailersend(
            api_token=mailersend_token,
            to_email=to_email,
            subject=subject,
            body=body,
            from_email=from_addr,
            html_body=html_body,
            reply_to=reply_to_addresses[0] if reply_to_addresses else None,
        ):
            return True

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
        message = EmailMultiAlternatives(
            subject=subject,
            body=body or '',
            from_email=from_addr,
            to=[to_email],
            reply_to=reply_to_addresses or None,
        )
        if html_body:
            message.attach_alternative(html_body, 'text/html')
        sent = message.send(fail_silently=False)
        if sent:
            logger.info("Email sent via SMTP")
            return True
    except Exception as e:
        logger.error("SMTP send failed (%s)", type(e).__name__)

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
        base_url = os.getenv('APP_BASE_URL', 'https://hotelcarepro.com')
    
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
            logger.info("Welcome email sent successfully")
        else:
            logger.warning("Failed to send welcome email")
        
        return success
        
    except Exception as e:
        logger.error("Error sending welcome email (%s)", type(e).__name__)
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
            logger.error(
                "Failed to send admin notification (%s)", type(e).__name__
            )
    
    logger.info(f"Admin notifications sent: {success_count}/{len(admin_emails)}")
    return success_count > 0
