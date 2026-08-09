import logging
import re

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..cache import CacheManager
from ..models import Job, JobComment, Property, Room
from ..pagination import StandardResultsSetPagination
from ..serializers import JobCommentSerializer, JobSerializer
from ..tenancy import accessible_property_ids
from .common import display_name_from_user


User = get_user_model()
logger = logging.getLogger(__name__)


class JobViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Job.objects.all()
    serializer_class = JobSerializer
    lookup_field = 'job_id'
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['description', 'job_id', 'rooms__name']
    ordering_fields = ['created_at', 'updated_at', 'status', 'priority']
    ordering = ['-created_at']

    def get_queryset(self):
        """Filter jobs by user, property, and optional flags."""
        user = self.request.user
        # ✅ PERFORMANCE OPTIMIZATION: Comprehensive query optimization
        # Use select_related for foreign keys to avoid N+1 queries
        # Use prefetch_related for many-to-many and reverse foreign keys
        queryset = Job.objects.select_related(
            'user',           # Foreign key to User
            'updated_by',     # Foreign key to User
            'area',           # Foreign key to Area
            'area__property',
        ).prefetch_related(
            'rooms__properties',  # Many-to-many through rooms
            'topics',            # Many-to-many relationship
            'job_images',        # Reverse foreign key to JobImage
            'preventivemaintenance_set'  # Reverse foreign key
        ).distinct()  # Remove duplicates from joins

        # Restrict by user's accessible properties unless staff/admin.
        # Area-only jobs do not have a room join, so include the job's area
        # property in the tenant predicate as well.
        if not (user.is_staff or user.is_superuser):
            accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
            queryset = queryset.filter(
                Q(rooms__properties__in=accessible_property_ids) |
                Q(area__property_id__in=accessible_property_ids)
            )

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
            property_q = Q(rooms__properties__property_id=property_filter) | Q(area__property__property_id=property_filter)
            if str(property_filter).isdigit():
                property_q |= Q(rooms__properties__id=int(property_filter)) | Q(area__property_id=int(property_filter))
            queryset = queryset.filter(property_q)

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

        return queryset.distinct()

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
        if not (user.is_staff or user.is_superuser):
            accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
            room_qs = room_qs.filter(properties__in=accessible_property_ids)

        if property_filter:
            room_qs = room_qs.filter(
                Q(properties__property_id=property_filter) |
                Q(properties__id=property_filter)
            )

        # Scope by floor using room name prefix (e.g. 6 => 6xx)
        if floor:
            floor_str = str(floor).strip()
            room_qs = room_qs.filter(name__regex=rf'^{floor_str}[0-9]+$')

        room_names = sorted(set(room_qs.values_list('name', flat=True)))

        # Job rooms under same permission and optional filters
        job_qs = Job.objects.all()
        if not (user.is_staff or user.is_superuser):
            accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
            job_qs = job_qs.filter(rooms__properties__in=accessible_property_ids)

        if property_filter:
            job_qs = job_qs.filter(
                Q(rooms__properties__property_id=property_filter) |
                Q(rooms__properties__id=property_filter)
            )

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
        base_queryset = Job.objects.all()
        
        # Apply same filtering logic as get_queryset
        if not (user.is_staff or user.is_superuser):
            accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
            base_queryset = base_queryset.filter(
                Q(rooms__properties__in=accessible_property_ids) |
                Q(area__property_id__in=accessible_property_ids)
            )
        
        # Apply filters
        property_filter = query_params.get('property_id')
        if property_filter:
            property_q = Q(rooms__properties__property_id=property_filter) | Q(area__property__property_id=property_filter)
            if str(property_filter).isdigit():
                property_q |= Q(rooms__properties__id=int(property_filter)) | Q(area__property_id=int(property_filter))
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

    def get_object(self):
        queryset = self.get_queryset()
        filter_kwargs = {self.lookup_field: self.kwargs[self.lookup_field]}
        obj = get_object_or_404(queryset, **filter_kwargs)
        self.check_object_permissions(self.request, obj)
        return obj

    @action(detail=True, methods=['patch'])
    def update_status(self, request, job_id=None):
        job = self.get_object()
        status_value = request.data.get('status')
        if status_value and status_value not in dict(Job.STATUS_CHOICES):
            return Response({"detail": "Invalid status value."}, status=status.HTTP_400_BAD_REQUEST)
        if job.status == 'completed' and status_value != 'completed':
            return Response(
                {"detail": "Completed jobs cannot have their status changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.is_authenticated:
            job.updated_by = request.user

        if status_value == 'completed' and job.status != 'completed':
            job.completed_at = timezone.now()

        job.status = status_value
        job.save()
        serializer = self.get_serializer(job)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_jobs(self, request):
        """Get jobs for the currently authenticated user"""
        user = request.user
        
        logger.info(f"my_jobs endpoint called by user {user.username} (ID: {user.id})")

        # Optional override: allow filtering by a specific user (admin/staff only)
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
                # Only admins can view other users' jobs
                if (user.is_staff or user.is_superuser) or resolved_user.id == user.id:
                    target_user = resolved_user
                    logger.info(f"Filtering jobs for target_user: {target_user.username} (ID: {target_user.id})")
                else:
                    logger.warning(f"User {user.username} attempted to view jobs for user {resolved_user.username} but lacks permission")
                    return Response({
                        'detail': 'Not permitted to view other users\' jobs'
                    }, status=status.HTTP_403_FORBIDDEN)

        # Get all jobs where the (possibly overridden) user is the owner/creator
        jobs = Job.objects.filter(user=target_user).select_related(
            'user', 'updated_by', 'area', 'area__property'
        ).prefetch_related(
            'rooms', 'rooms__properties', 'topics', 'job_images', 'job_images__uploaded_by'
        ).order_by('-created_at')
        
        initial_count = jobs.count()
        logger.info(f"Initial job count for user {target_user.username}: {initial_count}")
        
        # Apply additional filters if provided
        property_filter = request.query_params.get('property_id')
        status_filter = request.query_params.get('status')
        is_pm_filter = request.query_params.get('is_preventivemaintenance')
        search_term = request.query_params.get('search')
        room_filter = request.query_params.get('room_id')
        room_name_filter = request.query_params.get('room_name')
        
        if property_filter:
            property_q = Q(rooms__properties__property_id=property_filter) | Q(area__property__property_id=property_filter)
            if str(property_filter).isdigit():
                property_q |= Q(rooms__properties__id=int(property_filter)) | Q(area__property_id=int(property_filter))
            jobs = jobs.filter(property_q)
            logger.info(f"Applied property filter: {property_filter}")
        
        if status_filter:
            jobs = jobs.filter(status=status_filter)
            logger.info(f"Applied status filter: {status_filter}")
        
        if is_pm_filter is not None:
            val = str(is_pm_filter).lower() in ['1', 'true', 'yes']
            jobs = jobs.filter(is_preventivemaintenance=val)
            logger.info(f"Applied is_preventivemaintenance filter: {val}")
        
        if room_filter:
            jobs = jobs.filter(rooms__room_id=room_filter)
            logger.info(f"Applied room_id filter: {room_filter}")
        
        if room_name_filter:
            jobs = jobs.filter(rooms__name__icontains=room_name_filter)
            logger.info(f"Applied room_name filter: {room_name_filter}")
        
        if search_term:
            jobs = jobs.filter(
                Q(description__icontains=search_term) |
                Q(job_id__icontains=search_term)
            )
            logger.info(f"Applied search filter: {search_term}")
        
        final_count = jobs.count()
        logger.info(f"Final job count after filters: {final_count}")
        
        # Use pagination if requested (frontend sends page and page_size)
        page = request.query_params.get('page')
        page_size = request.query_params.get('page_size')
        
        if page and page_size:
            try:
                page_num = int(page)
                page_size_num = int(page_size)
                # Use the paginator from the ViewSet
                paginator = self.paginate_queryset(jobs)
                if paginator is not None:
                    serializer = self.get_serializer(paginator, many=True)
                    response = self.get_paginated_response(serializer.data)
                    # Add additional metadata
                    user_display_name = display_name_from_user(user, fallback=user.email or 'User')
                    target_display_name = display_name_from_user(target_user, fallback=target_user.email or 'User')
                    response.data['user_id'] = user.id
                    response.data['username'] = user_display_name
                    response.data['display_name'] = user_display_name
                    response.data['target_user_id'] = target_user.id
                    response.data['target_username'] = target_display_name
                    response.data['target_display_name'] = target_display_name
                    logger.info(f"Returning paginated results: page {page_num}, {len(serializer.data)} jobs")
                    return response
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid pagination parameters: page={page}, page_size={page_size}, error={e}")
        
        # If no pagination requested or pagination failed, return all results
        serializer = self.get_serializer(jobs, many=True)
        user_display_name = display_name_from_user(user, fallback=user.email or 'User')
        target_display_name = display_name_from_user(target_user, fallback=target_user.email or 'User')
        
        response_data = {
            'count': len(serializer.data),
            'results': serializer.data,
            'user_id': user.id,
            'username': user_display_name,
            'display_name': user_display_name,
            'target_user_id': target_user.id,
            'target_username': target_display_name,
            'target_display_name': target_display_name,
            'message': f'Found {len(serializer.data)} jobs for user {target_display_name}'
        }
        
        logger.info(f"Returning {len(serializer.data)} jobs to user {user.username} (no pagination)")
        return Response(response_data, status=status.HTTP_200_OK)

    def _accessible_property_ids(self):
        """Property PKs the current user can write against."""
        user = self.request.user
        if not user.is_authenticated:
            return set()
        return accessible_property_ids(user)

    def _validate_tenant_scope(self, serializer):
        """Reject writes that point at rooms or areas outside the user's tenant.

        Multi-tenant guarding for reads is already handled in `get_queryset`;
        this complements that on the write path so a forged room_id in the
        request body can't cross-tenant.
        """
        accessible = self._accessible_property_ids()
        if accessible is None:
            return  # staff/superuser bypass

        room_instances = []

        # Rooms can arrive as model instances for endpoints that write the M2M
        # field directly, or as the Create Job form's `room_id` helper field.
        rooms = serializer.validated_data.get('rooms')
        if rooms:
            room_instances.extend(list(rooms))

        room_id = serializer.validated_data.get('room_id')
        if room_id:
            room = Room.objects.prefetch_related('properties').filter(room_id=room_id).first()
            if room is None:
                raise ValidationError({'room_id': 'Invalid room ID'})
            room_instances.append(room)

        for room in room_instances:
            room_property_ids = set(room.properties.values_list('id', flat=True))
            if not room_property_ids & accessible:
                raise PermissionDenied(
                    f"You don't have access to a property containing room '{room.name}'."
                )

        area = serializer.validated_data.get('area')
        if area is not None and getattr(area, 'property_id', None) is not None:
            if area.property_id not in accessible:
                raise PermissionDenied(
                    "You don't have access to that area's property."
                )

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            self._validate_tenant_scope(serializer)
            serializer.save(user=self.request.user, updated_by=self.request.user)
        else:
            serializer.save()

        # Invalidate cache after creating job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    def perform_update(self, serializer):
        if self.request.user.is_authenticated:
            self._validate_tenant_scope(serializer)
            instance = self.get_object()
            data = serializer.validated_data
            if instance.status == 'completed' and 'status' in data and data['status'] != 'completed':
                raise ValidationError("Completed jobs cannot have their status changed.")
            if 'status' in data and data['status'] == 'completed' and instance.status != 'completed':
                serializer.save(updated_by=self.request.user, completed_at=timezone.now())
            else:
                serializer.save(updated_by=self.request.user)
        else:
            serializer.save()

        # Invalidate cache after updating job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        # Invalidate cache after deleting job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    @action(detail=True, methods=['get', 'post'], url_path='comments')
    def comments(self, request, job_id=None):
        """List or create comments on a job. Tenant isolation is enforced via
        the existing get_queryset(): the job must be reachable to the user.
        """
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
        """Reassign the job to another user that shares at least one of the
        job's properties.

        Body: {"user_id": <id|username>, "note"?: str}

        Stamps the remarks with the same status-note format the audit log
        already parses, so the timeline picks up the reassignment as a
        first-class event. Pushes both the new and previous assignee."""
        job = self.get_object()
        target_raw = (request.data or {}).get('user_id')
        if not target_raw:
            return Response(
                {'error': 'user_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target = None
        target_str = str(target_raw).strip()
        if target_str.isdigit():
            target = User.objects.filter(pk=int(target_str)).first()
        if target is None:
            target = User.objects.filter(username__iexact=target_str).first()
        if target is None:
            return Response(
                {'error': 'Target user not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Reassignment scope: target must share at least one property with
        # the job (either through a job-rooms property or the job's area
        # property). Staff/superusers bypass.
        if not (target.is_staff or target.is_superuser):
            job_property_ids = set(
                Property.objects.filter(rooms__jobs=job).values_list('id', flat=True)
            )
            target_property_ids = set(
                Property.objects.filter(users=target).values_list('id', flat=True)
            )
            if job_property_ids and not job_property_ids & target_property_ids:
                return Response(
                    {'error': "Target user has no access to this job's property."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        previous = job.user
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

        job.user = target
        job.updated_by = request.user if getattr(request.user, 'is_authenticated', False) else target
        job.remarks = f"{job.remarks}\n{log_line}" if job.remarks else log_line
        job.save(update_fields=['user', 'updated_by', 'remarks', 'updated_at'])

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
