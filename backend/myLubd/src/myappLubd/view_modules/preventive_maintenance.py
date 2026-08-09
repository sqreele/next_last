import logging
import math
from calendar import monthrange
from datetime import timedelta

from django.db import transaction
from django.db.models import Case, Count, ExpressionWrapper, F, Q, Value, When, fields
from django.http import Http404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import MaintenanceChecklist, MaintenanceHistory, PMMasterPlan, PreventiveMaintenance
from ..serializers import (
    InventoryUsageSerializer,
    PMMasterPlanSerializer,
    PreventiveMaintenanceCompleteSerializer,
    PreventiveMaintenanceCreateUpdateSerializer,
    PreventiveMaintenanceDetailSerializer,
    PreventiveMaintenanceListSerializer,
    PreventiveMaintenanceSerializer,
)
from ..services import PreventiveMaintenanceService
from ..tenancy import accessible_property_ids
from .common import MaintenancePagination
from .inventory_support import consume_inventory_items


logger = logging.getLogger(__name__)


class PreventiveMaintenanceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for PreventiveMaintenance model.
    Provides standard CRUD operations plus custom endpoints:
    - stats: Get statistics about preventive maintenance
    - upcoming: Get list of upcoming maintenance tasks
    - overdue: Get list of overdue maintenance tasks
    - complete: Mark a maintenance task as completed
    - upload_images: Upload before/after images for maintenance tasks
    - reschedule: Reschedule a maintenance task
    - by_priority: Get tasks sorted by priority
    """
    serializer_class = PreventiveMaintenanceSerializer
    pagination_class = MaintenancePagination
    lookup_field = 'pm_id'
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['topics__id', 'frequency']
    search_fields = ['pm_id', 'pmtitle', 'notes']
    ordering_fields = ['scheduled_date', 'created_at', 'frequency']
    ordering = ['-scheduled_date']
    permission_classes = [IsAuthenticated]


    def _get_master_plan_queryset(self):
        queryset = PMMasterPlan.objects.select_related(
            'created_by', 'assigned_to', 'procedure_template'
        ).prefetch_related('topics', 'machines', 'machines__property', 'generated_maintenances')
        property_filter = self.request.query_params.get('property_id')
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            property_ids = accessible_property_ids(user)
            queryset = queryset.filter(machines__property_id__in=property_ids)
        if property_filter:
            queryset = queryset.filter(machines__property__property_id=property_filter)
        return queryset.distinct()

    def _serialize_projected_plan_item(self, occurrence):
        due = occurrence['due_date']
        return {
            'pm_id': occurrence.get('generated_pm_id'),
            'plan_id': occurrence['plan_id'],
            'pmtitle': occurrence['title'],
            'scheduled_date': due.isoformat(),
            'completed_date': None,
            'next_due_date': due.isoformat(),
            'status': occurrence['calendar_status'],
            'frequency': occurrence['frequency'],
            'calendar_date': due.isoformat(),
            'occurrence_type': occurrence['occurrence_type'],
            'calendar_status': occurrence['calendar_status'],
            'generated_pm_id': occurrence.get('generated_pm_id'),
            'lead_time_days': occurrence.get('lead_time_days'),
            'machine_ids': occurrence.get('machine_ids', []),
        }

    def list(self, request, *args, **kwargs):
        """
        List preventive maintenance items with pagination.
        Logs pagination parameters for debugging.
        """
        page_param = request.query_params.get('page')
        page_size_param = request.query_params.get('page_size')
        logger.info(f"[PM List] Pagination params - page: {page_param}, page_size: {page_size_param}")
        logger.info(f"[PM List] All query params: {dict(request.query_params)}")
        
        queryset = self.filter_queryset(self.get_queryset())
        logger.info(f"[PM List] Filtered queryset count: {queryset.count()}")
        
        # Apply pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            logger.info(f"[PM List] Pagination applied - page size: {len(page)}")
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        # If pagination is not applied, return all results (shouldn't happen with page param)
        logger.warning(f"[PM List] Pagination not applied - returning all {queryset.count()} results")
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': len(serializer.data),
            'results': serializer.data,
            'total_pages': 1,
            'current_page': 1,
            'page_size': len(serializer.data),
            'next': None,
            'previous': None,
        })

    def get_object(self):
        """
        Override to support case-insensitive PM ID lookup.
        Returns the object the view is displaying.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        pm_id = self.kwargs[lookup_url_kwarg]
        
        # Try case-insensitive lookup using iexact
        obj = queryset.filter(pm_id__iexact=pm_id).first()
        
        if obj is None:
            from django.http import Http404
            raise Http404(f"No PreventiveMaintenance matches the given query with PM ID: {pm_id}")
        
        # May raise a permission denied
        self.check_object_permissions(self.request, obj)
        
        return obj

    def _get_base_queryset(self):
        """Return PMs scoped to the authenticated user's accessible properties."""
        # ✅ PERFORMANCE: Optimize query with select_related and prefetch_related
        queryset = PreventiveMaintenance.objects.select_related(
            'job',  # Foreign key
            'created_by',  # Foreign key
            'completed_by',  # Foreign key
            'verified_by',  # Foreign key
            'assigned_to',  # Foreign key
            'procedure_template',  # Foreign key
        ).prefetch_related(
            'topics',  # Many-to-many
            'machines',  # Many-to-many
            'machines__property',  # Related property through machines
            'job__rooms',  # Rooms through job
            'job__rooms__properties',  # Properties through rooms
        )

        property_filter = self.request.query_params.get('property_id')
        machine_filter = self.request.query_params.get('machine_id')

        logger.info(f"[PM Filter] User: {self.request.user.username}, property_filter: {property_filter}, machine_filter: {machine_filter}")

        # Restrict by user's accessible properties unless staff/admin
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            # Limit to PMs whose jobs are in rooms belonging to user's properties OR via machines' property
            property_ids = accessible_property_ids(user)
            logger.info(f"[PM Filter] Non-admin user - accessible properties: {sorted(property_ids)}")
            queryset = queryset.filter(
                Q(job__rooms__properties__id__in=property_ids)
                |
                Q(machines__property_id__in=property_ids)
            )
            logger.info(f"[PM Filter] After permission filter: {queryset.count()} records")

        if property_filter:
            logger.info(f"[PM Filter] Applying property filter: {property_filter}")
            before_count = queryset.count()
            queryset = queryset.filter(
                Q(job__rooms__properties__property_id=property_filter)
                |
                Q(machines__property__property_id=property_filter)
            )
            after_count = queryset.count()
            logger.info(f"[PM Filter] Property filter result: {before_count} -> {after_count} records")

        if machine_filter:
            queryset = queryset.filter(machines__machine_id=machine_filter)

        return queryset.distinct()

    def get_queryset(self):
        """
        Return a queryset filtered by request parameters.
        Supports filtering by:
        - status (completed, pending, overdue)
        - topic_id
        - date_from & date_to
        - pm_id (exact match)
        """
        queryset = self._get_base_queryset()

        pm_id = self.request.query_params.get('pm_id')
        status_param = self.request.query_params.get('status')
        topic_id = self.request.query_params.get('topic_id')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')

        if pm_id:
            queryset = queryset.filter(pm_id__icontains=pm_id)

        if status_param:
            now = timezone.now()
            if status_param == 'completed':
                queryset = queryset.filter(completed_date__isnull=False)
            elif status_param == 'pending':
                queryset = queryset.filter(completed_date__isnull=True, scheduled_date__gte=now)
            elif status_param == 'overdue':
                queryset = queryset.filter(completed_date__isnull=True, scheduled_date__lt=now)

        if topic_id:
            queryset = queryset.filter(topics__id=topic_id)

        if date_from:
            queryset = queryset.filter(scheduled_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(scheduled_date__lte=date_to)

        return queryset.distinct()

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return PreventiveMaintenanceListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return PreventiveMaintenanceCreateUpdateSerializer
        elif self.action in ['retrieve']:
            return PreventiveMaintenanceDetailSerializer
        elif self.action == 'complete':
            return PreventiveMaintenanceCompleteSerializer
        return self.serializer_class

    def _extract_machine_ids_from_request(self):
        """
        Normalize machine_ids coming from the request into a clean list of strings.
        Handles QueryDicts (getlist), regular dicts, and single values.
        """
        data = self.request.data

        def _normalize(value):
            if value is None:
                return []
            if isinstance(value, (list, tuple, set)):
                return [str(item).strip() for item in value if str(item).strip()]
            string_value = str(value).strip()
            return [string_value] if string_value else []

        if hasattr(data, "getlist"):
            machine_ids = data.getlist("machine_ids")
            return _normalize(machine_ids)

        if isinstance(data, dict):
            return _normalize(data.get("machine_ids"))

        return []

    def _log_machine_id_state(self, action, instance=None):
        machine_ids = self._extract_machine_ids_from_request()
        user = getattr(self.request, "user", None)
        username = getattr(user, "username", "anonymous")
        property_hint = self.request.data.get("property_id") if isinstance(self.request.data, dict) else None

        log_payload = {
            "user": username,
            "action": action,
            "machine_ids_received": machine_ids,
            "machine_id_count": len(machine_ids),
            "property_hint": property_hint,
            "request_keys": list(self.request.data.keys()) if hasattr(self.request.data, "keys") else "unavailable",
        }

        if instance is not None:
            linked_ids = list(instance.machines.values_list("machine_id", flat=True))
            log_payload.update(
                {
                    "instance_pm_id": instance.pm_id,
                    "instance_machine_count": len(linked_ids),
                    "instance_machine_ids": linked_ids,
                }
            )

        if machine_ids:
            logger.info("[PM MACHINE TRACE] %s", log_payload)
        else:
            logger.warning("[PM MACHINE TRACE] Missing machine_ids in request", extra={"machine_trace": log_payload})

    def perform_create(self, serializer):
        """Add the current user as the creator when creating a record, logging machine associations"""
        self._log_machine_id_state(action="create_start")
        instance = serializer.save(created_by=self.request.user)
        self._log_machine_id_state(action="create_complete", instance=instance)
        return instance

    def perform_update(self, serializer):
        """Add the current user as the updater when updating a record, logging machine associations"""
        self._log_machine_id_state(action="update_start")
        instance = serializer.save(updated_by=self.request.user)
        self._log_machine_id_state(action="update_complete", instance=instance)
        return instance

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get statistics about preventive maintenance tasks
        """
        now = timezone.now()
        queryset = self.get_queryset()

        total = queryset.count()
        completed = queryset.filter(completed_date__isnull=False).count()
        overdue = queryset.filter(completed_date__isnull=True, scheduled_date__lt=now).count()
        pending = total - completed - overdue

        frequency_queryset = queryset.values('frequency').annotate(count=Count('frequency'))
        frequency_distribution = [
            {'frequency': item['frequency'], 'count': item['count']}
            for item in frequency_queryset
        ]

        completed_tasks = queryset.filter(completed_date__isnull=False)
        completed_count = completed_tasks.count()
        on_time_count = completed_tasks.filter(completed_date__lte=F('scheduled_date')).count()
        completion_rate = (on_time_count / completed_count * 100) if completed_count > 0 else 0

        seven_days_later = now + timedelta(days=7)
        upcoming_queryset = queryset.filter(
            completed_date__isnull=True,
            scheduled_date__gte=now,
            scheduled_date__lte=seven_days_later
        ).order_by('scheduled_date')[:5]

        upcoming_serializer = PreventiveMaintenanceListSerializer(
            upcoming_queryset, many=True, context={'request': request}
        )

        avg_completion_times = {}
        for freq in ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'biannually', 'annually']:
            tasks = completed_tasks.filter(frequency=freq)
            if tasks.count() > 0:
                sum_days = sum(
                    (task.completed_date - task.scheduled_date).days
                    for task in tasks
                    if task.scheduled_date and task.completed_date
                )
                avg_completion_times[freq] = round(sum_days / tasks.count(), 1) if tasks.count() > 0 else 0

        response_data = {
            'counts': {
                'total': total,
                'completed': completed,
                'pending': pending,
                'overdue': overdue
            },
            'frequency_distribution': frequency_distribution,
            'completion_rate': round(completion_rate, 1),
            'avg_completion_times': avg_completion_times,
            'upcoming': upcoming_serializer.data
        }
        return Response(response_data)


    @action(detail=False, methods=['get', 'post'], url_path='plans')
    def plans(self, request):
        """List or create PM master plans / recurring rules."""
        if request.method.lower() == 'get':
            queryset = self._get_master_plan_queryset()
            plan_id = request.query_params.get('plan_id')
            if plan_id:
                queryset = queryset.filter(plan_id__iexact=plan_id)
            serializer = PMMasterPlanSerializer(queryset, many=True, context={'request': request})
            return Response(serializer.data)

        serializer = PMMasterPlanSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        plan = serializer.save(created_by=request.user)
        return Response(PMMasterPlanSerializer(plan, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='projection')
    def projection(self, request):
        """Return virtual PM master-plan occurrences without creating actual PM records."""
        from datetime import datetime
        from_param = request.query_params.get('from')
        days_param = request.query_params.get('days', '365')
        try:
            days = max(1, min(int(days_param), 366))
        except (TypeError, ValueError):
            days = 365
        if from_param:
            try:
                start_dt = datetime.fromisoformat(from_param.replace('Z', '+00:00'))
                if timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
            except ValueError:
                start_dt = timezone.now()
        else:
            start_dt = timezone.now()
        start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = start_dt + timedelta(days=days)
        occurrences = []
        for plan in self._get_master_plan_queryset().filter(active=True):
            occurrences.extend(PreventiveMaintenanceService.project_master_plan(plan, start_dt, end_dt))
        occurrences.sort(key=lambda item: item['due_date'])
        return Response({
            'from': start_dt.date().isoformat(),
            'to': (end_dt - timedelta(days=1)).date().isoformat(),
            'total': len(occurrences),
            'items': [self._serialize_projected_plan_item(item) for item in occurrences],
        })

    @action(detail=False, methods=['post'], url_path='materialize-plans')
    def materialize_plans(self, request):
        """Generate actual PM forms whose master-plan occurrences are inside their lead window."""
        dry_run = str(request.data.get('dry_run', '')).lower() in {'1', 'true', 'yes'}
        result = PreventiveMaintenanceService.materialize_master_plan_occurrences(
            cutoff=timezone.now(),
            user=request.user,
            dry_run=dry_run,
        )
        return Response(result)

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """
        Get upcoming preventive maintenance tasks
        """
        days = int(request.query_params.get('days', 30))
        now = timezone.now()
        end_date = now + timedelta(days=days)

        queryset = self.get_queryset().filter(
            completed_date__isnull=True,
            scheduled_date__gte=now,
            scheduled_date__lte=end_date
        ).order_by('scheduled_date')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PreventiveMaintenanceListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        serializer = PreventiveMaintenanceListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='schedule')
    def schedule(self, request):
        """
        Calendar-friendly view of preventive maintenance work.

        Groups PMs into per-day buckets so the frontend can render a calendar
        without doing the bucketing client-side. Buckets are ordered by date
        and include both open and recently-completed PMs so users can see
        what was done in the visible window.

        Query params:
            from   ISO date (default = today).
            days   Window length in days (default 30, capped at 180).
            status `open` (default) | `completed` | `all`.
        """
        from datetime import datetime

        days_param = request.query_params.get('days', '30')
        try:
            days = max(1, min(int(days_param), 180))
        except (TypeError, ValueError):
            days = 30

        from_param = request.query_params.get('from')
        if from_param:
            try:
                start_dt = datetime.fromisoformat(from_param.replace('Z', '+00:00'))
                if timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
            except ValueError:
                start_dt = timezone.now()
        else:
            start_dt = timezone.now()
        start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = start_dt + timedelta(days=days)

        status_filter = (request.query_params.get('status') or 'open').lower()
        if status_filter not in {'open', 'completed', 'all'}:
            status_filter = 'open'

        # A completed recurring PM keeps its original scheduled date and stores
        # its next occurrence in next_due_date. Include both fields in the
        # candidate query; filtering only on scheduled_date made the machine's
        # "Next Due" value disappear from the calendar.
        scheduled_in_window = Q(scheduled_date__gte=start_dt, scheduled_date__lt=end_dt)
        next_due_in_window = Q(next_due_date__gte=start_dt, next_due_date__lt=end_dt)
        if status_filter == 'open':
            occurrence_filter = (
                Q(completed_date__isnull=True) & scheduled_in_window
            ) | (Q(completed_date__isnull=False) & next_due_in_window)
        elif status_filter == 'completed':
            occurrence_filter = Q(completed_date__isnull=False) & scheduled_in_window
        else:
            occurrence_filter = scheduled_in_window | (
                Q(completed_date__isnull=False) & next_due_in_window
            )

        # Use only tenant/property/machine scoping here. Generic list filters such
        # as date_from/date_to target scheduled_date only, which would hide a
        # completed recurring PM whose next_due_date is inside this schedule window.
        qs = self._get_base_queryset().filter(occurrence_filter).distinct().order_by('scheduled_date')

        serializer = PreventiveMaintenanceListSerializer(qs, many=True, context={'request': request})
        items_by_id = {str(item.get('pm_id')): item for item in serializer.data}

        # Bucket by local date string YYYY-MM-DD. We pre-build every day in the
        # range so the client can render an even calendar without filling gaps.
        bucket_index = {}
        days_out = []
        cursor = start_dt
        for _ in range(days):
            key = cursor.date().isoformat()
            bucket = {
                'date': key,
                'weekday': cursor.strftime('%a'),
                'items': [],
                'overdue_count': 0,
                'open_count': 0,
                'completed_count': 0,
            }
            bucket_index[key] = bucket
            days_out.append(bucket)
            cursor += timedelta(days=1)

        now = timezone.now()

        def add_occurrence(pm, occurrence_date, occurrence_type, calendar_status):
            local_date = timezone.localtime(occurrence_date)
            key = local_date.date().isoformat()
            bucket = bucket_index.get(key)
            if bucket is None:
                return
            serialized = items_by_id.get(str(pm.pm_id))
            if serialized:
                item = dict(serialized)
                item['calendar_date'] = occurrence_date.isoformat()
                item['occurrence_type'] = occurrence_type
                item['calendar_status'] = calendar_status
                bucket['items'].append(item)

            if calendar_status == 'completed':
                bucket['completed_count'] += 1
            elif occurrence_date < now:
                bucket['overdue_count'] += 1
            else:
                bucket['open_count'] += 1

        for pm in qs:
            if (
                status_filter in {'open', 'all'}
                and pm.completed_date is None
                and start_dt <= pm.scheduled_date < end_dt
            ):
                add_occurrence(pm, pm.scheduled_date, 'scheduled', 'open')

            if (
                status_filter in {'completed', 'all'}
                and pm.completed_date is not None
                and start_dt <= pm.scheduled_date < end_dt
            ):
                add_occurrence(pm, pm.scheduled_date, 'scheduled', 'completed')

            if (
                status_filter in {'open', 'all'}
                and pm.completed_date is not None
                and pm.next_due_date is not None
                and start_dt <= pm.next_due_date < end_dt
            ):
                add_occurrence(pm, pm.next_due_date, 'next_due', 'open')


        # Add virtual PM Master Plan projections. These calendar entries are not
        # actual PreventiveMaintenance records until the materialization window.
        if status_filter in {'open', 'all'}:
            for plan in self._get_master_plan_queryset().filter(active=True):
                for occurrence in PreventiveMaintenanceService.project_master_plan(plan, start_dt, end_dt):
                    if occurrence.get('generated_pm_id'):
                        continue
                    due = occurrence['due_date']
                    local_date = timezone.localtime(due)
                    key = local_date.date().isoformat()
                    bucket = bucket_index.get(key)
                    if bucket is None:
                        continue
                    item = self._serialize_projected_plan_item(occurrence)
                    bucket['items'].append(item)
                    if due < now:
                        bucket['overdue_count'] += 1
                    else:
                        bucket['open_count'] += 1

        # Drop None entries that snuck in from missing pm_id matches.
        for bucket in days_out:
            bucket['items'] = [item for item in bucket['items'] if item]

        return Response({
            'from': start_dt.date().isoformat(),
            'to': (end_dt - timedelta(days=1)).date().isoformat(),
            'days': days_out,
            'total': sum(len(bucket['items']) for bucket in days_out),
            'status': status_filter,
        })

    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """
        Get overdue preventive maintenance tasks
        """
        sort_by = request.query_params.get('sort_by', 'date')
        now = timezone.now()

        queryset = self.get_queryset().filter(completed_date__isnull=True, scheduled_date__lt=now)

        if sort_by == 'overdue_days':
            queryset = queryset.annotate(
                days_overdue=ExpressionWrapper(
                    now - F('scheduled_date'), output_field=fields.DurationField()
                )
            ).order_by('-days_overdue')
        else:
            queryset = queryset.order_by('scheduled_date')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = PreventiveMaintenanceListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        serializer = PreventiveMaintenanceListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pm_id=None):
        """
        Mark a preventive maintenance task as completed
        """
        instance = self.get_object()
        if instance.completed_date:
            return Response(
                {'detail': 'This maintenance task is already completed.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        completed_date = request.data.get('completed_date')
        if completed_date:
            from django.utils.dateparse import parse_datetime

            parsed_date = parse_datetime(str(completed_date))
            if parsed_date:
                completed_date = parsed_date

        checklist_updates = request.data.get('checklist_items') or request.data.get('checklist') or []
        inventory_usage = request.data.get('inventory_usage') or request.data.get('parts_used') or []

        with transaction.atomic():
            update_fields = []
            if 'after_image' in request.FILES:
                instance.after_image = request.FILES['after_image']
                update_fields.append('after_image')

            for raw_item in checklist_updates:
                item_text = (raw_item.get('item') or raw_item.get('title') or '').strip()
                if not item_text:
                    continue
                checklist_item = None
                item_id = raw_item.get('id')
                if item_id:
                    checklist_item = instance.checklists.filter(id=item_id).first()
                if checklist_item is None:
                    checklist_item = instance.checklists.filter(item__iexact=item_text).first()
                if checklist_item is None:
                    checklist_item = MaintenanceChecklist.objects.create(
                        maintenance=instance,
                        item=item_text[:200],
                        description=raw_item.get('description') or '',
                        order=raw_item.get('order') or instance.checklists.count() + 1,
                    )

                is_completed = bool(raw_item.get('is_completed', raw_item.get('completed', True)))
                checklist_item.is_completed = is_completed
                if is_completed:
                    checklist_item.completed_by = request.user
                    checklist_item.completed_at = timezone.now()
                checklist_item.save(update_fields=['is_completed', 'completed_by', 'completed_at'])

            usage_records = consume_inventory_items(
                user=request.user,
                items=inventory_usage,
                preventive_maintenance=instance,
                source='preventive_maintenance',
            )

            result = PreventiveMaintenanceService.update_status(
                maintenance=instance,
                new_status='completed',
                user=request.user,
                completed_date=completed_date,
            )

            if update_fields:
                result['current'].save(update_fields=update_fields)

            if instance.machines.exists():
                instance.machines.update(last_maintenance_date=result['current'].completed_date or timezone.now())

            MaintenanceHistory.objects.create(
                maintenance=result['current'],
                action='completed',
                notes=request.data.get('completion_notes') or request.data.get('notes') or '',
                performed_by=request.user,
            )

        response_data = PreventiveMaintenanceDetailSerializer(
            result['current'],
            context={'request': request},
        ).data
        response_data['inventory_usage'] = InventoryUsageSerializer(
            usage_records,
            many=True,
            context={'request': request},
        ).data

        if result['next_schedule']:
            response_data['next_schedule_pm_id'] = result['next_schedule'].pm_id
            response_data['next_schedule_scheduled_date'] = result['next_schedule'].scheduled_date

        return Response(response_data)

    def _calculate_next_due_date(self, instance, reference_date):
        """
        Calculate the next scheduled date based on the maintenance frequency and completion date.
        Uses calendar-aware calculations for monthly/quarterly/annual frequencies.
        """
        frequency = instance.frequency
        logger.info(f"[PM Complete] Calculating next due date for PM {instance.pm_id}: frequency={frequency}, reference_date={reference_date}")
        
        if frequency == 'custom' and instance.custom_days:
            next_date = reference_date + timedelta(days=instance.custom_days)
            logger.info(f"[PM Complete] Custom frequency: {instance.custom_days} days -> next_date={next_date}")
            return next_date
        
        if frequency == 'daily':
            next_date = reference_date + timedelta(days=1)
        elif frequency == 'weekly':
            next_date = reference_date + timedelta(weeks=1)
        elif frequency == 'biweekly':
            next_date = reference_date + timedelta(weeks=2)
        elif frequency == 'monthly':
            # Add one calendar month
            month = reference_date.month + 1
            year = reference_date.year
            if month > 12:
                month = 1
                year += 1
            # Handle different month lengths (e.g., Jan 31 -> Feb 28/29)
            day = min(reference_date.day, monthrange(year, month)[1])
            next_date = reference_date.replace(year=year, month=month, day=day)
        elif frequency == 'quarterly':
            # Add three calendar months
            month = reference_date.month + 3
            year = reference_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(reference_date.day, monthrange(year, month)[1])
            next_date = reference_date.replace(year=year, month=month, day=day)
        elif frequency == 'semi_annual':
            # Add six calendar months
            month = reference_date.month + 6
            year = reference_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(reference_date.day, monthrange(year, month)[1])
            next_date = reference_date.replace(year=year, month=month, day=day)
        elif frequency == 'annual':
            # Add one calendar year
            next_date = reference_date.replace(year=reference_date.year + 1)
        else:
            # Default to monthly if frequency not recognized
            month = reference_date.month + 1
            year = reference_date.year
            if month > 12:
                month = 1
                year += 1
            day = min(reference_date.day, monthrange(year, month)[1])
            next_date = reference_date.replace(year=year, month=month, day=day)
        
        logger.info(f"[PM Complete] Calculated next scheduled date: {next_date} (from {reference_date} with frequency {frequency})")
        return next_date

    @action(detail=True, methods=['post'])
    def change_status(self, request, pm_id=None):
        """
        Update the status of a preventive maintenance task with validation.
        """
        instance = self.get_object()
        new_status = request.data.get('status')
        completed_date = request.data.get('completed_date')

        if not new_status:
            return Response(
                {'detail': 'Status is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        parsed_completed_date = None
        if completed_date:
            from django.utils.dateparse import parse_datetime

            parsed_completed_date = parse_datetime(str(completed_date))
            if not parsed_completed_date:
                return Response(
                    {'detail': 'Completed Date must be a valid datetime.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        try:
            result = PreventiveMaintenanceService.update_status(
                maintenance=instance,
                new_status=new_status,
                user=request.user,
                completed_date=parsed_completed_date,
            )
        except Exception as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )

        response_data = PreventiveMaintenanceDetailSerializer(
            result['current'],
            context={'request': request},
        ).data

        if result['next_schedule']:
            response_data['next_schedule_pm_id'] = result['next_schedule'].pm_id
            response_data['next_schedule_scheduled_date'] = result['next_schedule'].scheduled_date

        return Response(response_data)

    @action(detail=False, methods=['post'])
    def import_csv(self, request):
        """
        Import preventive maintenance records from a CSV file.
        """
        upload = request.FILES.get('file')
        if not upload:
            return Response(
                {'detail': 'CSV file is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            content = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response(
                {'detail': 'Unable to decode CSV. Please upload a UTF-8 encoded file.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = PreventiveMaintenanceService.import_from_csv_content(
            content,
            default_user=request.user,
        )

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def upload_images(self, request, pm_id=None):
        """
        Upload images for a preventive maintenance task
        """
        instance = self.get_object()
        updated = False

        if 'before_image' in request.FILES:
            instance.before_image = request.FILES['before_image']
            updated = True

        if 'after_image' in request.FILES:
            instance.after_image = request.FILES['after_image']
            updated = True

        if not updated:
            return Response(
                {'detail': 'No images provided. Use "before_image" or "after_image" fields.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        instance.updated_by = request.user
        instance.save()
        serializer = PreventiveMaintenanceDetailSerializer(instance, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pm_id=None):
        """
        Reschedule a maintenance task
        """
        instance = self.get_object()
        if instance.completed_date:
            return Response(
                {'detail': 'Cannot reschedule a completed task.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if 'scheduled_date' not in request.data:
            return Response(
                {'detail': 'Scheduled date must be provided.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        instance.scheduled_date = request.data['scheduled_date']
        if 'reason' in request.data:
            instance.notes = (instance.notes or "") + f"\n[{timezone.now().strftime('%Y-%m-%d %H:%M')}] Rescheduled: {request.data['reason']}"

        instance.updated_by = request.user
        instance.save()
        serializer = PreventiveMaintenanceDetailSerializer(instance, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_priority(self, request):
        """
        Get maintenance tasks sorted by priority and status
        """
        now = timezone.now()
        queryset = self.get_queryset()

        overdue = queryset.filter(completed_date__isnull=True, scheduled_date__lt=now)
        upcoming = queryset.filter(completed_date__isnull=True, scheduled_date__gte=now)

        priority_order = Case(
            When(priority='high', then=Value(1)),
            When(priority='medium', then=Value(2)),
            When(priority='low', then=Value(3)),
            default=Value(4),
            output_field=fields.IntegerField()
        )

        overdue = overdue.annotate(priority_order=priority_order).order_by('priority_order', 'scheduled_date')
        upcoming = upcoming.annotate(priority_order=priority_order).order_by('priority_order', 'scheduled_date')

        combined_queryset = list(overdue) + list(upcoming)

        page_size = int(request.query_params.get('page_size', 10))
        page = int(request.query_params.get('page', 1))
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_results = combined_queryset[start_idx:end_idx]

        serializer = PreventiveMaintenanceListSerializer(paginated_results, many=True, context={'request': request})

        total_items = len(combined_queryset)
        total_pages = math.ceil(total_items / page_size)

        return Response({
            'count': total_items,
            'total_pages': total_pages,
            'current_page': page,
            'results': serializer.data
        })

