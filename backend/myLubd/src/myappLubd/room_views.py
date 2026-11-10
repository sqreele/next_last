"""Room API operations and canonical property scoping."""
import logging

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Area, Room
from .room_names import floor_from_room_name
from .serializers import RoomSerializer
from .tenancy import get_accessible_properties

logger = logging.getLogger(__name__)


class RoomViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = RoomSerializer

    _floor_from_room_name = staticmethod(floor_from_room_name)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        if str(request.query_params.get('floors_only', '')).lower() in ['1', 'true', 'yes']:
            floors = sorted(
                {floor for floor in (self._floor_from_room_name(room.name) for room in queryset) if floor},
                key=lambda floor: int(floor) if str(floor).isdigit() else str(floor)
            )
            return Response({'floors': floors})

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def get_queryset(self):
        """
        Return rooms that belong to properties the user has access to.
        Supports dependent Create Job dropdown filters:
        - property/property_id scoping
        - area_id validation/scoping to the area's property
        - floor filtering derived from room number format
        """
        user = self.request.user
        logger.info(f"User {user.username} requesting rooms")

        base_queryset = Room.objects.select_related('property')
        property_id = self.request.query_params.get('property') or self.request.query_params.get('property_id')
        area_id = self.request.query_params.get('area_id') or self.request.query_params.get('area')
        floor = self.request.query_params.get('floor')
        is_active = self.request.query_params.get('is_active')

        if area_id:
            area_qs = Area.objects.select_related('property').filter(
                id=area_id,
                property__in=get_accessible_properties(user),
            )
            area_obj = area_qs.first()
            if not area_obj:
                return Room.objects.none()
            if property_id and str(property_id) not in {str(area_obj.property.property_id), str(area_obj.property_id)}:
                return Room.objects.none()
            property_id = area_obj.property.property_id

        if is_active is not None:
            active_value = str(is_active).lower() in ['1', 'true', 'yes']
            base_queryset = base_queryset.filter(is_active=active_value)

        def apply_floor_filter(queryset):
            if not floor:
                return queryset
            floor_str = str(floor).strip()
            if not floor_str:
                return queryset
            return queryset.filter(
                Q(name__regex=rf'(^|\D)1{floor_str}[0-9]{{2}}(\D|$)') |
                Q(name__regex=rf'(^|\D){floor_str}[0-9]{{2,}}(\D|$)')
            )

        def apply_property_filter(queryset, prop_value):
            if not prop_value:
                return queryset
            property_q = Q(property__property_id=prop_value)
            if str(prop_value).isdigit():
                property_q |= Q(property__id=int(prop_value))
            return queryset.filter(property_q)

        user_properties = get_accessible_properties(user)
        logger.info(f"User has access to {user_properties.count()} properties")

        if property_id:
            property_lookup = Q(property_id=property_id)
            if str(property_id).isdigit():
                property_lookup |= Q(id=int(property_id))
            property_qs = user_properties.filter(property_lookup)
            if not property_qs.exists():
                logger.warning(f"User {user.username} doesn't have access to property {property_id}")
                return Room.objects.none()
            queryset = Room.objects.filter(property__in=property_qs)
        else:
            queryset = Room.objects.filter(property__in=user_properties)

        return apply_floor_filter(queryset)

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        """Return a CSV template that matches `bulk_import`'s schema."""
        import csv as _csv
        from io import StringIO

        buf = StringIO()
        writer = _csv.writer(buf)
        writer.writerow(['name', 'room_type', 'is_active', 'property_id'])
        writer.writerow(['101', 'Standard', 'true', ''])
        writer.writerow(['102', 'Standard', 'true', ''])
        writer.writerow(['201', 'Suite', 'true', ''])
        body = buf.getvalue()
        response = HttpResponse(body, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="pcms-rooms-template.csv"'
        return response

    @action(detail=False, methods=['post'], url_path='bulk-import')
    def bulk_import(self, request):
        """Create rooms from a CSV upload.

        Required: name. Optional: room_type (default 'Standard'), is_active
        (default true), property_id (defaults to ?property_id= query param).
        Existing rooms (same name) may only be reused for their existing
        canonical Property.  Room ownership is immutable and globally unique
        names must never be attached to a second Property.

        Tenant scoping: the request user must have access to every property
        being targeted. Only the documented superuser break-glass scope is
        represented by ``get_accessible_properties``."""
        import csv as _csv
        from io import StringIO

        file_obj = request.FILES.get('file') if hasattr(request, 'FILES') else None
        if file_obj is not None:
            try:
                text = file_obj.read().decode('utf-8-sig')
            except UnicodeDecodeError:
                return Response(
                    {'error': 'File must be UTF-8 encoded CSV.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            text = (request.data or {}).get('csv', '') if isinstance(request.data, dict) else ''
        text = (text or '').strip()
        if not text:
            return Response(
                {'error': 'Send a CSV either as `file` (multipart) or `csv` (JSON string).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(text.encode('utf-8')) > 256 * 1024:
            return Response(
                {'error': 'CSV is larger than 256 KB — split it into smaller batches.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reader = _csv.DictReader(StringIO(text))
        if reader.fieldnames is None:
            return Response({'error': 'CSV is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        accessible_props = list(get_accessible_properties(request.user))
        if not accessible_props:
            return Response(
                {'error': 'You have no property access — cannot import rooms.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        prop_lookup = {}
        for prop in accessible_props:
            prop_lookup[str(prop.id)] = prop
            if prop.property_id:
                prop_lookup[str(prop.property_id)] = prop

        default_prop_key = (
            request.query_params.get('property_id') or
            (request.data.get('property_id') if isinstance(request.data, dict) else None)
        )
        default_prop = prop_lookup.get(str(default_prop_key)) if default_prop_key else None

        created = []
        attached = []
        errors = []

        for row_index, raw_row in enumerate(reader, start=2):
            row = {(k or '').strip().lower(): (v or '').strip() for k, v in raw_row.items() if k}
            name = row.get('name', '')
            if not name:
                errors.append({'row': row_index, 'error': 'name is required.'})
                continue
            room_type = (row.get('room_type') or 'Standard')[:50]
            is_active_raw = (row.get('is_active') or 'true').lower()
            is_active = is_active_raw not in ('0', 'false', 'no', 'inactive')

            target_prop = prop_lookup.get(row.get('property_id', '')) if row.get('property_id') else default_prop
            if target_prop is None:
                errors.append({
                    'row': row_index,
                    'error': 'property_id missing or not accessible to you.',
                })
                continue

            try:
                with transaction.atomic():
                    existing = Room.objects.select_for_update().filter(name=name[:100]).first()
                    if existing is not None:
                        if existing.property_id != target_prop.pk:
                            errors.append({
                                'row': row_index,
                                'error': (
                                    'ROOM PROPERTY CONFLICT: '
                                    f'room_id={existing.room_id}, name={existing.name}, '
                                    f'existing_property={existing.property_id}, '
                                    f'requested_property={target_prop.property_id}.'
                                ),
                            })
                            continue
                        attached.append({'row': row_index, 'room_id': existing.room_id, 'name': existing.name})
                        continue

                    room = Room.objects.create(
                        name=name[:100],
                        room_type=room_type,
                        is_active=is_active,
                        property=target_prop,
                    )
                    created.append({'row': row_index, 'room_id': room.room_id, 'name': room.name})
            except Exception as exc:  # pragma: no cover - defensive
                errors.append({'row': row_index, 'error': str(exc)})

        return Response(
            {
                'created_count': len(created),
                'attached_count': len(attached),
                'error_count': len(errors),
                'created': created[:50],
                'attached': attached[:50],
                'errors': errors[:200],
            },
            status=status.HTTP_201_CREATED if (created or attached) and not errors
            else (status.HTTP_207_MULTI_STATUS if (created or attached) else status.HTTP_400_BAD_REQUEST),
        )
