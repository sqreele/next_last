"""Shared definitions."""
from rest_framework import serializers
from ..models import Machine, InventoryCategory
from ..tenancy import get_accessible_properties, get_operable_properties


RAW_AUTH_PREFIXES = ('google-oauth2_', 'auth0_', 'auth0|')


def _validate_request_property_access(serializer, property_obj, field='property'):
    """Apply the canonical property scope to serializer writes.

    Relation fields otherwise resolve primary keys against ``objects.all()``,
    which makes forged IDs a write-time authorization bypass.  Viewsets pass
    the DRF request in serializer context automatically.
    """
    if property_obj is None:
        return
    request = serializer.context.get('request')
    user = getattr(request, 'user', None)
    if user is None or user.is_superuser:
        return
    if not get_accessible_properties(user).filter(pk=property_obj.pk).exists():
        raise serializers.ValidationError({field: 'You do not have access to this property.'})


def _validate_room_belongs_to_property(room, property_obj):
    if room is not None and property_obj is not None and room.property_id != property_obj.pk:
        raise serializers.ValidationError({'room': 'The room must belong to the selected property.'})


class InventoryCategoryCodeField(serializers.Field):
    """Keep the public Inventory.category contract as a category code string."""

    default_error_messages = {'invalid': 'Category must be a code string.'}

    def to_representation(self, value):
        return value.code if value is not None else None

    def to_internal_value(self, data):
        if not isinstance(data, str) or not data.strip():
            self.fail('invalid')
        return data


def _resolve_inventory_category(code, property_obj, *, allow_inactive=False):
    tenant_id = getattr(property_obj, 'tenant_id', None)
    if tenant_id is None:
        raise serializers.ValidationError({
            'category': 'The selected property must belong to a tenant before a category can be assigned.'
        })
    # ``safety`` was the deployed CharField value; retain it as an input alias.
    canonical_code = 'safety_equipment' if code.lower() == 'safety' else code
    queryset = InventoryCategory.objects.filter(
        tenant_id=tenant_id,
        code=canonical_code,
    )
    if not allow_inactive:
        queryset = queryset.filter(is_active=True)
    category = queryset.first()
    if category is None:
        raise serializers.ValidationError({
            'category': 'Unknown or inactive category for this property tenant.'
        })
    return category


def _validate_machine_ids_in_request_scope(serializer, machine_ids):
    if not machine_ids:
        return []
    if len(machine_ids) != len(set(machine_ids)):
        raise serializers.ValidationError({'machine_ids': 'Duplicate machine_ids are not allowed.'})
    machines = list(Machine.objects.select_related('property').filter(machine_id__in=machine_ids))
    if len(machines) != len(set(machine_ids)):
        raise serializers.ValidationError({'machine_ids': 'One or more machine_ids are invalid.'})
    property_ids = {machine.property_id for machine in machines}
    if len(property_ids) > 1:
        raise serializers.ValidationError({'machine_ids': 'All machines must belong to the same property.'})
    _validate_request_property_access(serializer, machines[0].property, 'machine_ids')
    request = serializer.context.get('request')
    user = getattr(request, 'user', None)
    if user is not None and not user.is_superuser:
        if not get_operable_properties(user).filter(pk=machines[0].property_id).exists():
            raise serializers.ValidationError({'machine_ids': 'Your role cannot modify maintenance for this property.'})
    return machines


def is_raw_auth_identifier(value):
    if value is None:
        return False
    text = str(value).strip()
    return (
        text.startswith(RAW_AUTH_PREFIXES)
        or text.lower() in {'null', 'undefined', '[object object]'}
    )


def get_user_display_name(user, fallback='Unknown Technician'):
    if not user:
        return fallback

    profile = getattr(user, 'userprofile', None)
    profile_full_name = getattr(profile, 'full_name', None)
    candidates = [
        profile_full_name,
        user.get_full_name().strip() if hasattr(user, 'get_full_name') else None,
        getattr(user, 'name', None),
        getattr(user, 'email', None),
        getattr(user, 'username', None),
    ]

    for candidate in candidates:
        if candidate is None:
            continue
        value = str(candidate).strip()
        if value and not is_raw_auth_identifier(value):
            return value

    return fallback


def get_user_public_username(user, fallback=''):
    if not user:
        return fallback

    username = str(getattr(user, 'username', '') or '').strip()
    if username and not is_raw_auth_identifier(username):
        return username

    display_name = get_user_display_name(user, fallback=fallback or 'User')
    return '' if display_name == 'Unknown Technician' and not fallback else display_name
