"""Canonical Room property resolution."""

from django.core.exceptions import ValidationError

from .job_property import resolve_property_reference


def resolve_room_property(*, explicit_property=None, existing_property=None):
    """Resolve one Room owner and reject ambiguity or relocation.

    Authorization is intentionally handled by the calling request path.
    """
    candidates = {}
    explicit_property = resolve_property_reference(explicit_property)
    if explicit_property is not None:
        candidates[explicit_property.pk] = explicit_property

    if len(candidates) != 1:
        if not candidates:
            raise ValidationError({
                'property_id': 'A property_id is required for a room.',
            })
        raise ValidationError({
            'properties': 'A room can belong to exactly one property.',
        })

    resolved_property = next(iter(candidates.values()))
    if existing_property is not None and existing_property.pk != resolved_property.pk:
        raise ValidationError({
            'property_id': 'Room.property is immutable after creation.',
        })
    return resolved_property
