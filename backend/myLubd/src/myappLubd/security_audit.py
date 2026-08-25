"""Small, dependency-free security audit logging helpers.

The helper deliberately accepts only an allowlist of scalar metadata.  It
never inspects headers, cookies, request bodies, or authentication tokens.
"""

import json
import logging


audit_logger = logging.getLogger('security.audit')

_DETAIL_FIELDS = {
    'old_role',
    'new_role',
    'old_is_active',
    'new_is_active',
    'added_property_ids',
    'removed_property_ids',
    'previous_user_id',
    'new_user_id',
    'throttle_scope',
}


def _identifier(value):
    if value is None:
        return None
    return getattr(value, 'pk', value)


def audit_event(
    event,
    outcome,
    *,
    request=None,
    reason_code=None,
    tenant=None,
    property_obj=None,
    target_type=None,
    target_id=None,
    target_user_id=None,
    **details,
):
    """Emit one JSON audit record without affecting the guarded operation."""
    record = {'event': event, 'outcome': outcome}

    user = getattr(request, 'user', None)
    if user is not None and getattr(user, 'is_authenticated', False):
        record['actor_user_id'] = user.pk
        username = str(getattr(user, 'username', '') or '').strip()
        if username:
            record['actor_username'] = username

        if tenant is not None and not getattr(user, 'is_superuser', False):
            try:
                from .models import TenantMembership

                membership = TenantMembership.objects.filter(
                    user=user,
                    tenant=tenant,
                ).order_by('-is_active', 'pk').first()
                if membership is not None:
                    record['actor_membership_id'] = membership.pk
                    record['actor_role'] = membership.role
            except Exception:
                # Audit enrichment must never change an authorization result.
                pass

    tenant_id = _identifier(tenant)
    property_id = _identifier(property_obj)
    if tenant_id is None and property_obj is not None:
        tenant_id = getattr(property_obj, 'tenant_id', None)
    if tenant_id is not None:
        record['tenant_id'] = tenant_id
    if property_id is not None:
        record['property_id'] = property_id
    if target_type:
        record['target_type'] = target_type
    if target_id is not None:
        record['target_id'] = _identifier(target_id)
    if target_user_id is not None:
        record['target_user_id'] = _identifier(target_user_id)
    if reason_code:
        record['reason_code'] = reason_code

    if request is not None:
        method = str(getattr(request, 'method', '') or '').upper()
        path = str(getattr(request, 'path', '') or '')
        if method:
            record['request_method'] = method
        if path:
            record['request_path'] = path

    for key in _DETAIL_FIELDS:
        value = details.get(key)
        if value is not None:
            record[key] = value

    try:
        audit_logger.info(json.dumps(record, sort_keys=True, separators=(',', ':'), default=str))
    except Exception:
        # Authorization and administrative behavior must not depend on logging.
        pass
    return record
