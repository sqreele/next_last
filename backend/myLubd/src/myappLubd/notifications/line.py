"""Server-only, Property-routed LINE Messaging API transport."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
import hashlib
import logging
import math
import time
import uuid
from urllib.parse import quote

import requests
from django.conf import settings
from django.core.cache import cache, caches
from django.utils import timezone

logger = logging.getLogger(__name__)

LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push'
LINE_QUOTA_ENDPOINT = 'https://api.line.me/v2/bot/message/quota'
LINE_QUOTA_CONSUMPTION_ENDPOINT = 'https://api.line.me/v2/bot/message/quota/consumption'
MAX_RESPONSE_BODY_LENGTH = 500
MAX_RATE_LIMIT_DELAY_SECONDS = 60
MAX_SYNCHRONOUS_RETRY_DELAY_SECONDS = 1


@dataclass(frozen=True)
class LineSendResult:
    """Safe provider outcome; it deliberately contains no credentials or target."""

    ok: bool
    status_code: int | None
    category: str
    retryable: bool
    message: str = ''
    attempts: int = 0
    retry_after_seconds: int | None = None

    def __bool__(self) -> bool:
        return self.ok


@dataclass(frozen=True)
class LineQuotaResult:
    """Safe diagnostic-only snapshot returned by LINE's quota endpoints."""

    ok: bool
    limit: int | None = None
    usage: int | None = None
    category: str = 'success'
    status_code: int | None = None

    @property
    def remaining(self) -> int | None:
        if self.limit is None or self.usage is None:
            return None
        return max(self.limit - self.usage, 0)


def _masked_destination(destination_id: str) -> str:
    return f'***{destination_id[-6:]}' if len(destination_id) >= 6 else '***'


def _safe_response_body(response, *sensitive_values: str) -> str:
    if response is None:
        return ''
    try:
        body = response.text or ''
    except Exception:  # pragma: no cover - malformed third-party response
        return ''
    sanitized = ' '.join(str(body).split())
    for value in sensitive_values:
        if value:
            sanitized = sanitized.replace(value, '[REDACTED]')
    return sanitized[:MAX_RESPONSE_BODY_LENGTH]


def _normalized_provider_message(response) -> str:
    """Extract a normalized JSON message without trusting malformed bodies."""
    try:
        payload = response.json()
    except Exception:  # provider objects/bodies must never escape classification
        return ''
    if not isinstance(payload, dict) or not isinstance(payload.get('message'), str):
        return ''
    return ' '.join(payload['message'].split()).strip().rstrip('.').casefold()


def _classify_response(response) -> tuple[str, bool]:
    status_code = response.status_code
    if 200 <= status_code < 300:
        return 'success', False
    if status_code == 400:
        return 'bad_request', False
    if status_code == 401:
        return 'unauthorized', False
    if status_code == 403:
        return 'forbidden', False
    if status_code == 429:
        if _normalized_provider_message(response) == 'you have reached your monthly limit':
            return 'monthly_quota_exhausted', False
        return 'rate_limited', True
    if 500 <= status_code < 600:
        return 'provider_error', True
    return 'provider_error', False


def _retry_after_seconds(response) -> int | None:
    try:
        value = response.headers.get('Retry-After')
        seconds = int(value) if value is not None else None
    except (AttributeError, TypeError, ValueError):
        return None
    if seconds is None or seconds < 0:
        return None
    return min(seconds, MAX_RATE_LIMIT_DELAY_SECONDS)


def _rate_limit_cache_key(destination_id: str) -> str:
    digest = hashlib.sha256(destination_id.encode('utf-8')).hexdigest()
    return f'pcms:line:rate-limit:{digest}'


USAGE_METRICS = (
    'provider_attempts', 'successful_messages', 'failed',
    'quota_exhausted', 'rate_limited',
)
USAGE_WARNING_THRESHOLDS = (80, 90, 95, 100)
_usage_failure_log_markers: set[tuple[str, str]] = set()


def _usage_month(now=None) -> str:
    current = timezone.localtime(now or timezone.now())
    return current.strftime('%Y-%m')


def _usage_timeout(now=None) -> int:
    current = timezone.localtime(now or timezone.now())
    if current.month == 12:
        following_month = current.replace(year=current.year + 1, month=1, day=1)
    else:
        following_month = current.replace(month=current.month + 1, day=1)
    return max(int((following_month + timedelta(days=7) - current).total_seconds()), 1)


