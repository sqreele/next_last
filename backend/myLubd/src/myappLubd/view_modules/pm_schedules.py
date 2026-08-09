import math
from calendar import monthrange
from datetime import timedelta

from django.db.models import Case, Count, ExpressionWrapper, F, Q, Value, When, fields
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import PMMasterPlan
from ..serializers import PMMasterPlanSerializer, PreventiveMaintenanceListSerializer
from ..services import PreventiveMaintenanceService
from ..tenancy import accessible_property_ids


class PreventiveMaintenanceScheduleMixin:
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

