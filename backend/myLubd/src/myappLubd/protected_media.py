"""Authenticated, ownership-scoped delivery for customer-uploaded media."""

import mimetypes
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .models import (
    Inventory,
    JobImage,
    Machine,
    MaintenanceTaskImage,
    PreventiveMaintenance,
    PreventiveMaintenanceImage,
    UserProfile,
    WorkspaceReport,
)
from .security_audit import audit_event
from .throttles import ProtectedMediaProbeThrottle, ProtectedMediaUserThrottle
from .tenancy import get_accessible_properties, get_user_tenants


PROTECTED_MEDIA_BROWSER_PREFIX = '/api/protected-media'
PROTECTED_MEDIA_API_PREFIX = '/api/v1/protected-media'
PROTECTED_MEDIA_INTERNAL_PREFIX = '/_protected_media'


def protected_media_url(media_type, object_id, variant='image'):
    """Return the same-origin browser URL handled by the authenticated Next proxy."""
    if object_id is None:
        return None
    return f'{PROTECTED_MEDIA_BROWSER_PREFIX}/{media_type}/{object_id}/{variant}/'


def protected_media_api_url(media_type, object_id, variant='image'):
    """Return the Django endpoint used by session-authenticated admin pages."""
    if object_id is None:
        return None
    return f'{PROTECTED_MEDIA_API_PREFIX}/{media_type}/{object_id}/{variant}/'


def _single_pm_property(pm):
    if pm.job_id:
        job_property = getattr(pm.job, 'property', None)
        if job_property is None:
            return None
        machine_property_ids = set(pm.machines.values_list('property_id', flat=True))
        if machine_property_ids and machine_property_ids != {job_property.pk}:
            return None
        return job_property
    property_ids = set(pm.machines.values_list('property_id', flat=True))
    if len(property_ids) != 1:
        return None
    return pm.machines.first().property


def _single_task_property(task_image):
    property_ids = set(task_image.task.machines.values_list('property_id', flat=True))
    if len(property_ids) != 1:
        return None
    return task_image.task.machines.first().property


def _profile_is_visible_to(user, profile):
    if user.is_superuser or profile.user_id == user.pk:
        return True
    target_property_ids = get_accessible_properties(profile.user).values('pk')
    return get_accessible_properties(user).filter(pk__in=target_property_ids).exists()


def _resolve_media(media_type, object_id, variant):
    """Resolve only allowlisted DB fields and return (field/path, Property, profile)."""
    if media_type == 'job-image':
        obj = JobImage.objects.select_related('job__property').filter(pk=object_id).first()
        variants = {'image': obj.image if obj else None, 'jpeg': obj.jpeg_path if obj else None}
        return (variants.get(variant), obj.job.property if obj and obj.job.property_id else None, None)

    if media_type == 'pm':
        obj = PreventiveMaintenance.objects.select_related('job__property').filter(pk=object_id).first()
        variants = {
            'before': obj.before_image if obj else None,
            'after': obj.after_image if obj else None,
            'before-jpeg': obj.before_image_jpeg_path if obj else None,
            'after-jpeg': obj.after_image_jpeg_path if obj else None,
        }
        return (variants.get(variant), _single_pm_property(obj) if obj else None, None)

    if media_type == 'pm-image':
        obj = PreventiveMaintenanceImage.objects.select_related(
            'preventive_maintenance__job__property'
        ).filter(pk=object_id).first()
        pm = obj.preventive_maintenance if obj else None
        return (obj.image if obj and variant == 'image' else None, _single_pm_property(pm) if pm else None, None)

    if media_type == 'machine':
        obj = Machine.objects.select_related('property').filter(pk=object_id).first()
        return (obj.image if obj and variant == 'image' else None, obj.property if obj else None, None)

    if media_type == 'task-image':
        obj = MaintenanceTaskImage.objects.select_related('task').filter(pk=object_id).first()
        variants = {'image': obj.image_url if obj else None, 'jpeg': obj.jpeg_path if obj else None}
        return (variants.get(variant), _single_task_property(obj) if obj else None, None)

    if media_type == 'inventory':
        obj = Inventory.objects.select_related('property').filter(pk=object_id).first()
        return (obj.image if obj and variant == 'image' else None, obj.property if obj else None, None)

    if media_type == 'workspace-report':
        obj = WorkspaceReport.objects.select_related('property').filter(pk=object_id).first()
        field = None
        if obj and variant.startswith('image-'):
            suffix = variant.removeprefix('image-')
            is_jpeg = suffix.endswith('-jpeg')
            number = suffix.removesuffix('-jpeg') if is_jpeg else suffix
            if number.isdigit() and 1 <= int(number) <= 15:
                field_name = f'image_{number}_jpeg_path' if is_jpeg else f'image_{number}'
                field = getattr(obj, field_name, None)
        return (field, obj.property if obj else None, None)

    if media_type == 'profile':
        profile = UserProfile.objects.select_related('user').filter(pk=object_id).first()
        field = profile.profile_image if profile and variant == 'image' else None
        return (field, None, profile)

    return (None, None, None)


