"""Pm Images definitions."""
from rest_framework import serializers
from ..tenancy import get_operable_properties
from .users import UserSummarySerializer


PM_IMAGE_LIMIT = 10


def _pm_image_url(request, field_file):
    if not field_file:
        return None
    try:
        return request.build_absolute_uri(field_file.url) if request else field_file.url
    except (ValueError, AttributeError):
        return None


def serialize_pm_images(obj, request=None):
    """Return canonical related evidence plus explicitly marked legacy fields."""
    rows = []
    for image in obj.images.all():
        rows.append({
            'id': image.pk,
            'pm_id': obj.pm_id,
            'image_type': image.image_type,
            'image_url': _pm_image_url(request, image.image),
            'uploaded_at': image.uploaded_at,
            'uploaded_by': (
                UserSummarySerializer(image.uploaded_by).data
                if image.uploaded_by_id
                else None
            ),
            'is_legacy': False,
        })

    for image_type, field_name in (('before', 'before_image'), ('after', 'after_image')):
        field_file = getattr(obj, field_name, None)
        if field_file:
            rows.append({
                'id': f'legacy-{image_type}',
                'pm_id': obj.pm_id,
                'image_type': image_type,
                'image_url': _pm_image_url(request, field_file),
                'uploaded_at': None,
                'uploaded_by': None,
                'is_legacy': True,
            })
    return rows


def get_pm_image_counts(obj):
    images = list(obj.images.all())
    before_count = sum(image.image_type == 'before' for image in images) + int(bool(obj.before_image))
    after_count = sum(image.image_type == 'after' for image in images) + int(bool(obj.after_image))
    total_count = before_count + after_count
    return {
        'before': before_count,
        'after': after_count,
        'total': total_count,
        'remaining': max(0, PM_IMAGE_LIMIT - total_count),
        'limit': PM_IMAGE_LIMIT,
    }


def validate_and_optimize_legacy_pm_images(instance, data):
    """Keep legacy scalar uploads safe and inside the shared ten-image cap."""
    from uuid import uuid4
    from django.core.files.base import ContentFile
    from ..job_image_processing import PMImageValidationError, validate_and_optimize_pm_image

    related_count = instance.images.count() if instance is not None else 0
    future_legacy_count = 0
    for field_name in ('before_image', 'after_image'):
        future_value = data.get(field_name, getattr(instance, field_name, None) if instance else None)
        future_legacy_count += int(bool(future_value))
    if related_count + future_legacy_count > PM_IMAGE_LIMIT:
        raise serializers.ValidationError({
            'images': 'A preventive maintenance record can contain a maximum of 10 images.'
        })

    existing_checksums = set(
        instance.images.values_list('checksum', flat=True)
        if instance is not None
        else []
    )
    request_checksums = set()
    for field_name in ('before_image', 'after_image'):
        image_file = data.get(field_name)
        if not image_file:
            continue
        try:
            payload, checksum = validate_and_optimize_pm_image(image_file)
        except PMImageValidationError as exc:
            raise serializers.ValidationError({field_name: str(exc)}) from exc
        if checksum in existing_checksums or checksum in request_checksums:
            raise serializers.ValidationError({field_name: 'Duplicate images are not allowed.'})
        request_checksums.add(checksum)
        data[field_name] = ContentFile(
            payload,
            name=f'pm-{field_name}-{uuid4().hex}.jpg',
        )
    return data


def user_can_operate_pm(serializer, obj):
    request = serializer.context.get('request')
    if request is None or not request.user.is_authenticated:
        return False
    if request.user.is_superuser:
        return True

    property_ids = {
        machine.property_id
        for machine in obj.machines.all()
        if machine.property_id
    }
    if obj.job_id and obj.job.property_id:
        property_ids.add(obj.job.property_id)
    if len(property_ids) != 1:
        return False

    if not hasattr(serializer, '_operable_property_ids'):
        serializer._operable_property_ids = set(
            get_operable_properties(request.user).values_list('pk', flat=True)
        )
    return property_ids.issubset(serializer._operable_property_ids)
