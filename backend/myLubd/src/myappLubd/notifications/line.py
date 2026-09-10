"""Minimal, server-only LINE Messaging API transport."""

from __future__ import annotations

import logging
import uuid

import requests
from django.conf import settings


logger = logging.getLogger(__name__)

LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push'


def _masked_destination(destination_id: str) -> str:
    """Return enough context for operations without logging the identifier."""
    return f'***{destination_id[-4:]}' if len(destination_id) >= 4 else '***'


def send_text_message(*, destination_id: str, text: str, retry_key: str | None = None) -> bool:
    """Push one LINE text message; provider failures never escape this layer."""
    token = settings.LINE_CHANNEL_ACCESS_TOKEN
    destination_id = str(destination_id or '').strip()
    if not token or not destination_id:
        return False

    normalized_retry_key = None
    if retry_key:
        try:
            normalized_retry_key = str(uuid.UUID(str(retry_key)))
        except (ValueError, TypeError, AttributeError):
            logger.warning(
                'LINE delivery rejected invalid retry key destination=%s',
                _masked_destination(destination_id),
            )
            return False

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    if normalized_retry_key:
        headers['X-Line-Retry-Key'] = normalized_retry_key

    try:
        response = requests.post(
            LINE_PUSH_ENDPOINT,
            headers=headers,
            json={
                'to': destination_id,
                'messages': [{'type': 'text', 'text': str(text)[:5000]}],
            },
            timeout=settings.LINE_MESSAGING_TIMEOUT_SECONDS,
        )
        # A retry-key conflict is accepted only with LINE's documented marker
        # linking this response to the request that was already accepted.
        retry_already_accepted = bool(
            normalized_retry_key
            and response.status_code == 409
            and response.headers.get('X-Line-Accepted-Request-Id')
        )
        if not retry_already_accepted:
            response.raise_for_status()
    except requests.RequestException as exc:
        response = getattr(exc, 'response', None)
        logger.warning(
            'LINE delivery failed destination=%s status=%s error=%s',
            _masked_destination(destination_id),
            getattr(response, 'status_code', None),
            type(exc).__name__,
        )
        return False

    logger.info(
        'LINE delivery succeeded destination=%s',
        _masked_destination(destination_id),
    )
    return True
