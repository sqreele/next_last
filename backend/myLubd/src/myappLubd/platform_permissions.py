"""DRF permissions for future ``/api/v1/platform/`` endpoints."""

from rest_framework.permissions import BasePermission

from .platform_authorization import user_has_platform_capability


class HasPlatformCapability(BasePermission):
    """Require a capability declared by the view, never a tenant role.

    Future platform views must set ``platform_capability`` to one capability.
    Superusers pass through the explicit compatibility behavior in the
    canonical platform authorization helper; ``is_staff`` is not considered.
    """

    message = 'You do not have permission to access this platform resource.'

    def has_permission(self, request, view):
        capability = getattr(view, 'platform_capability', None)
        return bool(capability and user_has_platform_capability(request.user, capability))