def _usage_key(metric: str, *, month: str, property_id: str | None = None,
               event_type: str | None = None) -> str:
    parts = ['pcms', 'line', 'usage', month]
    if property_id is not None:
        parts.extend(('property', quote(str(property_id), safe='')))
    if event_type is not None:
        parts.extend(('event', quote(str(event_type), safe='')))
    parts.append(metric)
    return ':'.join(parts)


def _usage_cache():
    return caches[getattr(settings, 'LINE_USAGE_CACHE_ALIAS', 'line_usage')]


def _increment_cache_counter(key: str, *, timeout: int, amount: int = 1) -> int:
    usage_cache = _usage_cache()
    usage_cache.add(key, 0, timeout=timeout)
    try:
        return usage_cache.incr(key, amount)
    except ValueError:
        # The key may have expired between add and incr.
        usage_cache.add(key, 0, timeout=timeout)
        return usage_cache.incr(key, amount)


def _configured_monthly_limit() -> int | None:
    value = getattr(settings, 'LINE_MONTHLY_MESSAGE_LIMIT', None)
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def _warn_for_usage_thresholds(*, month: str, successful_count: int, timeout: int) -> None:
    limit = _configured_monthly_limit()
    if limit is None:
        return
    for percentage in USAGE_WARNING_THRESHOLDS:
        threshold = math.ceil(limit * percentage / 100)
        if successful_count < threshold:
            continue
        warning_key = f'pcms:line:usage-warning:{month}:{percentage}'
        try:
            first_warning = _usage_cache().add(warning_key, True, timeout=timeout)
        except Exception as exc:
            marker = (month, 'warning-marker')
            if marker not in _usage_failure_log_markers:
                _usage_failure_log_markers.add(marker)
                logger.warning(
                    'LINE usage warning marker update failed month=%s threshold=%s error=%s',
                    month, percentage, type(exc).__name__,
                )
            return
        if first_warning:
            logger.warning(
                'LINE monthly usage reached %s%% (%s/%s) month=%s',
                percentage, successful_count, limit, month,
            )


def record_line_usage(metric: str, *, property_id: str | None, event_type: str | None,
                      amount: int = 1, now=None) -> None:
    """Best-effort atomic cache counters; delivery never depends on metrics."""
    if metric not in USAGE_METRICS:
        raise ValueError(f'Unknown LINE usage metric: {metric}')
    month = _usage_month(now)
    timeout = _usage_timeout(now)
    property_key = str(property_id or 'unspecified')
    event_key = str(event_type or 'unspecified')
    try:
        _increment_cache_counter(
            _usage_key(metric, month=month, property_id=property_key, event_type=event_key),
            timeout=timeout, amount=amount,
        )
        _increment_cache_counter(
            _usage_key(metric, month=month, property_id=property_key),
            timeout=timeout, amount=amount,
        )
        overall = _increment_cache_counter(
            _usage_key(metric, month=month), timeout=timeout, amount=amount,
        )
    except Exception as exc:
        marker = (month, f'write:{metric}')
        if marker not in _usage_failure_log_markers:
            _usage_failure_log_markers.add(marker)
            logger.warning(
                'LINE usage counter update failed month=%s property=%s event=%s metric=%s error=%s',
                month, property_key, event_key, metric, type(exc).__name__,
            )
        return
    if metric == 'successful_messages':
        _warn_for_usage_thresholds(month=month, successful_count=overall, timeout=timeout)


def get_line_usage(*, property_id: str | None = None, event_type: str | None = None,
                   now=None) -> dict[str, int | str]:
    """Read a monthly Property/event bucket or the overall rollup."""
    month = _usage_month(now)
    try:
        return {
            'month': month,
            **{
                metric: int(_usage_cache().get(_usage_key(
                    metric, month=month, property_id=property_id, event_type=event_type,
                ), 0) or 0)
                for metric in USAGE_METRICS
            },
        }
    except Exception as exc:
        marker = (month, 'read')
        if marker not in _usage_failure_log_markers:
            _usage_failure_log_markers.add(marker)
            logger.warning(
                'LINE usage counter read failed month=%s property=%s event=%s error=%s',
                month, property_id, event_type, type(exc).__name__,
            )
        return {'month': month, **{metric: 0 for metric in USAGE_METRICS}}


