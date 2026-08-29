"""Narrow throttles for invitation-sensitive endpoints."""

from threading import Lock

from rest_framework.throttling import SimpleRateThrottle


_fallback_histories = {}
_fallback_lock = Lock()


class SafeInvitationThrottle(SimpleRateThrottle):
    """Use the configured cache, with a process-local limiter on cache failure."""

    cache_key_prefix = 'tenant-invitation'

    def get_cache_key(self, request, view):
        user = getattr(request, 'user', None)
        principal = (
            f'user:{user.pk}'
            if getattr(user, 'is_authenticated', False)
            else f'ip:{self.get_ident(request)}'
        )
        return self.cache_format % {
            'scope': f'{self.cache_key_prefix}:{self.scope}',
            'ident': principal,
        }

    def allow_request(self, request, view):
        try:
            return super().allow_request(request, view)
        except Exception:
            key = self.get_cache_key(request, view)
            if key is None:
                return True
            now = self.timer()
            with _fallback_lock:
                history = [
                    timestamp
                    for timestamp in _fallback_histories.get(key, [])
                    if timestamp > now - self.duration
                ]
                if len(history) >= self.num_requests:
                    _fallback_histories[key] = history
                    self.history = history
                    self.now = now
                    return False
                history.insert(0, now)
                _fallback_histories[key] = history
                self.history = history
                self.now = now
            return True


class InvitationAdminThrottle(SafeInvitationThrottle):
    scope = 'admin'
    rate = '20/hour'


class InvitationPreviewThrottle(SafeInvitationThrottle):
    scope = 'preview'
    rate = '30/minute'


class InvitationAcceptThrottle(SafeInvitationThrottle):
    scope = 'accept'
    rate = '10/minute'
