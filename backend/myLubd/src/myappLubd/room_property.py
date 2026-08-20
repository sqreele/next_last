"""Canonical Room property resolution and transitional legacy-M2M synchronization."""

from django.core.exceptions import ValidationError

from .job_property import resolve_property_reference


def resolve_room_property(*, explicit_property=None, legacy_properties=None, existing_property=None):
    """Resolve one Room owner and reject ambiguity or relocation.

    ``Room.properties`` remains a compatibility representation through B.8,
    but it may only contain the same single Property as ``Room.property``.
    Authorization is intentionally handled by the calling request path.
    """
    candidates = {}
    explicit_property = resolve_property_reference(explicit_property)
    if explicit_property is not None:
        candidates[explicit_property.pk] = explicit_property

    for property_obj in legacy_properties or []:
        candidates[property_obj.pk] = property_obj

    if len(candidates) != 1:
        if not candidates:
            raise ValidationError({
                'properties': 'Exactly one property is required for a room.',
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


def sync_room_legacy_property(room, property_obj):
    """Make the transitional M2M exactly mirror a saved canonical Room FK."""
    if room.pk is None:
        raise ValidationError({'property_id': 'Save the room before synchronizing properties.'})
    if room.property_id != property_obj.pk:
        raise ValidationError({
            'property_id': 'Canonical Room.property must match the legacy property entry.',
        })
    room.properties.set([property_obj])
