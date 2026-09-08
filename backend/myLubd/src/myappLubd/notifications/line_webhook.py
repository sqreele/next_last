"""Verified LINE webhook parsing and one-time group pairing."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import LineGroupPairing, Property


logger = logging.getLogger(__name__)

PAIRING_COMMAND_RE = re.compile(
    r'STAYMAINT LINK ([A-Z2-7]{4}(?:-[A-Z2-7]{4}){5})\Z'
)


@dataclass(frozen=True)
class PairingResult:
    outcome: str
    property_id: str | None = None


def pairing_ttl() -> timedelta:
    minutes = int(getattr(settings, 'LINE_PAIRING_EXPIRY_MINUTES', 15))
    return timedelta(minutes=max(1, min(minutes, 15)))


def generate_pairing_code() -> str:
    """Return a 120-bit, human-transcribable secret in six groups."""
    compact = base64.b32encode(secrets.token_bytes(15)).decode('ascii')
    return '-'.join(compact[index:index + 4] for index in range(0, 24, 4))


def verify_line_signature(raw_body: bytes, signature: str | None) -> bool:
    """Authenticate the exact request bytes with the server-only channel secret."""
    secret = str(getattr(settings, 'LINE_CHANNEL_SECRET', '') or '')
    if not secret or not signature:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode('utf-8'), raw_body, hashlib.sha256).digest()
    ).decode('ascii')
    return hmac.compare_digest(expected, str(signature))


def parse_verified_payload(raw_body: bytes) -> dict:
    payload = json.loads(raw_body.decode('utf-8'))
    if not isinstance(payload, dict) or not isinstance(payload.get('events', []), list):
        raise ValueError('Invalid LINE webhook envelope')
    return payload


def pairing_code_from_event(event: object) -> str | None:
    if not isinstance(event, dict):
        return None
    if event.get('type') != 'message':
        return None
    source = event.get('source')
    message = event.get('message')
    if not isinstance(source, dict) or source.get('type') != 'group':
        return None
    if not isinstance(source.get('groupId'), str) or not source['groupId'].strip():
        return None
    if not isinstance(message, dict) or message.get('type') != 'text':
        return None
    text = message.get('text')
    if not isinstance(text, str):
        return None
    match = PAIRING_COMMAND_RE.fullmatch(text)
    return match.group(1) if match else None


def masked_destination(destination_id: str) -> str:
    value = str(destination_id or '')
    return f'***{value[-4:]}' if len(value) >= 4 else '***'


def complete_group_pairing(*, token: str, group_id: str) -> PairingResult:
    """Consume one unambiguous pairing and bind its exact Property atomically."""
    token_hash = LineGroupPairing.hash_token(token)
    now = timezone.now()

    with transaction.atomic():
        candidates = list(
            LineGroupPairing.objects.select_for_update()
            .filter(token_hash=token_hash)
            .order_by('pk')[:2]
        )
        if len(candidates) != 1 or not candidates[0].matches_token(token):
            return PairingResult('invalid')

        pairing = candidates[0]
        property_obj = Property.objects.select_for_update().get(pk=pairing.property_id)

        if pairing.used_at is not None:
            if property_obj.line_destination_id == group_id:
                return PairingResult('idempotent', property_obj.property_id)
            return PairingResult('conflict')
        if pairing.revoked_at is not None:
            return PairingResult('revoked')
        if pairing.expires_at <= now:
            return PairingResult('expired')
        if property_obj.line_destination_id:
            return PairingResult('already_bound')

        property_obj.line_destination_id = group_id
        property_obj.line_notifications_enabled = True
        property_obj.save(update_fields=['line_destination_id', 'line_notifications_enabled'])
        pairing.used_at = now
        pairing.bound_destination_suffix = group_id[-4:]
        pairing.save(update_fields=['used_at', 'bound_destination_suffix'])

    logger.info(
        'LINE group pairing completed property=%s destination=%s',
        property_obj.property_id,
        masked_destination(group_id),
    )
    return PairingResult('paired', property_obj.property_id)


def process_verified_events(payload: dict) -> int:
    paired_count = 0
    for event in payload.get('events', []):
        token = pairing_code_from_event(event)
        if token is None:
            continue
        group_id = event['source']['groupId']
        result = complete_group_pairing(token=token, group_id=group_id)
        if result.outcome == 'paired':
            paired_count += 1
        elif result.outcome not in {'idempotent'}:
            logger.info('LINE group pairing ignored outcome=%s', result.outcome)
    return paired_count
