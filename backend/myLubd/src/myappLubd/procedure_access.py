"""Property-scoped machine usage of owned maintenance templates."""
from django.db.models import Prefetch

from .tenancy import get_accessible_machines


def visible_procedure_machines(procedure, context):
    """Fail closed without a request; support serializers outside the viewset."""
    request = context.get('request')
    if request is None:
        return []
    if hasattr(procedure, '_visible_machines'):
        return [machine for machine in procedure._visible_machines if machine.property_id == procedure.property_id]
    return list(get_accessible_machines(request.user).filter(maintenance_procedures=procedure, property_id=procedure.property_id))


def procedure_machine_prefetch(user):
    return Prefetch(
        'machines',
        queryset=get_accessible_machines(user).select_related('property'),
        to_attr='_visible_machines',
    )
