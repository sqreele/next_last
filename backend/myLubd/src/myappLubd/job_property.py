"""Canonical relational property resolution for Job write paths."""

from django.core.exceptions import ValidationError

from .models import Property


def resolve_property_reference(value):
    """Resolve a Property instance, PK, or public ``property_id`` value."""
    if value is None or value == '':
        return None
    if isinstance(value, Property):
        return value

    value = str(value).strip()
    queryset = Property.objects.filter(property_id=value)
    if value.isdigit():
        queryset = Property.objects.filter(property_id=value) | Property.objects.filter(pk=int(value))
    property_obj = queryset.first()
    if property_obj is None:
        raise ValidationError({'property_id': 'Invalid property ID.'})
    return property_obj


def resolve_external_property_reference(value):
    """Resolve only the public/business ``Property.property_id`` identity."""
    if value is None or value == '':
        return None
    if isinstance(value, Property):
        return value

    property_obj = Property.objects.filter(property_id=str(value).strip()).first()
    if property_obj is None:
        raise ValidationError({'property_id': 'Invalid property ID.'})
    return property_obj


def resolve_job_property(*, explicit_property=None, area=None, rooms=None, require=True):
    """Return the sole Property supported by the supplied Job location state.

    Only explicit Property, Area.property, and Room.property are evidence.
    This function deliberately performs no authorization decision.
    """
    candidates = {}
    explicit_property = resolve_property_reference(explicit_property)
    if explicit_property is not None:
        candidates[explicit_property.pk] = explicit_property

    if area is not None:
        candidates[area.property_id] = area.property

    for room in rooms or []:
        if room.property_id is not None:
            candidates[room.property_id] = room.property

    if not candidates:
        if require:
            raise ValidationError({
                'non_field_errors': 'A Job property, area, or room is required to determine the canonical property.'
            })
        return None
    if len(candidates) != 1:
        raise ValidationError({
            'non_field_errors': 'Area, rooms, and property must all belong to the same property.'
        })
    return next(iter(candidates.values()))