def get_provider_quota() -> LineQuotaResult:
    """Fetch LINE quota/consumption only when explicitly requested by an operator."""
    token = settings.LINE_CHANNEL_ACCESS_TOKEN
    if not token:
        return LineQuotaResult(False, category='missing_token')
    headers = {'Authorization': f'Bearer {token}'}
    responses = []
    try:
        for endpoint in (LINE_QUOTA_ENDPOINT, LINE_QUOTA_CONSUMPTION_ENDPOINT):
            response = requests.get(
                endpoint, headers=headers, timeout=settings.LINE_MESSAGING_TIMEOUT_SECONDS,
            )
            responses.append(response)
            if not 200 <= response.status_code < 300:
                logger.warning(
                    'LINE quota diagnostic failed endpoint=%s status=%s',
                    'quota' if endpoint == LINE_QUOTA_ENDPOINT else 'consumption',
                    response.status_code,
                )
                return LineQuotaResult(
                    False, category='provider_error', status_code=response.status_code,
                )
        quota_payload = responses[0].json()
        consumption_payload = responses[1].json()
        limit = quota_payload.get('value') if isinstance(quota_payload, dict) else None
        usage = consumption_payload.get('totalUsage') if isinstance(consumption_payload, dict) else None
        if not isinstance(limit, int) or isinstance(limit, bool):
            limit = None
        if not isinstance(usage, int) or isinstance(usage, bool):
            usage = None
        if usage is None or (
            isinstance(quota_payload, dict)
            and quota_payload.get('type') == 'limited'
            and limit is None
        ):
            return LineQuotaResult(False, limit=limit, usage=usage, category='invalid_response')
        return LineQuotaResult(True, limit=limit, usage=usage)
    except (requests.RequestException, TypeError, ValueError) as exc:
        logger.warning('LINE quota diagnostic failed error=%s', type(exc).__name__)
        return LineQuotaResult(False, category='network_or_invalid_response')


def _log_result(*, result: LineSendResult, destination_id: str, event_type: str | None,
                property_id: str | None, exception_class: str = '') -> None:
    usage = get_line_usage(property_id=str(property_id or 'unspecified'))
    fields = {
        'event_type': event_type or 'unspecified', 'property_id': property_id or 'unspecified',
        'destination': _masked_destination(destination_id), 'status': result.status_code,
        'category': result.category, 'retryable': result.retryable, 'attempt': result.attempts,
        'retry_after': result.retry_after_seconds, 'exception': exception_class or 'none',
        'response': result.message,
        'monthly_success': usage['successful_messages'],
        'monthly_attempts': usage['provider_attempts'],
    }
    if result.ok:
        logger.info('LINE delivery succeeded event=%(event_type)s property=%(property_id)s destination=%(destination)s status=%(status)s attempt=%(attempt)s monthly_success=%(monthly_success)s monthly_provider_attempts=%(monthly_attempts)s', fields)
    elif result.category == 'monthly_quota_exhausted':
        month = _usage_month()
        marker = ':'.join((
            'pcms', 'line', 'quota-log', month,
            quote(str(property_id or 'unspecified'), safe=''),
            quote(str(event_type or 'unspecified'), safe=''),
        ))
        try:
            should_warn = _usage_cache().add(marker, True, timeout=_usage_timeout())
        except Exception:
            fallback_marker = (month, f'quota:{property_id}:{event_type}')
            should_warn = fallback_marker not in _usage_failure_log_markers
            _usage_failure_log_markers.add(fallback_marker)
        log_method = logger.warning if should_warn else logger.debug
        log_method('LINE monthly quota exhausted event=%(event_type)s property=%(property_id)s destination=%(destination)s status=%(status)s category=%(category)s retryable=%(retryable)s attempt=%(attempt)s monthly_success=%(monthly_success)s monthly_provider_attempts=%(monthly_attempts)s response=%(response)s', fields)
    else:
        logger.warning('LINE delivery failed event=%(event_type)s property=%(property_id)s destination=%(destination)s status=%(status)s category=%(category)s retryable=%(retryable)s attempt=%(attempt)s retry_after=%(retry_after)s monthly_success=%(monthly_success)s monthly_provider_attempts=%(monthly_attempts)s exception=%(exception)s response=%(response)s', fields)


def _record_final_failure(*, property_id: str | None, event_type: str | None) -> None:
    record_line_usage('failed', property_id=property_id, event_type=event_type)


