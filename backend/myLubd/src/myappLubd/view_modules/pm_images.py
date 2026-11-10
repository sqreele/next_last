"""Pm Images definitions."""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from ..models import PreventiveMaintenance, PreventiveMaintenanceImage
from rest_framework.parsers import MultiPartParser, FormParser
from ..serializers import PreventiveMaintenanceDetailSerializer
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
import logging
import uuid
from django.http import Http404
from ..tenancy import enforce_storage_limit, lock_tenants_for_membership_change, get_operable_properties
from ..plan_capabilities import require_request_feature
from ..subscription_permissions import require_subscription_write, resolve_tenant_from_target
from .common import canonical_pm_queryset

logger = logging.getLogger('myappLubd.views')


class PreventiveMaintenanceImageUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    MAX_IMAGES_PER_PM = 10

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        require_request_feature(request, 'preventive_maintenance')

    def _prepare_image(self, image_file):
        from ..job_image_processing import PMImageValidationError, validate_and_optimize_pm_image
        try:
            payload, checksum = validate_and_optimize_pm_image(image_file)
        except PMImageValidationError as exc:
            raise ValidationError({'images': str(exc)}) from exc
        return {
            'payload': payload,
            'checksum': checksum,
        }

    def _requested_images(self, request):
        requested = []
        general_files = request.FILES.getlist('images')
        if general_files:
            image_type = str(request.data.get('image_type') or '').strip().lower()
            if image_type not in {'before', 'after'}:
                raise ValidationError({'image_type': 'Image type must be before or after.'})
            requested.extend((image_type, image_file) for image_file in general_files)

        # Backward-compatible scalar fields still use the same authoritative
        # validation, capacity, optimization, and persistence pipeline.
        for image_type, field_name in (('before', 'before_image'), ('after', 'after_image')):
            requested.extend(
                (image_type, image_file)
                for image_file in request.FILES.getlist(field_name)
            )

        if not requested:
            raise ValidationError({'images': 'Select at least one image to upload.'})
        return requested

    def _serialize_pm(self, request, pm):
        refreshed = canonical_pm_queryset(
            request.user,
            request.query_params.get('property_id'),
        ).get(pk=pm.pk)
        return PreventiveMaintenanceDetailSerializer(
            refreshed,
            context={'request': request},
        ).data

    def _lock_scoped_pm(self, request, pm_id, property_id):
        scoped_queryset = canonical_pm_queryset(request.user, property_id)
        scoped_pm = get_object_or_404(scoped_queryset, pm_id__iexact=pm_id)
        pm = PreventiveMaintenance.objects.select_for_update().get(pk=scoped_pm.pk)
        if not scoped_queryset.filter(pk=pm.pk).exists():
            raise Http404('Preventive maintenance record not found.')
        return pm

    def post(self, request, pm_id):
        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            raise ValidationError({'property_id': 'An active property is required.'})
        if not request.user.is_superuser and not get_operable_properties(request.user).filter(
            property_id=property_id
        ).exists():
            raise PermissionDenied('Your role cannot upload PM images for this property.')

        prepared = []
        batch_checksums = set()
        for image_type, image_file in self._requested_images(request):
            item = self._prepare_image(image_file)
            if item['checksum'] in batch_checksums:
                raise ValidationError({'images': 'Duplicate images are not allowed.'})
            batch_checksums.add(item['checksum'])
            item['image_type'] = image_type
            prepared.append(item)

        created_files = []
        try:
            with transaction.atomic():
                pm = self._lock_scoped_pm(request, pm_id, property_id)
                tenant = resolve_tenant_from_target(pm)
                locked_tenant = lock_tenants_for_membership_change(tenant)[tenant.pk]
                require_subscription_write(
                    request,
                    locked_tenant,
                    operation='image_upload',
                    resource_type='preventive_maintenance_image',
                )
                enforce_storage_limit(
                    locked_tenant,
                    sum(len(item['payload']) for item in prepared),
                )
                existing_count = (
                    pm.images.count()
                    + int(bool(pm.before_image))
                    + int(bool(pm.after_image))
                )
                if existing_count + len(prepared) > self.MAX_IMAGES_PER_PM:
                    raise ValidationError({
                        'images': 'A preventive maintenance record can contain a maximum of 10 images.'
                    })

                existing_checksums = set(pm.images.values_list('checksum', flat=True))
                if existing_checksums.intersection(batch_checksums):
                    raise ValidationError({'images': 'Duplicate images are not allowed.'})

                for item in prepared:
                    image = PreventiveMaintenanceImage(
                        preventive_maintenance=pm,
                        image_type=item['image_type'],
                        checksum=item['checksum'],
                        uploaded_by=request.user,
                    )
                    image.image = ContentFile(
                        item['payload'],
                        name=f'pm-image-{uuid.uuid4().hex}.jpg',
                    )
                    image._image_preoptimized = True
                    try:
                        image.save()
                    except Exception:
                        if image.image and image.image.name:
                            created_files.append((image.image.storage, image.image.name))
                        raise
                    created_files.append((image.image.storage, image.image.name))
        except Exception:
            for storage_backend, image_name in created_files:
                try:
                    storage_backend.delete(image_name)
                except Exception:
                    logger.exception('Unable to clean failed PM image upload %s', image_name)
            raise

        return Response(self._serialize_pm(request, pm), status=status.HTTP_201_CREATED)


class PreventiveMaintenanceImageDeleteView(PreventiveMaintenanceImageUploadView):
    def delete(self, request, pm_id, image_id):
        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            raise ValidationError({'property_id': 'An active property is required.'})
        if not request.user.is_superuser and not get_operable_properties(request.user).filter(
            property_id=property_id
        ).exists():
            raise PermissionDenied('Your role cannot delete PM images for this property.')

        with transaction.atomic():
            pm = self._lock_scoped_pm(request, pm_id, property_id)
            require_subscription_write(
                request,
                resolve_tenant_from_target(pm),
                operation='image_delete',
                resource_type='preventive_maintenance_image',
            )
            if image_id in {'legacy-before', 'legacy-after'}:
                image_type = image_id.removeprefix('legacy-')
                field_name = f'{image_type}_image'
                jpeg_field_name = f'{image_type}_image_jpeg_path'
                field_file = getattr(pm, field_name)
                if not field_file:
                    raise Http404('PM image not found.')
                storage_backend = field_file.storage
                image_name = field_file.name
                jpeg_name = getattr(pm, jpeg_field_name)
                setattr(pm, field_name, None)
                setattr(pm, jpeg_field_name, None)
                pm.save(update_fields=[field_name, jpeg_field_name, 'updated_at'])

                def delete_legacy_files():
                    try:
                        storage_backend.delete(image_name)
                        if jpeg_name and jpeg_name != image_name:
                            default_storage.delete(jpeg_name)
                    except Exception:
                        logger.exception(
                            'Unable to delete legacy PM image files for %s',
                            pm.pm_id,
                        )

                transaction.on_commit(delete_legacy_files)
            else:
                if not str(image_id).isdigit():
                    raise Http404('PM image not found.')
                image = get_object_or_404(
                    PreventiveMaintenanceImage,
                    pk=int(image_id),
                    preventive_maintenance=pm,
                )
                image.delete()

        return Response(self._serialize_pm(request, pm), status=status.HTTP_200_OK)
