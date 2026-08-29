"""Minimal, secret-safe audit logging for the tenant invitation lifecycle."""

import logging


logger = logging.getLogger('myappLubd.invitation_audit')


def audit_invitation_event(
    event,
    outcome,
    *,
    request=None,
    tenant=None,
    invitation=None,
    reason_code=None,
    role=None,
):
    """Emit only allow-listed invitation metadata.

    Request bodies and headers are intentionally never inspected, which keeps
    invitation tokens, bearer credentials, and sealed cookies out of logs.
    """
    user = getattr(request, 'user', None)
    payload = {
        'event': str(event),
        'outcome': str(outcome),
        'actor_id': getattr(user, 'pk', None),
        'tenant_id': getattr(tenant, 'pk', None),
        'invitation_id': getattr(invitation, 'pk', None),
        'reason_code': str(reason_code) if reason_code else None,
        'role': str(role) if role else None,
    }
    logger.info('tenant_invitation_event', extra={'invitation_audit': payload})