def send_line_message(destination_id: str, messages: list[dict], *, event_type: str | None = None,
                      property_id: str | None = None, retry_key: str | None = None) -> LineSendResult:
    """Send one LINE request with conservative, bounded 429 handling.

    Only a provider-specified Retry-After of zero/one seconds is retried once.
    Longer or unspecified 429s are cache-suppressed briefly instead of blocking
    web workers or amplifying a notification storm. Network/5xx outcomes are
    marked retryable for a future queue but not synchronously replayed because
    this deployment has no durable worker and replay can duplicate a delivery.
    """
    token = settings.LINE_CHANNEL_ACCESS_TOKEN
    destination_id = str(destination_id or '').strip()
    if not token:
        result = LineSendResult(False, None, 'missing_token', False)
        _log_result(result=result, destination_id=destination_id, event_type=event_type, property_id=property_id)
        return result
    if not destination_id:
        result = LineSendResult(False, None, 'missing_destination', False)
        _log_result(result=result, destination_id=destination_id, event_type=event_type, property_id=property_id)
        return result
    if not isinstance(messages, list) or not messages:
        result = LineSendResult(False, None, 'invalid_messages', False)
        _log_result(result=result, destination_id=destination_id, event_type=event_type, property_id=property_id)
        return result

    normalized_retry_key = None
    if retry_key:
        try:
            normalized_retry_key = str(uuid.UUID(str(retry_key)))
        except (ValueError, TypeError, AttributeError):
            result = LineSendResult(False, None, 'invalid_retry_key', False)
            _log_result(result=result, destination_id=destination_id, event_type=event_type, property_id=property_id)
            return result

    rate_limit_key = _rate_limit_cache_key(destination_id)
    if cache.get(rate_limit_key):
        result = LineSendResult(False, 429, 'rate_limited', True, 'cooldown active')
        _log_result(result=result, destination_id=destination_id, event_type=event_type, property_id=property_id)
        return result

    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    if normalized_retry_key:
        headers['X-Line-Retry-Key'] = normalized_retry_key

    result = LineSendResult(False, None, 'network_error', True)
    for attempt in (1, 2):
        record_line_usage('provider_attempts', property_id=property_id, event_type=event_type)
        try:
            response = requests.post(LINE_PUSH_ENDPOINT, headers=headers,
                json={'to': destination_id, 'messages': messages},
                timeout=settings.LINE_MESSAGING_TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            result = LineSendResult(False, None, 'network_error', True, attempts=attempt)
            _record_final_failure(property_id=property_id, event_type=event_type)
            _log_result(result=result, destination_id=destination_id, event_type=event_type,
                        property_id=property_id, exception_class=type(exc).__name__)
            return result

        accepted_replay = bool(normalized_retry_key and response.status_code == 409
            and response.headers.get('X-Line-Accepted-Request-Id'))
        if accepted_replay:
            result = LineSendResult(True, 409, 'accepted_replay', False, attempts=attempt)
            _log_result(result=result, destination_id=destination_id, event_type=event_type, property_id=property_id)
            return result

        category, retryable = _classify_response(response)
        retry_after = _retry_after_seconds(response) if category == 'rate_limited' else None
        result = LineSendResult(category == 'success', response.status_code, category, retryable,
            _safe_response_body(
                response, token, destination_id,
                getattr(settings, 'LINE_CHANNEL_SECRET', ''),
            ), attempt, retry_after)
        if category == 'rate_limited':
            record_line_usage('rate_limited', property_id=property_id, event_type=event_type)
        elif category == 'monthly_quota_exhausted':
            record_line_usage('quota_exhausted', property_id=property_id, event_type=event_type)
        if result.ok:
            record_line_usage('successful_messages', property_id=property_id, event_type=event_type)
            _log_result(result=result, destination_id=destination_id, event_type=event_type, property_id=property_id)
            return result
        _log_result(result=result, destination_id=destination_id, event_type=event_type, property_id=property_id)
        if category == 'rate_limited' and attempt == 1 and retry_after is not None and retry_after <= MAX_SYNCHRONOUS_RETRY_DELAY_SECONDS:
            time.sleep(retry_after)
            continue
        if category == 'rate_limited':
            cache.set(rate_limit_key, True, timeout=retry_after or MAX_RATE_LIMIT_DELAY_SECONDS)
        _record_final_failure(property_id=property_id, event_type=event_type)
        return result

    if result.category == 'rate_limited':
        cache.set(rate_limit_key, True, timeout=result.retry_after_seconds or MAX_RATE_LIMIT_DELAY_SECONDS)
    _record_final_failure(property_id=property_id, event_type=event_type)
    return result


def send_text_message(*, destination_id: str, text: str, retry_key: str | None = None,
                      event_type: str | None = None, property_id: str | None = None) -> LineSendResult:
    """Compatibility helper for one text message."""
    return send_line_message(destination_id, [{'type': 'text', 'text': str(text)[:5000]}],
        event_type=event_type, property_id=property_id, retry_key=retry_key)
