"""Targeted, shared-cache rate limits for security-sensitive API actions."""

import hashlib
import ipaddress
import logging
import math
from functools import lru_cache

from django.conf import settings
from django.core.cache import caches
from django.core.exceptions import ImproperlyConfigured
from rest_framework.throttling import SimpleRateThrottle

from .security_audit import audit_event


logger = logging.getLogger(__name__)


@lru_cache(maxsize=8)
def _trusted_proxy_networks(cidrs):
    return tuple(ipaddress.ip_network(cidr) for cidr in cidrs)


def anonymous_source_ip(request):
    """Resolve X-Real-IP only across the configured internal proxy boundary."""
    peer_value = str(request.META.get('REMOTE_ADDR') or 'unknown').strip()
    try:
        peer_ip = ipaddress.ip_address(peer_value)
    except ValueError:
        return peer_value

    trusted_cidrs = tuple(getattr(settings, 'THROTTLE_TRUSTED_PROXY_CIDRS', ()))
    if any(peer_ip in network for network in _trusted_proxy_networks(trusted_cidrs)):
        forwarded_value = str(request.META.get('HTTP_X_REAL_IP') or '').strip()
        if forwarded_value:
            try:
                return str(ipaddress.ip_address(forwarded_value))
            except ValueError:
                pass
    return str(peer_ip)


class SecurityRateThrottle(SimpleRateThrottle):
    """Atomic fixed-window throttle keyed by authenticated user or source IP.

    Production uses the dedicated Redis cache alias configured in settings.
    Anonymous identity ignores X-Forwarded-For and accepts X-Real-IP only
    across the configured trusted-proxy boundary.
    """

    cache_alias = 'throttle'

    def get_rate(self):
        # Read Django settings at instantiation time so test/runtime settings
        # overrides cannot leave DRF's class-level rate mapping stale.
        rates = getattr(settings, 'REST_FRAMEWORK', {}).get(
            'DEFAULT_THROTTLE_RATES', {}
        )
        return rates.get(self.scope)

    def get_cache_key(self, request, view):
        user = getattr(request, 'user', None)
        if user is not None and getattr(user, 'is_authenticated', False):
            identity_type = 'user'
            # date_joined is stable for one account and distinguishes a
            # deleted/recreated database identity that reuses the same PK.
            joined = getattr(user, 'date_joined', None)
            identity = f'{user.pk}:{joined.isoformat() if joined else ""}'
        else:
            identity_type = 'ip'
            identity = anonymous_source_ip(request)
        digest = hashlib.sha256(identity.encode('utf-8')).hexdigest()
        return identity_type, digest

    def allow_request(self, request, view):
        rate = self.get_rate()
        if rate is None:
            raise ImproperlyConfigured(
                f'Missing DRF throttle rate for security scope {self.scope!r}.'
            )

        self.num_requests, self.duration = self.parse_rate(rate)
        self.now = self.timer()
        self.window_start = int(self.now // self.duration) * self.duration
        self.window_wait = max(
            1,
            int(math.ceil(self.window_start + self.duration - self.now)),
        )
        identity_type, identity_digest = self.get_cache_key(request, view)
        cache_key = (
            f'security-throttle:{self.scope}:{identity_type}:'
            f'{identity_digest}:{self.window_start}'
        )
        try:
            cache = caches[getattr(settings, 'THROTTLE_CACHE_ALIAS', self.cache_alias)]
            if cache.add(cache_key, 1, timeout=self.window_wait):
                request_count = 1
            else:
                try:
                    request_count = cache.incr(cache_key)
                except ValueError:
                    # The window may have expired between add and incr.
                    if cache.add(cache_key, 1, timeout=self.window_wait):
                        request_count = 1
                    else:
                        request_count = cache.incr(cache_key)
        except Exception:
            # A security throttle must not silently fail open when Redis is
            # unavailable. DRF will return the same non-secret 429 contract.
            logger.exception('Security throttle cache unavailable for scope=%s', self.scope)
            self._audit_denial(request)
            return False

        if request_count <= self.num_requests:
            return True

        self._audit_denial(request)
        return False

    def _audit_denial(self, request):
        audit_event(
            'security.rate_limit.exceeded',
            'denied',
            request=request,
            reason_code='rate_limited',
            throttle_scope=self.scope,
        )

    def wait(self):
        return getattr(self, 'window_wait', None)


class AuthCredentialThrottle(SecurityRateThrottle):
    scope = 'auth_credential'


class PasswordRecoveryThrottle(SecurityRateThrottle):
    scope = 'password_recovery'


class MembershipAdminThrottle(SecurityRateThrottle):
    scope = 'membership_admin'


class InvitationAdminThrottle(SecurityRateThrottle):
    scope = 'invitation_admin'


class InvitationPreviewThrottle(SecurityRateThrottle):
    scope = 'invitation_preview'


class InvitationAcceptThrottle(SecurityRateThrottle):
    scope = 'invitation_accept'


class JobAssignmentThrottle(SecurityRateThrottle):
    scope = 'job_assignment'


class ProtectedMediaUserThrottle(SecurityRateThrottle):
    scope = 'protected_media_user'


class ProtectedMediaProbeThrottle(SecurityRateThrottle):
    scope = 'protected_media_probe'


class BulkOperationThrottle(SecurityRateThrottle):
    scope = 'bulk_operation'


class MediaUploadThrottle(SecurityRateThrottle):
    scope = 'media_upload'


class ExpensiveExportThrottle(SecurityRateThrottle):
    scope = 'expensive_export'


class PrivilegedAdminThrottle(SecurityRateThrottle):
    scope = 'privileged_admin'


class PublicJobRequestThrottle(SecurityRateThrottle):
    scope = 'public_job_request'

    def get_cache_key(self, request, view):
        # This endpoint is intentionally public and remains network-limited
        # even if a browser happens to carry an authenticated session.
        identity = anonymous_source_ip(request)
        digest = hashlib.sha256(identity.encode('utf-8')).hexdigest()
        return 'ip', digest


class ActionThrottleMixin:
    """Select throttle classes only for explicitly sensitive ViewSet actions."""

    throttle_action_classes = {}

    def get_throttles(self):
        classes = self.throttle_action_classes.get(
            getattr(self, 'action', None),
            self.throttle_classes,
        )
        return [throttle_class() for throttle_class in classes]
