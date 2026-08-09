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
from .pm_actions import PreventiveMaintenanceActionMixin
from .pm_schedules import PreventiveMaintenanceScheduleMixin


logger = logging.getLogger(__name__)


class PreventiveMaintenanceViewSet(
    PreventiveMaintenanceScheduleMixin,
    PreventiveMaintenanceActionMixin,
    viewsets.ModelViewSet,
):
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
