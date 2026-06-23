"""Timezone helpers for tenant configuration."""

from django.utils import timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones


DEFAULT_TENANT_TIMEZONE = 'Asia/Bangkok'

COMMON_TIMEZONES = [
    'Asia/Bangkok',
    'UTC',
    'Asia/Singapore',
    'Asia/Kuala_Lumpur',
    'Asia/Jakarta',
    'Asia/Manila',
    'Asia/Ho_Chi_Minh',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Hong_Kong',
    'Asia/Dubai',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Australia/Sydney',
]


def is_valid_timezone(value):
    if not value or not isinstance(value, str):
        return False
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError:
        return False
    return True


def get_zoneinfo(value=None):
    """Return a ZoneInfo object, falling back to the tenant default."""
    name = value if is_valid_timezone(value) else DEFAULT_TENANT_TIMEZONE
    return ZoneInfo(name)


def tenant_timezone(tenant=None):
    return get_zoneinfo(getattr(tenant, 'timezone', None))


def property_timezone(property_obj=None):
    return tenant_timezone(getattr(property_obj, 'tenant', None))


def object_timezone(obj=None):
    """Best-effort timezone lookup for tenant/property/job/PM-like objects."""
    if obj is None:
        return get_zoneinfo()
    if hasattr(obj, 'timezone'):
        return tenant_timezone(obj)
    if hasattr(obj, 'tenant'):
        return tenant_timezone(getattr(obj, 'tenant', None))
    if hasattr(obj, 'property'):
        return property_timezone(getattr(obj, 'property', None))
    area = getattr(obj, 'area', None)
    if area is not None and getattr(area, 'property', None) is not None:
        return property_timezone(area.property)
    job = getattr(obj, 'job', None)
    if job is not None:
        return object_timezone(job)
    rooms = getattr(obj, 'rooms', None)
    if rooms is not None:
        try:
            first_property = rooms.first().properties.select_related('tenant').first()
            if first_property is not None:
                return property_timezone(first_property)
        except Exception:
            pass
    machines = getattr(obj, 'machines', None)
    if machines is not None:
        try:
            machine = machines.select_related('property__tenant').first()
            if machine and machine.property:
                return property_timezone(machine.property)
        except Exception:
            pass
    return get_zoneinfo()


def localtime_for(obj=None, value=None):
    return timezone.localtime(value or timezone.now(), object_timezone(obj))


def local_date_bounds(now):
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start, end


def timezone_choices():
    """Return all available IANA timezone choices with common zones first."""
    all_zones = sorted(available_timezones())
    ordered = [zone for zone in COMMON_TIMEZONES if zone in all_zones]
    ordered.extend(zone for zone in all_zones if zone not in ordered)
    return [(zone, zone) for zone in ordered]


def timezone_options():
    """Return grouped timezone options suitable for an API select component."""
    all_zones = sorted(available_timezones())
    common = [zone for zone in COMMON_TIMEZONES if zone in all_zones]
    return {
        'default': DEFAULT_TENANT_TIMEZONE,
        'common': common,
        'all': all_zones,
    }
