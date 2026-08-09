import logging
import re

from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Area, Property, Room, Topic
from ..serializers import AreaSerializer, RoomSerializer, TopicSerializer


logger = logging.getLogger(__name__)


class RoomViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = RoomSerializer

    @staticmethod
    def _floor_from_room_name(room_name):
        room_name = str(room_name or '').strip()
        if not room_name:
            return None

        match = re.search(r'\d+', room_name)
        if not match:
            return None

        room_code = match.group(0)
        if len(room_code) == 4 and room_code.startswith('1') and room_code[1].isdigit():
            return room_code[1]
        if len(room_code) >= 3:
            return room_code[0]
        return None

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

        base_queryset = Room.objects.prefetch_related('properties')
        property_id = self.request.query_params.get('property') or self.request.query_params.get('property_id')
        area_id = self.request.query_params.get('area_id') or self.request.query_params.get('area')
        floor = self.request.query_params.get('floor')
        is_active = self.request.query_params.get('is_active')

        if area_id:
            area_qs = Area.objects.select_related('property').filter(id=area_id)
            if not (user.is_staff or user.is_superuser or user.username == 'admin'):
                area_qs = area_qs.filter(property__users=user)
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
            property_q = Q(properties__property_id=prop_value)
            if str(prop_value).isdigit():
                property_q |= Q(properties__id=int(prop_value))
            return queryset.filter(property_q)

        if user.is_superuser or user.is_staff or user.username == 'admin':
            queryset = apply_property_filter(base_queryset, property_id)
            return apply_floor_filter(queryset).distinct()

        user_properties = Property.objects.filter(users=user)
        logger.info(f"User has access to {user_properties.count()} properties")

        if property_id:
            property_lookup = Q(property_id=property_id)
            if str(property_id).isdigit():
                property_lookup |= Q(id=int(property_id))
            property_qs = user_properties.filter(property_lookup)
            if not property_qs.exists():
                logger.warning(f"User {user.username} doesn't have access to property {property_id}")
                return Room.objects.none()
            queryset = Room.objects.filter(properties__in=property_qs)
        else:
            queryset = Room.objects.filter(properties__in=user_properties)

        return apply_floor_filter(queryset).distinct()

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
        Existing rooms (same name) get attached to the target property
        instead of being recreated, so re-uploading the same sheet is
        idempotent — Room.name has a unique constraint globally.

        Tenant scoping: the request user must have access to every property
        being targeted. Staff/superuser bypass."""
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

        is_staff_bypass = request.user.is_staff or request.user.is_superuser
        accessible_props = list(Property.objects.filter(users=request.user))
        if not accessible_props and not is_staff_bypass:
            return Response(
                {'error': 'You have no property access — cannot import rooms.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        prop_lookup = {}
        prop_source = Property.objects.all() if is_staff_bypass else accessible_props
        for prop in prop_source:
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
            if target_prop is None and not is_staff_bypass:
                errors.append({
                    'row': row_index,
                    'error': 'property_id missing or not accessible to you.',
                })
                continue

            try:
                existing = Room.objects.filter(name=name[:100]).first()
                if existing is not None:
                    if target_prop is not None:
                        existing.properties.add(target_prop)
                    attached.append({'row': row_index, 'room_id': existing.room_id, 'name': existing.name})
                    continue

                room = Room.objects.create(
                    name=name[:100],
                    room_type=room_type,
                    is_active=is_active,
                )
                if target_prop is not None:
                    room.properties.add(target_prop)
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


class TopicViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer

    def _selected_property_queryset(self):
        property_filter = (
            self.request.query_params.get('property') or
            self.request.query_params.get('property_id')
        )
        if not property_filter or str(property_filter).lower() == 'all':
            return Property.objects.none()

        selected_properties = Property.objects.filter(
            Q(property_id=str(property_filter)) |
            Q(name=str(property_filter))
        )
        if str(property_filter).isdigit():
            selected_properties = selected_properties | Property.objects.filter(id=int(property_filter))

        return selected_properties.distinct()

    def get_queryset(self):
        """
        Return topics that are associated with jobs in properties the user has access to.
        Admin/staff users can see all topics.
        """
        user = self.request.user
        
        include_hidden = self.request.query_params.get('include_hidden', 'false').lower() == 'true'
        property_filter = (
            self.request.query_params.get('property') or
            self.request.query_params.get('property_id')
        )
        selected_properties = self._selected_property_queryset()
        requested_property_filter = bool(property_filter and str(property_filter).lower() != 'all')
        has_property_filter = selected_properties.exists()
        if requested_property_filter and not has_property_filter:
            return Topic.objects.none()

        def filter_topics_by_properties(queryset, properties):
            return queryset.filter(
                Q(jobs__rooms__properties__in=properties) |
                Q(jobs__area__property__in=properties) |
                Q(preventive_maintenances__job__rooms__properties__in=properties) |
                Q(preventive_maintenances__job__area__property__in=properties)
            ).distinct()

        # Admin users can access all topics, with optional hidden topic filtering
        if user.is_superuser or user.is_staff:
            queryset = Topic.objects.all()
            if has_property_filter:
                queryset = filter_topics_by_properties(queryset, selected_properties)
            if not include_hidden:
                queryset = queryset.filter(is_visible_in_create_job=True)
            return queryset
        
        # Get properties the user has access to
        accessible_properties = Property.objects.filter(users=user)
        if has_property_filter:
            accessible_properties = accessible_properties.filter(id__in=selected_properties.values_list('id', flat=True))
        
        # Return topics that are used in jobs within user's accessible properties
        queryset = filter_topics_by_properties(Topic.objects.all(), accessible_properties)

        if not include_hidden:
            queryset = queryset.filter(is_visible_in_create_job=True)

        return queryset


class AreaViewSet(viewsets.ModelViewSet):
    """CRUD for property areas/zones with tenant (property) isolation."""
    permission_classes = [IsAuthenticated]
    serializer_class = AreaSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Area.objects.select_related('property').all()

        if not (user.is_staff or user.is_superuser):
            accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
            qs = qs.filter(property_id__in=accessible_property_ids)

        property_filter = self.request.query_params.get('property_id') or self.request.query_params.get('property')
        if property_filter:
            property_q = Q(property__property_id=property_filter)
            if str(property_filter).isdigit():
                property_q |= Q(property_id=int(property_filter))
            qs = qs.filter(property_q)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            val = str(is_active).lower() in ['1', 'true', 'yes']
            qs = qs.filter(is_active=val)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return qs.order_by('property__name', 'name')

    def perform_create(self, serializer):
        property_obj = serializer.validated_data.get('property')
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            if not Property.objects.filter(id=property_obj.id, users=user).exists():
                raise PermissionDenied("You do not have access to this property.")
        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        new_property = serializer.validated_data.get('property', instance.property)
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            if not Property.objects.filter(id=new_property.id, users=user).exists():
                raise PermissionDenied("You do not have access to this property.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Soft-delete: mark inactive rather than removing the row so historical
        jobs keep their area reference."""
        instance = self.get_object()
        hard = str(request.query_params.get('hard', '')).lower() in ['1', 'true', 'yes']
        if hard and (request.user.is_staff or request.user.is_superuser):
            instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(AreaSerializer(instance).data, status=status.HTTP_200_OK)