def _safe_media_file(media_value):
    """Resolve an authorized stored name below MEDIA_ROOT, rejecting all escapes."""
    name = str(getattr(media_value, 'name', media_value) or '').strip().replace('\\', '/')
    relative = PurePosixPath(name)
    if not name or relative.is_absolute() or '..' in relative.parts:
        raise Http404

    root = Path(settings.MEDIA_ROOT).resolve()
    try:
        candidate = (root / Path(*relative.parts)).resolve(strict=True)
        candidate.relative_to(root)
    except (OSError, RuntimeError, ValueError):
        raise Http404
    if not candidate.is_file():
        raise Http404
    return candidate, relative.as_posix()


class ProtectedMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        user = getattr(self.request, 'user', None)
        throttle_class = (
            ProtectedMediaUserThrottle
            if user is not None and getattr(user, 'is_authenticated', False)
            else ProtectedMediaProbeThrottle
        )
        return [throttle_class()]

    def check_permissions(self, request):
        # DRF normally checks permissions before throttles. Count anonymous
        # enumeration attempts before IsAuthenticated rejects them; below the
        # threshold the existing 403 remains unchanged, and no target is
        # resolved before a possible 429.
        if not getattr(request.user, 'is_authenticated', False):
            self.check_throttles(request)
        return super().check_permissions(request)

    def get(self, request, media_type, object_id, variant):
        media_value, property_obj, profile = _resolve_media(media_type, object_id, variant)
        if not media_value:
            raise Http404

        if profile is not None:
            authorized = _profile_is_visible_to(request.user, profile)
        else:
            authorized = bool(
                property_obj
                and property_obj.tenant_id
                and get_accessible_properties(request.user).filter(pk=property_obj.pk).exists()
            )
        if not authorized:
            reason_code = 'target_not_found_or_hidden'
            tenant = getattr(property_obj, 'tenant', None)
            if property_obj is not None:
                if request.user.is_superuser:
                    reason_code = 'target_not_found_or_hidden'
                else:
                    same_tenant = get_user_tenants(request.user).filter(pk=property_obj.tenant_id).exists()
                    reason_code = 'property_not_granted' if same_tenant else 'cross_tenant'
            audit_event(
                'security.protected_media.denied', 'denied', request=request,
                reason_code=reason_code, tenant=tenant, property_obj=property_obj,
                target_type=media_type, target_id=object_id,
                target_user_id=getattr(profile, 'user_id', None),
            )
            raise Http404

        path, relative_name = _safe_media_file(media_value)
        content_type = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        if getattr(settings, 'PROTECTED_MEDIA_USE_X_ACCEL', False):
            response = HttpResponse(content_type=content_type)
            response['X-Accel-Redirect'] = (
                f'{PROTECTED_MEDIA_INTERNAL_PREFIX}/{quote(relative_name, safe="/")}'
            )
        else:
            response = FileResponse(path.open('rb'), content_type=content_type)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
