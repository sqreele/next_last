"""
Web Push helpers wrapped around pywebpush.

VAPID keys are read from environment variables — they MUST be the same pair
that the frontend embeds as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Generate with:

    pip install py-vapid
    vapid --applicationServerKey

and store the base64url public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the
private key in `VAPID_PRIVATE_KEY`, and a mailto: contact in
`VAPID_CONTACT_EMAIL`.

Failures are swallowed (logged + flagged) so a flaky push provider can't
take down a regular API write — the only side effect is the subscription
gets deactivated if the endpoint says it's gone.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Iterable

logger = logging.getLogger(__name__)


def _vapid_claims() -> dict[str, str] | None:
    email = os.environ.get('VAPID_CONTACT_EMAIL', '').strip()
    if not email:
        return None
    if not email.startswith('mailto:'):
        email = f'mailto:{email}'
    return {'sub': email}


def is_push_configured() -> bool:
    """True iff env has every secret pywebpush needs."""
    return all(
        os.environ.get(name)
        for name in ('VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_CONTACT_EMAIL')
    )


def send_push_to_user(user, payload: dict[str, Any]) -> int:
    """
    Send `payload` (a JSON-serializable dict) to every active subscription
    belonging to `user`. Returns the number of subscriptions successfully
    delivered to. Inactive / gone subscriptions are auto-deactivated.
    """
    from .models import PushSubscription  # local import to avoid cycles

    if not is_push_configured():
        logger.info('Push not configured; skipping send for user=%s', user.pk)
        return 0

    subs = list(PushSubscription.objects.filter(user=user, is_active=True))
    return send_push_to_subscriptions(subs, payload)


def send_push_to_subscriptions(subs: Iterable['PushSubscription'], payload: dict[str, Any]) -> int:
    try:
        from pywebpush import WebPushException, webpush  # type: ignore
    except ImportError:
        logger.warning('pywebpush not installed; cannot deliver push notifications')
        return 0

    private_key = os.environ.get('VAPID_PRIVATE_KEY', '').strip()
    claims = _vapid_claims()
    if not private_key or claims is None:
        return 0

    delivered = 0
    body = json.dumps(payload)
    from django.utils import timezone

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {'p256dh': sub.p256dh, 'auth': sub.auth},
                },
                data=body,
                vapid_private_key=private_key,
                vapid_claims=claims,
            )
            sub.last_used_at = timezone.now()
            sub.save(update_fields=['last_used_at'])
            delivered += 1
        except WebPushException as exc:  # pragma: no cover - network
            response = getattr(exc, 'response', None)
            status_code = getattr(response, 'status_code', None)
            if status_code in (404, 410):
                # Subscription is gone for good: deactivate so we stop retrying.
                sub.is_active = False
                sub.save(update_fields=['is_active'])
                logger.info('Deactivated gone push subscription endpoint=%s', sub.endpoint[:40])
            else:
                logger.warning('Push send failed (%s) for endpoint=%s', status_code, sub.endpoint[:40])
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning('Unexpected push send error: %s', exc)
    return delivered
