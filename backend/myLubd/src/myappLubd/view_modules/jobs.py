"""Jobs definitions."""
from django.contrib.auth import get_user_model
from django.contrib.admin.models import ADDITION, CHANGE, DELETION
from rest_framework import status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.utils import timezone
from django.utils.dateparse import parse_date
import csv
from django.db.models import Count, Q
from django.db import transaction
from ..models import Property, Room, Job, JobImage, PendingJobImage, JobComment
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from ..serializers import JobSerializer, JobDashboardSerializer, JobCommentSerializer, JobAssignmentCandidateSerializer
from ..job_property import resolve_external_property_reference
from ..job_history import log_job_action
from django.core.exceptions import ValidationError as DjangoValidationError
from django_filters.rest_framework import DjangoFilterBackend
from ..pagination import StandardResultsSetPagination
from django.shortcuts import get_object_or_404
import logging
import re
from datetime import datetime, time, timedelta
from django.http import StreamingHttpResponse
from django.http import Http404, FileResponse
from ..cache import CacheManager
from ..tenancy import get_accessible_jobs, accessible_property_ids, enforce_subscription_limit, enforce_storage_limit, get_accessible_properties, lock_tenants_for_membership_change, get_job_reassignable_properties, get_operable_properties
from ..timezones import property_timezone
from ..plan_capabilities import require_request_feature
from ..subscription_permissions import require_subscription_write
from .common import _ensure_user_can_operate_property, _ensure_user_can_reassign_job, _job_assignment_candidates, display_name_from_user

User = get_user_model()

logger = logging.getLogger('myappLubd.views')


class JobViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Job.objects.all()
    serializer_class = JobSerializer
    lookup_field = 'job_id'
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['description', 'job_id', 'rooms__name', 'machine__name', 'machine__machine_id']
    ordering_fields = ['created_at', 'updated_at', 'status', 'priority']
    ordering = ['-created_at']

    def get_queryset(self):
        """Filter jobs by user, property, and optional flags."""
        user = self.request.user
        # ✅ PERFORMANCE OPTIMIZATION: Comprehensive query optimization
        # Use select_related for foreign keys to avoid N+1 queries
        # Use prefetch_related for many-to-many and reverse foreign keys
        queryset = get_accessible_jobs(self.request.user).select_related(
            'user',           # Foreign key to User
            'user__userprofile',
            'updated_by',     # Foreign key to User
            'updated_by__userprofile',
            'property',       # Canonical Job ownership
            'area',           # Foreign key to Area
            'area__property',
            'machine',
        ).prefetch_related(
            'rooms__property',
            'topics',            # Many-to-many relationship
            'job_images',        # Reverse foreign key to JobImage
            'documents',
            'preventivemaintenance_set'  # Reverse foreign key
        )

        # Canonical ownership scope; Area/Rooms remain location detail only.
        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            queryset = queryset.filter(property_id__in=accessible_property_ids)

        # Filters
        property_filter = self.request.query_params.get('property_id') or self.request.query_params.get('property')
        topic_filter = self.request.query_params.get('topic_id') or self.request.query_params.get('topic')
        status_filter = self.request.query_params.get('status')
        is_pm_filter = self.request.query_params.get('is_preventivemaintenance')
        search_term = self.request.query_params.get('search')
        room_filter = self.request.query_params.get('room_id') or self.request.query_params.get('room')
        room_name_filter = self.request.query_params.get('room_name') or self.request.query_params.get('room_number')
        user_filter = self.request.query_params.get('user_id')

        if property_filter:
            # Request-facing Job scope uses only the public Property identity.
            # Database primary keys are not an active-property contract.
            queryset = queryset.filter(property__property_id=property_filter)

        if topic_filter and str(topic_filter).lower() != 'all':
            queryset = queryset.filter(topics__id=topic_filter)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if is_pm_filter is not None:
            # accept 'true'/'false' strings
            val = str(is_pm_filter).lower() in ['1', 'true', 'yes']
            queryset = queryset.filter(is_preventivemaintenance=val)

        if search_term:
            queryset = queryset.filter(
                Q(description__icontains=search_term) |
                Q(job_id__icontains=search_term)
            )

        if room_filter:
            queryset = queryset.filter(rooms__room_id=room_filter)

        if room_name_filter:
            queryset = queryset.filter(rooms__name__icontains=room_name_filter)

        area_filter = self.request.query_params.get('area') or self.request.query_params.get('area_id')
        if area_filter and str(area_filter).lower() != 'all':
            try:
                queryset = queryset.filter(area_id=int(area_filter))
            except (TypeError, ValueError):
                queryset = queryset.filter(area__name__iexact=str(area_filter))

        # Optional: filter by assigned user (supports numeric id or username)
        if user_filter and str(user_filter).lower() != 'all':
            try:
                queryset = queryset.filter(user_id=int(user_filter))
            except (TypeError, ValueError):
                queryset = queryset.filter(user__username=str(user_filter))

        return queryset.annotate(
            _comments_count=Count('comments', distinct=True)
        ).distinct()

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        """Return one authorized Property's Jobs for the interactive dashboard."""
        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            return Response(
                {'detail': 'Select a property to view jobs.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        property_scope = (
            Property.objects.all()
            if request.user.is_superuser
            else get_accessible_properties(request.user)
        )
        active_property = property_scope.filter(property_id=property_id).first()
        if active_property is None:
            return Response(
                {'detail': 'You do not have access to this property.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        jobs = get_accessible_jobs(self.request.user).filter(property=active_property).select_related(
            'machine',
            'user', 'property', 'area', 'area__property'
        ).prefetch_related('rooms', 'rooms__property', 'topics', 'job_images')

        search_term = str(request.query_params.get('search') or '').strip()
        priority_filter = str(request.query_params.get('priority') or '').strip()
        date_filter = str(request.query_params.get('date') or '').strip()
        status_filter = str(request.query_params.get('status') or '').strip()
        ordering = str(request.query_params.get('ordering') or '-created_at').strip()

        if priority_filter and priority_filter != 'all':
            if priority_filter not in dict(Job.PRIORITY_CHOICES):
                raise ValidationError({'priority': 'Invalid priority filter.'})
            jobs = jobs.filter(priority=priority_filter)
        if date_filter and date_filter != 'all':
            if date_filter not in {'today', 'week', 'month'}:
                raise ValidationError({'date': 'Invalid date filter.'})
            now = timezone.now()
            created_after = (
                now.replace(hour=0, minute=0, second=0, microsecond=0)
                if date_filter == 'today'
                else now - timedelta(days=7 if date_filter == 'week' else 30)
            )
            jobs = jobs.filter(created_at__gte=created_after)
        if search_term:
            jobs = jobs.filter(
                Q(job_id__icontains=search_term)
                | Q(description__icontains=search_term)
                | Q(remarks__icontains=search_term)
                | Q(rooms__name__icontains=search_term)
                | Q(area__name__icontains=search_term)
                | Q(machine__name__icontains=search_term)
                | Q(machine__machine_id__icontains=search_term)
                | Q(topics__title__icontains=search_term)
                | Q(user__username__icontains=search_term)
                | Q(user__first_name__icontains=search_term)
                | Q(user__last_name__icontains=search_term)
            )

        jobs = jobs.distinct()
        status_counts = jobs.aggregate(
            total=Count('id', distinct=True),
            pending=Count('id', filter=Q(status='pending'), distinct=True),
            in_progress=Count('id', filter=Q(status='in_progress'), distinct=True),
            waiting_sparepart=Count(
                'id', filter=Q(status='waiting_sparepart'), distinct=True
            ),
            completed=Count('id', filter=Q(status='completed'), distinct=True),
            cancelled=Count('id', filter=Q(status='cancelled'), distinct=True),
            defect=Count('id', filter=Q(is_defective=True), distinct=True),
            preventive_maintenance=Count(
                'id', filter=Q(is_preventivemaintenance=True), distinct=True
            ),
        )

        if status_filter and status_filter != 'all':
            if status_filter == 'defect':
                jobs = jobs.filter(is_defective=True)
            elif status_filter == 'preventive_maintenance':
                jobs = jobs.filter(is_preventivemaintenance=True)
            elif status_filter in dict(Job.STATUS_CHOICES):
                jobs = jobs.filter(status=status_filter)
            else:
                raise ValidationError({'status': 'Invalid status filter.'})

        allowed_ordering = {
            'created_at', '-created_at', 'updated_at', '-updated_at',
            'priority', '-priority', 'status', '-status',
        }
        if ordering not in allowed_ordering:
            raise ValidationError({'ordering': 'Invalid ordering.'})
        jobs = jobs.order_by(ordering, '-id')

        page = self.paginate_queryset(jobs)
        serializer = JobDashboardSerializer(
            page if page is not None else jobs,
            many=True,
            context=self.get_serializer_context(),
        )
        can_operate = bool(
            request.user.is_superuser
            or get_operable_properties(request.user).filter(pk=active_property.pk).exists()
        )
        can_assign = bool(
            request.user.is_superuser
            or get_job_reassignable_properties(request.user).filter(pk=active_property.pk).exists()
        )
        context = {
            'property_id': property_id,
            'property_name': active_property.name,
            'can_operate': can_operate,
            'can_assign': can_assign,
            'status_counts': status_counts,
        }
        if page is not None:
            response = self.get_paginated_response(serializer.data)
            response.data.update(context)
            return response
        return Response({'count': len(serializer.data), 'results': serializer.data, **context})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get job statistics without loading all jobs."""
        user = request.user

        # Create cache key based on user and filters
        cache_key = f"job_stats:user:{user.id}:property:{request.query_params.get('property_id', 'all')}"

        # Try to get from cache
        cached_stats = CacheManager.get_or_set(
            cache_key,
            lambda: self._calculate_stats(user, request.query_params),
            timeout=300  # Cache for 5 minutes
        )

        return Response(cached_stats)

    @action(detail=False, methods=['get'])
    def missing_rooms(self, request):
        """
        Return room numbers that exist in Room model but are not present
        in jobs matching the current user's access and optional filters.

        Query params:
        - floor: floor number prefix (e.g. 6 -> rooms like 6xx)
        - property_id/property: optional property filter
        """
        user = request.user
        floor = request.query_params.get('floor')
        property_filter = request.query_params.get('property_id') or request.query_params.get('property')

        # Base room queryset scoped by permissions
        room_qs = Room.objects.filter(is_active=True)
        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            room_qs = room_qs.filter(property_id__in=accessible_property_ids)

        if property_filter:
            room_qs = room_qs.filter(
                Q(property__property_id=property_filter) |
                Q(property__id=property_filter)
            )

        # Scope by floor using room name prefix (e.g. 6 => 6xx)
        if floor:
            floor_str = str(floor).strip()
            room_qs = room_qs.filter(name__regex=rf'^{floor_str}[0-9]+$')

        room_names = sorted(set(room_qs.values_list('name', flat=True)))

        # Job rooms under same permission and optional filters
        job_qs = get_accessible_jobs(self.request.user).all()
        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            job_qs = job_qs.filter(property_id__in=accessible_property_ids)

        if property_filter:
            job_qs = job_qs.filter(Q(property__property_id=property_filter) | Q(property_id=property_filter))

        if floor:
            floor_str = str(floor).strip()
            job_qs = job_qs.filter(rooms__name__regex=rf'^{floor_str}[0-9]+$')

        used_room_names = set(job_qs.values_list('rooms__name', flat=True))
        missing = [room for room in room_names if room and room not in used_room_names]

        return Response({
            "floor": floor,
            "property": property_filter,
            "total_rooms_in_model": len(room_names),
            "rooms_with_jobs": len([r for r in room_names if r in used_room_names]),
            "missing_rooms": missing,
        })

    def _calculate_stats(self, user, query_params):
        """Calculate job statistics (separated for caching)"""
        base_queryset = get_accessible_jobs(self.request.user).all()

        # Apply same filtering logic as get_queryset
        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            base_queryset = base_queryset.filter(property_id__in=accessible_property_ids)

        # Apply filters
        property_filter = query_params.get('property_id')
        if property_filter:
            property_q = Q(property__property_id=property_filter)
            if str(property_filter).isdigit():
                property_q |= Q(property_id=int(property_filter))
            base_queryset = base_queryset.filter(property_q)

        # Calculate stats using aggregation
        stats = base_queryset.aggregate(
            total=Count('id', distinct=True),
            pending=Count('id', filter=Q(status='pending'), distinct=True),
            inProgress=Count('id', filter=Q(status='in_progress'), distinct=True),
            completed=Count('id', filter=Q(status='completed'), distinct=True),
            cancelled=Count('id', filter=Q(status='cancelled'), distinct=True),
            waitingSparepart=Count('id', filter=Q(status='waiting_sparepart'), distinct=True),
            defect=Count('id', filter=Q(is_defective=True), distinct=True),
            preventiveMaintenance=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True)
        )

        return stats

    @action(detail=False, methods=['get'])
    def all(self, request):
        """
        Return all jobs matching current filters without pagination.
        Useful for exports/reports where the client needs the full dataset.
        Applies the same filtering and permission rules as list/get_queryset.
        """
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data
        return Response({
            'count': len(data),
            'results': data
        }, status=status.HTTP_200_OK)

    def _jobs_report_queryset(self, request):
        """Return one authorized Property's Jobs with validated report filters."""
        property_id = str(request.query_params.get('property_id') or '').strip()
        if not property_id:
            raise ValidationError({'property_id': 'Select a property to export this report.'})

        property_scope = (
            Property.objects.all()
            if request.user.is_superuser
            else get_accessible_properties(request.user)
        )
        property_obj = property_scope.filter(property_id=property_id).first()
        if property_obj is None:
            raise PermissionDenied('You do not have access to this property.')

        jobs = get_accessible_jobs(self.request.user).filter(property=property_obj).select_related(
            'property', 'user', 'area'
        ).prefetch_related('rooms', 'topics')

        status_filter = str(request.query_params.get('status') or '').strip()
        priority_filter = str(request.query_params.get('priority') or '').strip()
        pm_filter = str(request.query_params.get('pm') or '').strip()
        topic_filter = str(request.query_params.get('topic') or '').strip()
        user_filter = str(request.query_params.get('user') or '').strip()
        month_filter = str(request.query_params.get('month') or '').strip()
        year_filter = str(request.query_params.get('year') or '').strip()
        created_from_raw = str(request.query_params.get('created_from') or '').strip()
        created_to_raw = str(request.query_params.get('created_to') or '').strip()
        search_term = str(request.query_params.get('search') or '').strip()

        if status_filter and status_filter != 'all':
            if status_filter not in dict(Job.STATUS_CHOICES):
                raise ValidationError({'status': 'Invalid status filter.'})
            jobs = jobs.filter(status=status_filter)

        if priority_filter and priority_filter != 'all':
            if priority_filter not in dict(Job.PRIORITY_CHOICES):
                raise ValidationError({'priority': 'Invalid priority filter.'})
            jobs = jobs.filter(priority=priority_filter)

        if pm_filter and pm_filter != 'all':
            if pm_filter not in {'pm', 'non_pm'}:
                raise ValidationError({'pm': 'Invalid PM filter.'})
            jobs = jobs.filter(is_preventivemaintenance=pm_filter == 'pm')

        if topic_filter and topic_filter != 'all':
            if topic_filter == 'none':
                jobs = jobs.filter(topics__isnull=True)
            elif topic_filter.isdigit():
                jobs = jobs.filter(topics__id=int(topic_filter))
            else:
                raise ValidationError({'topic': 'Invalid topic filter.'})

        if user_filter and user_filter != 'all':
            if user_filter == 'none':
                jobs = jobs.filter(user__isnull=True)
            elif user_filter.startswith('username:'):
                username = user_filter.removeprefix('username:').strip()
                if not username:
                    raise ValidationError({'user': 'Invalid user filter.'})
                jobs = jobs.filter(user__username=username)
            elif user_filter.isdigit():
                jobs = jobs.filter(user_id=int(user_filter))
            else:
                raise ValidationError({'user': 'Invalid user filter.'})

        if month_filter and month_filter != 'all':
            if not month_filter.isdigit() or not 1 <= int(month_filter) <= 12:
                raise ValidationError({'month': 'Invalid month filter.'})
            jobs = jobs.filter(created_at__month=int(month_filter))

        if year_filter and year_filter != 'all':
            if not year_filter.isdigit() or len(year_filter) != 4:
                raise ValidationError({'year': 'Invalid year filter.'})
            jobs = jobs.filter(created_at__year=int(year_filter))

        created_from = parse_date(created_from_raw) if created_from_raw else None
        created_to = parse_date(created_to_raw) if created_to_raw else None
        if created_from_raw and created_from is None:
            raise ValidationError({'created_from': 'Invalid created-from date.'})
        if created_to_raw and created_to is None:
            raise ValidationError({'created_to': 'Invalid created-to date.'})
        if created_from and created_to and created_from > created_to:
            raise ValidationError({'created_to': 'Created-to must be on or after created-from.'})
        report_timezone = property_timezone(property_obj)
        if created_from:
            created_from_at = timezone.make_aware(
                datetime.combine(created_from, time.min),
                report_timezone,
            )
            jobs = jobs.filter(created_at__gte=created_from_at)
        if created_to:
            created_to_at = timezone.make_aware(
                datetime.combine(created_to + timedelta(days=1), time.min),
                report_timezone,
            )
            jobs = jobs.filter(created_at__lt=created_to_at)

        if search_term:
            jobs = jobs.filter(
                Q(job_id__icontains=search_term)
                | Q(description__icontains=search_term)
                | Q(remarks__icontains=search_term)
                | Q(rooms__name__icontains=search_term)
                | Q(area__name__icontains=search_term)
                | Q(topics__title__icontains=search_term)
                | Q(user__username__icontains=search_term)
                | Q(user__first_name__icontains=search_term)
                | Q(user__last_name__icontains=search_term)
            )

        return property_obj, jobs.distinct().order_by('-created_at', '-id')

    @action(detail=False, methods=['get'], url_path='report-csv')
    def report_csv(self, request):
        """Stream every authorized Job matching the Jobs Report filters."""
        require_request_feature(request, 'csv_export')
        property_obj, jobs = self._jobs_report_queryset(request)

        class Echo:
            def write(self, value):
                return value

        writer = csv.writer(Echo(), lineterminator='\r\n')
        headers = [
            'Job ID',
            'Property',
            'Status',
            'Priority',
            'Description',
            'Topics',
            'Rooms',
            'Area',
            'Assigned To',
            'Created',
            'Updated',
            'Completed',
            'Preventive Maintenance',
            'Defective',
        ]

        def safe_text(value):
            text = str(value or '')
            if text.lstrip().startswith(('=', '+', '-', '@')):
                return "'" + text
            return text

        def format_timestamp(value):
            if not value:
                return ''
            return timezone.localtime(
                value,
                property_timezone(property_obj),
            ).strftime('%Y-%m-%d %H:%M:%S')

        def stream_rows():
            # UTF-8 BOM keeps Thai and other Unicode text readable in Excel.
            yield '\ufeff'
            yield writer.writerow(headers)
            for job in jobs.iterator(chunk_size=500):
                yield writer.writerow([
                    safe_text(job.job_id),
                    safe_text(property_obj.name),
                    safe_text(job.status),
                    safe_text(job.priority),
                    safe_text(job.description),
                    safe_text('; '.join(topic.title for topic in job.topics.all())),
                    safe_text('; '.join(room.name for room in job.rooms.all())),
                    safe_text(job.area.name if job.area else ''),
                    safe_text(display_name_from_user(job.user, fallback='Unassigned')),
                    format_timestamp(job.created_at),
                    format_timestamp(job.updated_at),
                    format_timestamp(job.completed_at),
                    'Yes' if job.is_preventivemaintenance else 'No',
                    'Yes' if job.is_defective else 'No',
                ])

        report_date = timezone.localtime(
            timezone.now(),
            property_timezone(property_obj),
        ).date()
        filename = f'jobs-report-{property_obj.property_id}-{report_date.isoformat()}.csv'
        response = StreamingHttpResponse(
            stream_rows(),
            content_type='text/csv; charset=utf-8',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def get_object(self):
        queryset = self.get_queryset()
        filter_kwargs = {self.lookup_field: self.kwargs[self.lookup_field]}
        obj = get_object_or_404(queryset, **filter_kwargs)
        self.check_object_permissions(self.request, obj)
        # Reads retain the broader accessible-Property scope. Every detail
        # mutation, including custom actions, must additionally pass through
        # the canonical operable-Property write gate.
        if self.request.method not in ('GET', 'HEAD', 'OPTIONS'):
            _ensure_user_can_operate_property(self.request.user, obj.property)
        return obj

    @action(detail=True, methods=['patch'])
    def update_status(self, request, job_id=None):
        job = self.get_object()
        status_value = request.data.get('status')
        after_images = request.FILES.getlist('after_images')
        if status_value is None:
            return Response(
                {"detail": "Status is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if status_value not in dict(Job.STATUS_CHOICES):
            return Response({"detail": "Invalid status value."}, status=status.HTTP_400_BAD_REQUEST)
        if job.status == 'completed' and status_value != 'completed':
            return Response(
                {"detail": "Completed jobs cannot have their status changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if after_images and status_value != 'completed':
            raise ValidationError({
                'after_images': 'After images can only be added when completing a job.'
            })
        if len(after_images) > 5:
            raise ValidationError({'after_images': 'You can upload up to 5 after images.'})

        require_subscription_write(
            request,
            job.property.tenant,
            operation='status_change',
            resource_type='job',
        )

        try:
            with transaction.atomic():
                if request.user.is_authenticated:
                    job.updated_by = request.user

                if status_value == 'completed' and job.status != 'completed':
                    job.completed_at = timezone.now()

                for image in after_images:
                    JobImage.objects.create(
                        job=job,
                        image=image,
                        image_type='after',
                        uploaded_by=request.user,
                    )

                job.status = status_value
                job.save()
                JobSerializer.record_machine_completion(job)
        except DjangoValidationError as exc:
            detail = getattr(exc, 'message_dict', None) or {'after_images': exc.messages}
            raise ValidationError(detail) from exc

        # get_object() may have prefetched the old image collection.
        if hasattr(job, '_prefetched_objects_cache'):
            job._prefetched_objects_cache.pop('job_images', None)
        serializer = self.get_serializer(job)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_jobs(self, request):
        """Return Jobs assigned to the user for one active readable Property."""
        user = request.user

        logger.info(f"my_jobs endpoint called by user {user.username} (ID: {user.id})")

        # Optional override: platform break-glass may inspect another user's jobs.
        target_user = user
        user_filter = request.query_params.get('user_id')
        if user_filter and str(user_filter).lower() != 'all':
            # Resolve by numeric id or username
            resolved_user = None
            try:
                resolved_user = User.objects.filter(id=int(user_filter)).first()
            except (TypeError, ValueError):
                resolved_user = User.objects.filter(username=str(user_filter)).first()

            if resolved_user:
                if user.is_superuser or resolved_user.id == user.id:
                    target_user = resolved_user
                    logger.info(f"Filtering jobs for target_user: {target_user.username} (ID: {target_user.id})")
                else:
                    logger.warning(f"User {user.username} attempted to view jobs for user {resolved_user.username} but lacks permission")
                    return Response({
                        'detail': 'Not permitted to view other users\' jobs'
                    }, status=status.HTTP_403_FORBIDDEN)

        property_filter = str(request.query_params.get('property_id') or '').strip()
        if not property_filter:
            return Response(
                {'detail': 'Select a property to view your jobs.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        property_scope = (
            Property.objects.all()
            if user.is_superuser
            else get_accessible_properties(user)
        )
        active_property = property_scope.filter(property_id=property_filter).first()
        if active_property is None:
            return Response(
                {'detail': 'You do not have access to this property.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Job.user is the current assignee relation. Job.property is the sole
        # ownership and active-Property boundary for this projection.
        jobs = get_accessible_jobs(self.request.user).filter(
            user=target_user,
            property=active_property,
        ).select_related(
            'user', 'updated_by', 'property', 'area', 'area__property', 'machine'
        ).prefetch_related(
            'documents', 'rooms', 'rooms__property', 'topics', 'job_images', 'job_images__uploaded_by'
        )

        # Apply additional filters if provided
        status_filter = request.query_params.get('status')
        priority_filter = request.query_params.get('priority')
        date_filter = request.query_params.get('date')
        is_pm_filter = request.query_params.get('is_preventivemaintenance')
        search_term = request.query_params.get('search')
        room_filter = request.query_params.get('room_id')
        room_name_filter = request.query_params.get('room_name')

        valid_statuses = dict(Job.STATUS_CHOICES)
        valid_priorities = dict(Job.PRIORITY_CHOICES)
        if status_filter and status_filter not in valid_statuses:
            return Response(
                {'detail': 'Invalid status filter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if priority_filter and priority_filter not in valid_priorities:
            return Response(
                {'detail': 'Invalid priority filter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if date_filter and date_filter not in {'today', 'week', 'month'}:
            return Response(
                {'detail': 'Invalid date filter.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(f"Applied property filter: {property_filter}")

        if is_pm_filter is not None:
            val = str(is_pm_filter).lower() in ['1', 'true', 'yes']
            jobs = jobs.filter(is_preventivemaintenance=val)
            logger.info(f"Applied is_preventivemaintenance filter: {val}")

        if priority_filter:
            jobs = jobs.filter(priority=priority_filter)

        if date_filter:
            now = timezone.now()
            if date_filter == 'today':
                created_after = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif date_filter == 'week':
                created_after = now - timedelta(days=7)
            else:
                created_after = now - timedelta(days=30)
            jobs = jobs.filter(created_at__gte=created_after)

        if room_filter:
            jobs = jobs.filter(rooms__room_id=room_filter)
            logger.info(f"Applied room_id filter: {room_filter}")

        if room_name_filter:
            jobs = jobs.filter(
                Q(rooms__name__icontains=room_name_filter)
                | Q(area__name__icontains=room_name_filter)
            )
            logger.info(f"Applied room_name filter: {room_name_filter}")

        if search_term:
            jobs = jobs.filter(
                Q(description__icontains=search_term) |
                Q(job_id__icontains=search_term) |
                Q(topics__title__icontains=search_term) |
                Q(rooms__name__icontains=search_term) |
                Q(area__name__icontains=search_term) |
                Q(user__username__icontains=search_term) |
                Q(user__first_name__icontains=search_term) |
                Q(user__last_name__icontains=search_term)
            )
            logger.info(f"Applied search filter: {search_term}")

        jobs = jobs.distinct()
        status_counts = jobs.aggregate(
            total=Count('id', distinct=True),
            pending=Count('id', filter=Q(status='pending'), distinct=True),
            in_progress=Count('id', filter=Q(status='in_progress'), distinct=True),
            waiting_sparepart=Count(
                'id', filter=Q(status='waiting_sparepart'), distinct=True
            ),
            completed=Count('id', filter=Q(status='completed'), distinct=True),
            cancelled=Count('id', filter=Q(status='cancelled'), distinct=True),
        )

        if status_filter:
            jobs = jobs.filter(status=status_filter)
            logger.info(f"Applied status filter: {status_filter}")

        jobs = jobs.annotate(
            _comments_count=Count('comments', distinct=True)
        ).order_by('-created_at')
        page = self.paginate_queryset(jobs)
        serializer = self.get_serializer(page if page is not None else jobs, many=True)
        user_display_name = display_name_from_user(user, fallback=user.email or 'User')
        target_display_name = display_name_from_user(target_user, fallback=target_user.email or 'User')
        can_operate = bool(
            user.is_superuser
            or get_operable_properties(user).filter(pk=active_property.pk).exists()
        )

        if page is not None:
            response = self.get_paginated_response(serializer.data)
            response.data.update({
                'property_id': property_filter,
                'can_operate': can_operate,
                'status_counts': status_counts,
                'user_id': user.id,
                'display_name': user_display_name,
                'target_user_id': target_user.id,
                'target_display_name': target_display_name,
            })
            return response

        return Response({
            'count': len(serializer.data),
            'results': serializer.data,
            'property_id': property_filter,
            'can_operate': can_operate,
            'status_counts': status_counts,
            'user_id': user.id,
            'display_name': user_display_name,
            'target_user_id': target_user.id,
            'target_display_name': target_display_name,
        }, status=status.HTTP_200_OK)

    def _operable_property_ids(self):
        """Canonical Property PKs the current user may mutate."""
        user = self.request.user
        if not user.is_authenticated:
            return set()
        if user.is_superuser:
            return None
        return set(get_operable_properties(user).values_list('pk', flat=True))

    def _validate_operable_scope(self, serializer):
        """Validate canonical write authority and Job location integrity.

        Job.property is the authorization boundary. Room and Area are location
        details and may never widen or substitute for that boundary.
        """
        operable = self._operable_property_ids()

        resolved_property = serializer.validated_data.get('_resolved_property')
        if resolved_property is None:
            raise ValidationError({'property_id': 'A canonical property is required.'})
        if operable is not None and resolved_property.pk not in operable:
            raise PermissionDenied("Your role cannot modify data for this property.")

        room_instances = serializer.validated_data.get('_resolved_rooms')
        if room_instances is None:
            room_instances = serializer.instance.rooms.all() if serializer.instance is not None else ()
        for room in room_instances:
            if room.property_id != resolved_property.pk:
                raise ValidationError({
                    'rooms': 'All selected rooms must belong to the Job property.'
                })

        area = serializer.validated_data.get('area', getattr(serializer.instance, 'area', None))
        if area is not None and getattr(area, 'property_id', None) is not None:
            if area.property_id != resolved_property.pk:
                raise ValidationError({
                    'area_id': 'Selected area must belong to the Job property.'
                })

    @action(
        detail=False,
        methods=['post', 'delete'],
        url_path='pending-images',
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def pending_images(self, request):
        """Upload or remove optimized evidence before the Job exists."""
        if request.method == 'DELETE':
            token = request.data.get('token') or request.query_params.get('token')
            pending = get_object_or_404(
                PendingJobImage,
                token=token,
                uploaded_by=request.user,
            )
            storage = pending.image.storage
            image_name = pending.image.name
            pending.delete()
            if image_name and not JobImage.objects.filter(image=image_name).exists():
                storage.delete(image_name)
            return Response(status=status.HTTP_204_NO_CONTENT)

        upload = request.FILES.get('image')
        image_type = str(request.data.get('image_type') or '').strip().lower()
        property_id = request.data.get('property_id')
        if upload is None:
            raise ValidationError({'image': 'An image is required.'})
        if image_type not in {'before', 'after'}:
            raise ValidationError({'image_type': 'Use before or after.'})
        if int(getattr(upload, 'size', 0) or 0) > 20 * 1024 * 1024:
            raise ValidationError({'image': 'Each image must be 20 MB or smaller.'})

        try:
            property_obj = resolve_external_property_reference(property_id)
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict) from exc
        operable = self._operable_property_ids()
        if operable is not None and property_obj.pk not in operable:
            raise PermissionDenied('Your role cannot modify data for this property.')

        expired = PendingJobImage.objects.filter(
            created_at__lt=timezone.now() - timedelta(hours=24),
        )
        for pending_image in expired:
            storage = pending_image.image.storage
            image_name = pending_image.image.name
            pending_image.delete()
            if image_name and not JobImage.objects.filter(image=image_name).exists():
                storage.delete(image_name)

        with transaction.atomic():
            locked_tenant = lock_tenants_for_membership_change(property_obj.tenant)[property_obj.tenant_id]
            max_count = 20 if image_type == 'before' else 5
            active_count = PendingJobImage.objects.filter(
                uploaded_by=request.user,
                property=property_obj,
                image_type=image_type,
            ).count()
            if active_count >= max_count:
                raise ValidationError({
                    'image': f'You can upload up to {max_count} {image_type} images.'
                })
            enforce_storage_limit(locked_tenant, int(getattr(upload, 'size', 0) or 0))
            require_subscription_write(
                request,
                locked_tenant,
                operation='create',
                resource_type='job',
            )
            try:
                pending = PendingJobImage.objects.create(
                    uploaded_by=request.user,
                    property=property_obj,
                    image=upload,
                    image_type=image_type,
                )
            except DjangoValidationError as exc:
                raise ValidationError(exc.message_dict) from exc

        return Response({
            'token': str(pending.token),
            'image_type': pending.image_type,
            'size': pending.image.size,
        }, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            self._validate_operable_scope(serializer)
            tenant = serializer.validated_data['_resolved_property'].tenant
            incoming_files = [
                *self.request.FILES.getlist('before_images'),
                *self.request.FILES.getlist('after_images'),
                *self.request.FILES.getlist('images'),
                *self.request.FILES.getlist('documents'),
            ]
            incoming_bytes = sum(int(getattr(item, 'size', 0) or 0) for item in incoming_files)
            with transaction.atomic():
                locked_tenant = lock_tenants_for_membership_change(tenant)[tenant.pk]
                enforce_subscription_limit(locked_tenant, 'max_monthly_work_orders')
                enforce_storage_limit(locked_tenant, incoming_bytes)
                require_subscription_write(
                    self.request,
                    locked_tenant,
                    operation='create',
                    resource_type='job',
                )
                job = serializer.save(user=self.request.user, updated_by=self.request.user)
        else:
            job = serializer.save()

        log_job_action(
            job=job,
            user=self.request.user,
            action_flag=ADDITION,
            message='Created through the application.',
        )

        # Invalidate cache after creating job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    def perform_update(self, serializer):
        changed_fields = sorted(
            field
            for field in serializer.validated_data
            if not field.startswith('_') and field not in {'property_id'}
        )
        if self.request.user.is_authenticated:
            self._validate_operable_scope(serializer)
            require_subscription_write(
                self.request,
                serializer.instance.property.tenant,
                operation=(
                    'status_change'
                    if 'status' in serializer.validated_data else 'update'
                ),
                resource_type='job',
            )
            instance = serializer.instance
            data = serializer.validated_data
            if instance.status == 'completed' and 'status' in data and data['status'] != 'completed':
                raise ValidationError("Completed jobs cannot have their status changed.")
            if 'status' in data and data['status'] == 'completed' and instance.status != 'completed':
                job = serializer.save(updated_by=self.request.user, completed_at=timezone.now())
            else:
                job = serializer.save(updated_by=self.request.user)
        else:
            job = serializer.save()

        field_list = ', '.join(changed_fields) if changed_fields else 'job details'
        log_job_action(
            job=job,
            user=self.request.user,
            action_flag=CHANGE,
            message=f'Changed {field_list} through the application.',
        )

        # Invalidate cache after updating job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    def perform_destroy(self, instance):
        require_subscription_write(
            self.request,
            instance.property.tenant,
            operation='delete',
            resource_type='job',
        )
        instance.delete(deleted_by=self.request.user if self.request.user.is_authenticated else None)
        log_job_action(
            job=instance,
            user=self.request.user,
            action_flag=DELETION,
            message='Moved to deleted jobs through the application.',
        )
        # Invalidate cache after deleting job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    @action(detail=True, methods=['get'], url_path=r'documents/(?P<document_id>[^/.]+)')
    def document(self, request, job_id=None, document_id=None):
        job = self.get_object()
        document = get_object_or_404(job.documents, pk=document_id)
        try:
            document.file.open('rb')
        except (FileNotFoundError, OSError):
            raise Http404('Document not found.')
        response = FileResponse(document.file, content_type='application/pdf',
                                as_attachment=True, filename=document.name)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    @action(detail=True, methods=['get', 'post'], url_path='comments')
    def comments(self, request, job_id=None):
        """List or create comments inside one active external Property scope."""
        property_filter = str(request.query_params.get('property_id') or '').strip()
        if not property_filter:
            return Response(
                {'detail': 'A property_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # get_object() resolves the external job_id through get_queryset(). The
        # property_id query filter is the active-Property boundary; writes also
        # pass through the canonical operable-Property gate in get_object().
        job = self.get_object()

        if request.method.lower() == 'get':
            qs = job.comments.select_related('author').order_by('created_at')
            serializer = JobCommentSerializer(qs, many=True, context={'request': request})
            return Response({
                'count': qs.count(),
                'results': serializer.data,
            }, status=status.HTTP_200_OK)

        # POST
        serializer = JobCommentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        require_subscription_write(
            request,
            job.property.tenant,
            operation='comment_create',
            resource_type='job_comment',
        )
        comment = JobComment.objects.create(
            job=job,
            author=request.user if request.user.is_authenticated else None,
            comment=serializer.validated_data['comment'],
        )
        out = JobCommentSerializer(comment, context={'request': request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='audit-log')
    def audit_log(self, request, job_id=None):
        """Synthetic activity log derived from existing job state and comments.

        Until a dedicated AuditLog model lands (which would require a
        migration), we surface the auditable timestamps already on the model:
        creation, completion, image uploads, comments, and remark notes (the
        UpdateStatusModal prepends `[ts · user → new_status] message` lines
        which we parse out here). The response is a chronological list of
        events the frontend can render as a timeline.
        """
        job = self.get_object()
        events = []

        creator_name = display_name_from_user(job.user, fallback='system')
        events.append({
            'kind': 'created',
            'at': job.created_at.isoformat() if job.created_at else None,
            'actor': creator_name,
            'message': 'Job created',
        })

        if job.completed_at:
            updater_name = display_name_from_user(job.updated_by, fallback='unknown')
            events.append({
                'kind': 'completed',
                'at': job.completed_at.isoformat(),
                'actor': updater_name,
                'message': 'Job completed',
            })

        # Image uploads — JobImage has uploaded_at and uploaded_by
        for image in job.job_images.all().order_by('uploaded_at'):
            uploaded_by = display_name_from_user(image.uploaded_by, fallback='unknown') if image.uploaded_by else None
            image_url = None
            if image.image:
                try:
                    image_url = request.build_absolute_uri(image.image.url)
                except Exception:
                    image_url = image.image.url
            events.append({
                'kind': 'photo_uploaded',
                'at': image.uploaded_at.isoformat() if image.uploaded_at else None,
                'actor': uploaded_by or 'unknown',
                'message': 'Photo uploaded',
                'image_url': image_url,
            })

        # Comments
        for comment in job.comments.select_related('author').order_by('created_at'):
            author = display_name_from_user(comment.author, fallback='unknown')
            events.append({
                'kind': 'comment',
                'at': comment.created_at.isoformat() if comment.created_at else None,
                'actor': author,
                'message': comment.comment,
            })

        # Parse status-change lines that UpdateStatusModal appends to remarks.
        # Format: `[YYYY-MM-DD HH:MM · username → status] message`
        if job.remarks:
            import re

            pattern = re.compile(
                r'\[(?P<ts>\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})\s*[·-]\s*(?P<actor>[^→]+?)\s*→\s*(?P<status>[a-z_]+)\]\s*(?P<msg>.*)',
                re.IGNORECASE,
            )
            for line in job.remarks.splitlines():
                match = pattern.search(line)
                if not match:
                    continue
                events.append({
                    'kind': 'status_change',
                    'at': match.group('ts').replace(' ', 'T') + ':00',
                    'actor': match.group('actor').strip(),
                    'message': f"Status → {match.group('status')}",
                    'note': match.group('msg').strip() or None,
                    'new_status': match.group('status'),
                })

        # Sort: missing timestamps last
        def _sort_key(event):
            return event.get('at') or '9999-12-31T23:59:59'

        events.sort(key=_sort_key)

        return Response({
            'job_id': job.job_id,
            'count': len(events),
            'events': events,
        })

    @action(detail=True, methods=['post'], url_path='reassign')
    def reassign(self, request, job_id=None):
        """Reassign a job to an active operator for its canonical Property.

        Body: {"user_id": <id|username>, "property_id": <external id>, "note"?: str}

        Stamps the remarks with the same status-note format the audit log
        already parses, so the timeline picks up the reassignment as a
        first-class event. Pushes both the new and previous assignee."""
        job = get_object_or_404(
            get_accessible_jobs(self.request.user).select_related('property', 'property__tenant', 'user'),
            job_id=job_id,
        )
        _ensure_user_can_reassign_job(request.user, job)

        active_property_id = str((request.data or {}).get('property_id') or '').strip()
        if not active_property_id:
            raise ValidationError({'property_id': 'An active property is required.'})
        active_property = Property.objects.filter(property_id=active_property_id).first()
        if active_property is None:
            raise ValidationError({'property_id': 'Invalid property ID.'})
        if active_property.pk != job.property_id:
            raise ValidationError({'property_id': 'Active property does not match this job.'})

        target_raw = (request.data or {}).get('user_id')
        if not target_raw:
            return Response(
                {'error': 'user_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_str = str(target_raw).strip()
        candidates = _job_assignment_candidates(job.property)
        target = None
        if target_str.isdigit():
            target = candidates.filter(pk=int(target_str)).first()
        if target is None:
            target = candidates.filter(username__iexact=target_str).first()
        if target is None:
            return Response(
                {'error': 'Target user is not eligible for this property.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        require_subscription_write(
            request,
            job.property.tenant,
            operation='reassign',
            resource_type='job',
        )

        company_model = job.property.tenant and job.property.tenant.billing_model == 'property_quantity_v1'
        previous = job.assigned_to if company_model else job.user
        if previous and previous.pk == target.pk:
            return Response(
                {'error': 'Job is already assigned to that user.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        note = ((request.data or {}).get('note') or '').strip()[:300]
        stamp = timezone.now().strftime('%Y-%m-%d %H:%M')
        actor = display_name_from_user(request.user, fallback=getattr(request.user, 'email', None) or 'system')
        new_username = display_name_from_user(target, fallback=getattr(target, 'email', None) or f'user-{target.pk}')
        prev_username = display_name_from_user(previous, fallback='unassigned') if previous else 'unassigned'
        log_line = (
            f"[{stamp} · {actor} → reassigned] "
            f"{prev_username} → {new_username}"
            + (f" — {note}" if note else '')
        )

        if company_model:
            job.assigned_to = target
        else:
            job.user = target
        job.updated_by = request.user if getattr(request.user, 'is_authenticated', False) else target
        job.remarks = f"{job.remarks}\n{log_line}" if job.remarks else log_line
        job.save(update_fields=['assigned_to' if company_model else 'user', 'updated_by', 'remarks', 'updated_at'])
        log_job_action(
            job=job,
            user=request.user,
            action_flag=CHANGE,
            message=f'Reassigned from {prev_username} to {new_username} through the application.',
        )

        # Push to the new assignee; signal-driven push on Job.save() already
        # fires on changed status but not on assignment, so we send an
        # explicit one here. Previous assignee gets a courtesy note.
        try:
            from ..push import send_push_to_user
            send_push_to_user(
                target,
                {
                    'title': 'Job reassigned to you',
                    'body': (job.description or job.job_id)[:120],
                    'tag': f'job-reassign-{job.job_id}',
                    'url': f'/dashboard/jobs/{job.job_id}',
                    'renotify': True,
                },
            )
            if previous is not None and previous.pk != target.pk:
                send_push_to_user(
                    previous,
                    {
                        'title': 'Job reassigned',
                        'body': f"#{job.job_id} is now assigned to {new_username}.",
                        'tag': f'job-reassign-prev-{job.job_id}',
                        'url': f'/dashboard/jobs/{job.job_id}',
                    },
                )
        except Exception:  # pragma: no cover - defensive
            logger.exception('Reassignment push failed for job=%s', job.job_id)

        return Response(
            {
                'job_id': job.job_id,
                'assignee': new_username,
                'previous': prev_username,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], url_path='assignment-candidates')
    def assignment_candidates(self, request, job_id=None):
        """Return the smallest same-Property set needed by reassignment UI."""
        job = get_object_or_404(
            get_accessible_jobs(self.request.user).select_related('property', 'property__tenant'),
            job_id=job_id,
        )
        _ensure_user_can_reassign_job(request.user, job)

        active_property_id = str(request.query_params.get('property_id') or '').strip()
        if not active_property_id:
            raise ValidationError({'property_id': 'An active property is required.'})
        active_property = Property.objects.filter(property_id=active_property_id).first()
        if active_property is None:
            raise ValidationError({'property_id': 'Invalid property ID.'})
        if active_property.pk != job.property_id:
            raise ValidationError({'property_id': 'Active property does not match this job.'})

        candidates = _job_assignment_candidates(job.property)
        return Response(JobAssignmentCandidateSerializer(candidates, many=True).data)
