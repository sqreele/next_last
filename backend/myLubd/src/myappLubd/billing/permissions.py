from rest_framework.permissions import BasePermission

from ..tenancy import user_can_access_billing


class HasBillingAccess(BasePermission):
    """Allow active admin/manager memberships or platform break-glass."""

    message = 'You do not have permission to access billing.'

    def has_permission(self, request, view):
        return user_can_access_billing(request.user)
