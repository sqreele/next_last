"""Explicit Admin-configured recipients of the default global daily summary."""
import logging

from django.db import DatabaseError, transaction

from .email_utils import normalize_email_addresses
from .models import DailySummaryRecipient

logger = logging.getLogger(__name__)


def active_daily_summary_emails(exclude_emails=None):
    try:
        with transaction.atomic():
            emails = list(DailySummaryRecipient.objects.filter(is_active=True).values_list('email', flat=True))
    except DatabaseError as exc:
        # Keep the existing delivery path working during a staged migration.
        logger.warning('Daily summary recipient configuration unavailable error_type=%s', type(exc).__name__)
        return []
    excluded = {value.strip().casefold() for value in str(exclude_emails or '').split(',') if value.strip()}
    return [email for email in normalize_email_addresses(emails) if email.casefold() not in excluded]
