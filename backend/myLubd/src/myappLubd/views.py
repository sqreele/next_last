from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import status, viewsets, filters
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from django.db.models import Prefetch
from rest_framework_simplejwt.tokens import RefreshToken
from google.oauth2 import id_token
from google.auth.transport import requests
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.utils import timezone
import math
from django.db.models import Count, Q, F, ExpressionWrapper, fields, Case, When, Value, Avg
from django.db.models.functions import ExtractMonth, ExtractYear
from django.db import models
from .models import UserProfile, Property, Room, Topic, Job, Session, PreventiveMaintenance, JobImage, Machine, MaintenanceProcedure, UtilityConsumption, Inventory, RosterLeave
from django.urls import reverse
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .serializers import (
    UserProfileSerializer, PropertySerializer, RoomSerializer, TopicSerializer, JobSerializer,
    UserSerializer, PreventiveMaintenanceSerializer, PreventiveMaintenanceCreateUpdateSerializer,
    PreventiveMaintenanceCompleteSerializer, PreventiveMaintenanceListSerializer,
    PreventiveMaintenanceDetailSerializer, PropertyPMStatusSerializer,
    MachineSerializer, MachineListSerializer, MachineDetailSerializer,
    MachineCreateSerializer, MachineUpdateSerializer, MachinePreventiveMaintenanceSerializer,
    MaintenanceProcedureSerializer, MaintenanceProcedureListSerializer,
    UtilityConsumptionSerializer, UtilityConsumptionListSerializer,
    InventorySerializer, InventoryListSerializer, RosterLeaveSerializer
)
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from .pagination import StandardResultsSetPagination, LargeResultsSetPagination, SmallResultsSetPagination
from django.shortcuts import get_object_or_404
import logging
import json
import uuid
from datetime import timedelta
from calendar import monthrange
from django.http import JsonResponse, HttpResponseRedirect
import os
from django.http import HttpResponse, Http404
from django.conf import settings
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_http_methods
from .cache import cache_result, CacheManager
from .services import NotificationService, PreventiveMaintenanceService

logger = logging.getLogger(__name__)
User = get_user_model()

# Pagination class
class MaintenancePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    page_query_param = 'page'  # Explicitly set page query param name
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page.paginator.per_page
        logger.info(f"[Pagination] Page: {self.page.number}, Page Size: {page_size}, Total: {self.page.paginator.count}, Total Pages: {self.page.paginator.num_pages}")
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': page_size,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        })

# Preventive Maintenance ViewSet
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

    def get_queryset(self):
        """
        Return a queryset filtered by request parameters.
        Supports filtering by:
        - status (completed, pending, overdue)
        - topic_id
        - date_from & date_to
        - pm_id (exact match)
        """
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

        pm_id = self.request.query_params.get('pm_id')
        status_param = self.request.query_params.get('status')
        topic_id = self.request.query_params.get('topic_id')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        property_filter = self.request.query_params.get('property_id')
        machine_filter = self.request.query_params.get('machine_id')

        logger.info(f"[PM Filter] User: {self.request.user.username}, property_filter: {property_filter}, machine_filter: {machine_filter}")

        # Restrict by user's accessible properties unless staff/admin
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            # Limit to PMs whose jobs are in rooms belonging to user's properties OR via machines' property
            accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
            logger.info(f"[PM Filter] Non-admin user - accessible properties: {list(accessible_property_ids)}")
            queryset = queryset.filter(
                Q(job__rooms__properties__in=accessible_property_ids)
                |
                Q(machines__property__in=accessible_property_ids)
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

        result = PreventiveMaintenanceService.update_status(
            maintenance=instance,
            new_status='completed',
            user=request.user,
            completed_date=completed_date,
        )

        response_data = PreventiveMaintenanceDetailSerializer(
            result['current'],
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

# Machine ViewSet (Consolidated)
class MachineViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing machines.
    """
    queryset = Machine.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = MaintenancePagination
    lookup_field = 'machine_id'
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'property', 'location']
    search_fields = ['name', 'description', 'machine_id']
    ordering_fields = ['name', 'created_at', 'installation_date', 'last_maintenance_date']
    ordering = ['name']

    def get_queryset(self):
        """
        Return a list of machines for the authenticated user or all machines for staff.
        """
        user = self.request.user
        queryset = Machine.objects.select_related('property').prefetch_related(
            Prefetch('preventive_maintenances', queryset=PreventiveMaintenance.objects.order_by('next_due_date'))
        )

        if not (user.is_staff or user.has_perm('machines.view_all_machines')):
            queryset = queryset.filter(property__users=user)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        property_filter = self.request.query_params.get('property_id')
        if property_filter:
            queryset = queryset.filter(property__property_id=property_filter)

        search_term = self.request.query_params.get('search')
        if search_term:
            queryset = queryset.filter(
                Q(name__icontains=search_term) |
                Q(description__icontains=search_term) |
                Q(machine_id__icontains=search_term)
            )

        return queryset.distinct()

    def get_serializer_class(self):
        """
        Return appropriate serializer class based on action
        """
        if self.action == 'list':
            return MachineListSerializer
        elif self.action == 'retrieve':
            return MachineDetailSerializer
        elif self.action == 'create':
            return MachineCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return MachineUpdateSerializer
        elif self.action == 'set_preventive_maintenances':
            return MachinePreventiveMaintenanceSerializer
        return MachineDetailSerializer

    def list(self, request, *args, **kwargs):
        """List all machines with lighter serializer"""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a single machine with detailed information"""
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Create a new machine"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """Update an existing machine"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def set_maintenance(self, request, pk=None):
        """Set the last maintenance date to current time"""
        machine = self.get_object()
        machine.last_maintenance_date = timezone.now()
        machine.save(update_fields=['last_maintenance_date', 'updated_at'])
        serializer = MachineDetailSerializer(machine, context={'request': request})
        return Response({
            'status': 'maintenance date updated',
            'machine': serializer.data
        })

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        """Change the status of a machine"""
        machine = self.get_object()
        status_value = request.data.get('status')
        status_choices = dict(Machine.STATUS_CHOICES)

        if status_value not in status_choices:
            return Response(
                {
                    'error': f'Invalid status. Choose from {list(status_choices.keys())}',
                    'valid_statuses': status_choices
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        machine.status = status_value
        machine.save(update_fields=['status', 'updated_at'])
        serializer = MachineDetailSerializer(machine, context={'request': request})
        return Response({
            'status': f'Machine status changed to {status_value}',
            'machine': serializer.data
        })

    @action(detail=True, methods=['post'])
    def set_preventive_maintenances(self, request, pk=None):
        """Associate preventive maintenance schedules with the machine"""
        machine = self.get_object()
        serializer = self.get_serializer(machine, data=request.data)
        if serializer.is_valid():
            serializer.save()
            response_serializer = MachineDetailSerializer(machine, context={'request': request})
            return Response({
                'status': 'preventive maintenances updated',
                'machine': response_serializer.data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def maintenance_history(self, request, pk=None):
        """Get history of completed maintenance for this machine"""
        machine = self.get_object()
        maintenances = machine.preventive_maintenances.filter(
            completed_date__isnull=False
        ).order_by('-completed_date')
        serializer = PreventiveMaintenanceListSerializer(maintenances, many=True, context={'request': request})
        return Response(serializer.data)

# Maintenance Procedure ViewSet
class MaintenanceProcedureViewSet(viewsets.ModelViewSet):
    """
    ViewSet for MaintenanceProcedure model.
    Provides CRUD operations for maintenance procedures and step management.
    Note: Maintenance procedures are shared templates accessible to all users.
    Only admin users can create, update, or delete procedures.
    """
    serializer_class = MaintenanceProcedureSerializer
    pagination_class = MaintenancePagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['difficulty_level', 'created_at']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'created_at', 'estimated_duration']
    ordering = ['name']
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Return all maintenance procedures for all users (they are shared templates).
        However, only admin users can create/update/delete them.
        """
        return MaintenanceProcedure.objects.all()

    def perform_create(self, serializer):
        """Only admin users can create procedures"""
        if not (self.request.user.is_superuser or self.request.user.is_staff):
            raise PermissionDenied("Only admin users can create maintenance procedures")
        serializer.save()

    def perform_update(self, serializer):
        """Only admin users can update procedures"""
        if not (self.request.user.is_superuser or self.request.user.is_staff):
            raise PermissionDenied("Only admin users can update maintenance procedures")
        serializer.save()

    def perform_destroy(self, instance):
        """Only admin users can delete procedures"""
        if not (self.request.user.is_superuser or self.request.user.is_staff):
            raise PermissionDenied("Only admin users can delete maintenance procedures")
        instance.delete()

    def get_serializer_class(self):
        if self.action == 'list':
            return MaintenanceProcedureListSerializer
        return MaintenanceProcedureSerializer

    @action(detail=True, methods=['post'])
    def add_step(self, request, pk=None):
        """Add a new step to a maintenance procedure"""
        procedure = self.get_object()
        step_data = request.data
        
        try:
            new_step = procedure.add_step(step_data)
            return Response({
                'success': True,
                'message': f'Step added successfully. Total steps: {procedure.get_steps_count()}',
                'step': new_step
            })
        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=400)

    @action(detail=True, methods=['put'])
    def update_step(self, request, pk=None):
        """Update a specific step in a maintenance procedure"""
        procedure = self.get_object()
        step_number = request.data.get('step_number')
        step_data = request.data
        
        if not step_number:
            return Response({
                'success': False,
                'error': 'step_number is required'
            }, status=400)
        
        try:
            updated_step = procedure.update_step(step_number, step_data)
            return Response({
                'success': True,
                'message': f'Step {step_number} updated successfully',
                'step': updated_step
            })
        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=400)

    @action(detail=True, methods=['delete'])
    def delete_step(self, request, pk=None):
        """Delete a specific step from a maintenance procedure"""
        procedure = self.get_object()
        step_number = request.query_params.get('step_number')
        
        if not step_number:
            return Response({
                'success': False,
                'error': 'step_number query parameter is required'
            }, status=400)
        
        try:
            step_number = int(step_number)
            procedure.delete_step(step_number)
            return Response({
                'success': True,
                'message': f'Step {step_number} deleted successfully. Total steps: {procedure.get_steps_count()}'
            })
        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=400)

    @action(detail=True, methods=['post'])
    def reorder_steps(self, request, pk=None):
        """Reorder steps in a maintenance procedure"""
        procedure = self.get_object()
        new_order = request.data.get('new_order')
        
        if not new_order or not isinstance(new_order, list):
            return Response({
                'success': False,
                'error': 'new_order must be a list of step numbers'
            }, status=400)
        
        try:
            procedure.reorder_steps(new_order)
            return Response({
                'success': True,
                'message': 'Steps reordered successfully',
                'steps': procedure.steps
            })
        except ValueError as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=400)

    @action(detail=True, methods=['get'])
    def validate_procedure(self, request, pk=None):
        """Validate a maintenance procedure and return any errors"""
        procedure = self.get_object()
        is_valid, errors = procedure.validate_steps()
        
        return Response({
            'is_valid': is_valid,
            'errors': errors,
            'total_steps': procedure.get_steps_count(),
            'total_estimated_time': procedure.get_total_estimated_time()
        })

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Duplicate a maintenance procedure with a new name"""
        procedure = self.get_object()
        new_name = request.data.get('new_name')
        
        if not new_name:
            return Response({
                'success': False,
                'error': 'new_name is required'
            }, status=400)
        
        try:
            duplicate = procedure.duplicate_procedure(new_name)
            return Response({
                'success': True,
                'message': f'Procedure duplicated successfully as "{new_name}"',
                'duplicate_id': duplicate.id,
                'duplicate_name': duplicate.name
            })
        except Exception as e:
            return Response({
                'success': False,
                'error': f'Failed to duplicate procedure: {str(e)}'
            }, status=400)

    @action(detail=False, methods=['get'])
    def by_difficulty(self, request):
        """Get procedures grouped by difficulty level"""
        difficulty = request.query_params.get('difficulty')
        queryset = self.get_queryset()
        
        if difficulty:
            queryset = queryset.filter(difficulty_level=difficulty)
        
        procedures = queryset.values('difficulty_level').annotate(
            count=Count('id'),
            avg_duration=Avg('estimated_duration')
        ).order_by('difficulty_level')
        
        return Response({
            'success': True,
            'data': procedures
        })

    @action(detail=False, methods=['get'])
    def search_by_tools(self, request):
        """Search procedures by required tools"""
        tool_query = request.query_params.get('tool', '')
        if not tool_query:
            return Response({
                'success': False,
                'error': 'tool query parameter is required'
            }, status=400)
        
        queryset = self.get_queryset()
        # Search in required_tools field
        matching_procedures = []
        
        for procedure in queryset:
            if procedure.required_tools and tool_query.lower() in procedure.required_tools.lower():
                matching_procedures.append(MaintenanceProcedureListSerializer(procedure).data)
        
        return Response({
            'success': True,
            'count': len(matching_procedures),
            'data': matching_procedures
        })


# Other ViewSets and Views (unchanged)
class RoomViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = RoomSerializer

    def get_queryset(self):
        """
        Return rooms that belong to properties the user has access to.
        """
        user = self.request.user
        logger.info(f"User {user.username} requesting rooms")
        
        # ✅ PERFORMANCE: Optimize query with prefetch_related
        base_queryset = Room.objects.prefetch_related('properties')
        
        # Check if user is admin/superuser - give access to all properties and rooms
        if user.is_superuser or user.is_staff:
            logger.info(f"User {user.username} is admin/staff - returning all rooms")
            property_id = self.request.query_params.get('property')
            if property_id:
                queryset = base_queryset.filter(properties__property_id=property_id)
                logger.info(f"Found {queryset.count()} rooms for property {property_id}")
                return queryset
            return base_queryset
        
        # Special case for admin username
        if user.username == 'admin':
            logger.info(f"Admin username {user.username} - returning all rooms")
            property_id = self.request.query_params.get('property')
            if property_id:
                queryset = base_queryset.filter(properties__property_id=property_id)
                logger.info(f"Found {queryset.count()} rooms for property {property_id}")
                return queryset
            return base_queryset
        
        # Get properties the user has access to
        user_properties = Property.objects.filter(users=user)
        logger.info(f"User has access to {user_properties.count()} properties")
        
        # Filter rooms by property parameter if provided
        property_id = self.request.query_params.get('property')
        if property_id:
            logger.info(f"Filtering rooms by property: {property_id}")
            
            # First, try to find rooms by property_id (more permissive approach)
            try:
                # Check if user has access to this specific property
                property_obj = user_properties.get(property_id=property_id)
                logger.info(f"Found property object: {property_obj.name} ({property_obj.property_id})")
                
                # Try different query approaches for debugging
                queryset1 = Room.objects.filter(properties=property_obj)
                logger.info(f"Query 1 (properties=property_obj): {queryset1.count()} rooms")
                
                queryset2 = Room.objects.filter(properties__property_id=property_id)
                logger.info(f"Query 2 (properties__property_id): {queryset2.count()} rooms")
                
                # Use the second approach as it's more explicit
                queryset = queryset2
                logger.info(f"Final result: {queryset.count()} rooms for property {property_id}")
                
                # Return the queryset (even if empty)
                return queryset
                
            except Property.DoesNotExist:
                logger.warning(f"User {user.username} doesn't have access to property {property_id}")
                # Return empty queryset if user doesn't have access to the requested property
                return Room.objects.none()
        
        # If no property filter, return all rooms from user's properties
        logger.info(f"User properties: {[p.property_id for p in user_properties]}")
        
        # Try different query approaches for debugging
        queryset1 = Room.objects.filter(properties__in=user_properties).distinct()
        logger.info(f"Query 1 (properties__in): {queryset1.count()} rooms")
        
        queryset2 = Room.objects.filter(properties__property_id__in=[p.property_id for p in user_properties]).distinct()
        logger.info(f"Query 2 (properties__property_id__in): {queryset2.count()} rooms")
        
        # Try a third approach - get all rooms that have any of the user's properties
        property_ids = [p.property_id for p in user_properties]
        logger.info(f"Property IDs to filter by: {property_ids}")
        
        queryset3 = Room.objects.filter(properties__property_id__in=property_ids).distinct()
        logger.info(f"Query 3 (properties__property_id__in with explicit IDs): {queryset3.count()} rooms")
        
        # Use the most reliable approach
        if queryset1.count() > 0:
            queryset = queryset1
            logger.info(f"Using Query 1 (properties__in): {queryset.count()} rooms")
        elif queryset3.count() > 0:
            queryset = queryset3
            logger.info(f"Using Query 3 (properties__property_id__in with explicit IDs): {queryset.count()} rooms")
        else:
            queryset = queryset2
            logger.info(f"Using Query 2 (properties__property_id__in): {queryset.count()} rooms")
        
        logger.info(f"Final result: {queryset.count()} total rooms for user")
        
        # Return the filtered queryset (even if empty)
        # Users should only see rooms they have access to
        return queryset

class TopicViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer

    def get_queryset(self):
        """
        Return topics that are associated with jobs in properties the user has access to.
        Admin/staff users can see all topics.
        """
        user = self.request.user
        
        # Admin users can access all topics
        if user.is_superuser or user.is_staff:
            return Topic.objects.all()
        
        # Get properties the user has access to
        accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
        
        # Return topics that are used in jobs within user's accessible properties
        return Topic.objects.filter(
            Q(jobs__rooms__properties__in=accessible_property_ids) |
            Q(preventive_maintenances__job__rooms__properties__in=accessible_property_ids)
        ).distinct()

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
            'updated_by'      # Foreign key to User
        ).prefetch_related(
            'rooms__properties',  # Many-to-many through rooms
            'topics',            # Many-to-many relationship
            'job_images',        # Reverse foreign key to JobImage
            'preventivemaintenance_set'  # Reverse foreign key
        ).distinct()  # Remove duplicates from joins

        # Restrict by user's accessible properties unless staff/admin
        if not (user.is_staff or user.is_superuser):
            accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
            queryset = queryset.filter(rooms__properties__in=accessible_property_ids)

        # Filters
        property_filter = self.request.query_params.get('property_id')
        status_filter = self.request.query_params.get('status')
        is_pm_filter = self.request.query_params.get('is_preventivemaintenance')
        search_term = self.request.query_params.get('search')
        room_filter = self.request.query_params.get('room_id')
        room_name_filter = self.request.query_params.get('room_name')
        user_filter = self.request.query_params.get('user_id')

        if property_filter:
            queryset = queryset.filter(rooms__properties__property_id=property_filter)

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
    
    def _calculate_stats(self, user, query_params):
        """Calculate job statistics (separated for caching)"""
        base_queryset = Job.objects.all()
        
        # Apply same filtering logic as get_queryset
        if not (user.is_staff or user.is_superuser):
            accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
            base_queryset = base_queryset.filter(rooms__properties__in=accessible_property_ids)
        
        # Apply filters
        property_filter = query_params.get('property_id')
        if property_filter:
            base_queryset = base_queryset.filter(rooms__properties__property_id=property_filter)
            
        # Calculate stats using aggregation
        stats = base_queryset.aggregate(
            total=Count('id', distinct=True),
            pending=Count(Case(When(status='pending', then=1))),
            inProgress=Count(Case(When(status='in_progress', then=1))),
            completed=Count(Case(When(status='completed', then=1))),
            cancelled=Count(Case(When(status='cancelled', then=1))),
            waitingSparepart=Count(Case(When(status='waiting_sparepart', then=1))),
            defect=Count(Case(When(is_defective=True, then=1))),
            preventiveMaintenance=Count(Case(When(is_preventivemaintenance=True, then=1)))
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
            'user', 'updated_by'
        ).prefetch_related(
            'rooms', 'topics', 'job_images', 'job_images__uploaded_by'
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
            jobs = jobs.filter(rooms__properties__property_id=property_filter)
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
                    response.data['user_id'] = user.id
                    response.data['username'] = user.username
                    response.data['target_user_id'] = target_user.id
                    response.data['target_username'] = target_user.username
                    logger.info(f"Returning paginated results: page {page_num}, {len(serializer.data)} jobs")
                    return response
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid pagination parameters: page={page}, page_size={page_size}, error={e}")
        
        # If no pagination requested or pagination failed, return all results
        serializer = self.get_serializer(jobs, many=True)
        
        response_data = {
            'count': len(serializer.data),
            'results': serializer.data,
            'user_id': user.id,
            'username': user.username,
            'target_user_id': target_user.id,
            'target_username': target_user.username,
            'message': f'Found {len(serializer.data)} jobs for user {target_user.username}'
        }
        
        logger.info(f"Returning {len(serializer.data)} jobs to user {user.username} (no pagination)")
        return Response(response_data, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            serializer.save(user=self.request.user, updated_by=self.request.user)
        else:
            serializer.save()
        
        # Invalidate cache after creating job
        CacheManager.invalidate_job_cache(user_id=self.request.user.id if self.request.user.is_authenticated else None)

    def perform_update(self, serializer):
        if self.request.user.is_authenticated:
            instance = self.get_object()
            data = serializer.validated_data
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

class UserProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer

    def get_queryset(self):
        # For the 'detailed' action, only admins can see all user profiles
        if self.action == 'detailed':
            if self.request.user.is_superuser or self.request.user.is_staff:
                return UserProfile.objects.all().prefetch_related('properties')
            else:
                # Non-admin users can only see their own profile
                return UserProfile.objects.filter(user=self.request.user).prefetch_related('properties')
        else:
            # For other actions, return only the current user's profile
            return UserProfile.objects.filter(user=self.request.user).prefetch_related('properties')

    @action(detail=False, methods=['get'])
    def me(self, request):
        profile = get_object_or_404(UserProfile, user=request.user)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def detailed(self, request):
        """Get all user profiles with properties for admin users"""
        # Verify admin access
        if not (request.user.is_superuser or request.user.is_staff):
            raise PermissionDenied("Only admin users can access all user profiles")
        
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['patch', 'put'])
    def update_email_notifications(self, request):
        """Update email notifications setting for current user"""
        try:
            profile, created = UserProfile.objects.get_or_create(user=request.user)
            email_notifications_enabled = request.data.get('email_notifications_enabled')
            
            if email_notifications_enabled is None:
                return Response(
                    {'error': 'email_notifications_enabled field is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            profile.email_notifications_enabled = bool(email_notifications_enabled)
            profile.save()
            
            serializer = self.get_serializer(profile)
            return Response({
                'message': 'Email notifications setting updated successfully',
                'email_notifications_enabled': profile.email_notifications_enabled,
                'profile': serializer.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error updating email notifications: {e}", exc_info=True)
            return Response(
                {'error': 'Failed to update email notifications setting'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def add_property(self, request, pk=None):
        profile = self.get_object()
        property_id = request.data.get('property_id')
        if not property_id:
            return Response({'error': 'property_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        property = get_object_or_404(Property, property_id=property_id)
        profile.properties.add(property)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def remove_property(self, request, pk=None):
        profile = self.get_object()
        property_id = request.data.get('property_id')
        if not property_id:
            return Response({'error': 'property_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        property = get_object_or_404(Property, property_id=property_id)
        profile.properties.remove(property)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

class PropertyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PropertySerializer
    lookup_field = 'property_id'

    def get_queryset(self):
        logger.info(f"User {self.request.user.username} requesting properties")
        
        # ✅ PERFORMANCE: Optimize query with prefetch_related
        base_queryset = Property.objects.prefetch_related('users', 'rooms')
        
        # Check if user is admin/superuser - give access to all properties
        if self.request.user.is_superuser or self.request.user.is_staff:
            logger.info(f"User {self.request.user.username} is admin/staff - returning all properties")
            queryset = base_queryset
            logger.info(f"Found {queryset.count()} total properties")
            return queryset
        
        # Check if user has properties assigned
        user_properties = base_queryset.filter(users=self.request.user)
        logger.info(f"User {self.request.user.username} has {user_properties.count()} assigned properties")
        
        # If user has no properties assigned, check if they're admin user
        if user_properties.count() == 0 and self.request.user.username == 'admin':
            logger.info(f"Admin user {self.request.user.username} has no properties - returning all properties")
            queryset = base_queryset
            logger.info(f"Found {queryset.count()} total properties for admin")
            return queryset
        
        # Return only properties assigned to the user
        return user_properties

    def get_object(self):
        property_id = self.kwargs.get('property_id')
        logger.info(f"Looking up property with ID: {property_id}")

        try:
            obj = Property.objects.get(property_id=property_id)
            logger.info(f"Found property: {obj.name}")

            # Admin users can access all properties
            if self.request.user.is_superuser or self.request.user.is_staff:
                logger.info(f"Admin user {self.request.user.username} accessing property {property_id}")
                return obj
            
            # Special case for admin username
            if self.request.user.username == 'admin':
                logger.info(f"Admin username {self.request.user.username} accessing property {property_id}")
                return obj

            # Check if user has access to this property
            if not obj.users.filter(id=self.request.user.id).exists():
                logger.warning(f"Property {property_id} exists but not associated with user {self.request.user.username}")
                if property_id == "PB749146D" and settings.DEBUG:
                    logger.info(f"SPECIAL CASE: Allowing access to test property {property_id} in debug mode")
                    return obj
                # For non-admin users, deny access
                raise PermissionDenied(f"You do not have permission to access property {property_id}")

            return obj
        except Property.DoesNotExist:
            logger.error(f"Property with ID {property_id} not found in database")
            raise

    @action(detail=True, methods=['get'])
    def is_preventivemaintenance(self, request, property_id=None):
        logger.info(f"is_preventivemaintenance called for property_id: {property_id}")
        try:
            property_obj = Property.objects.get(property_id=property_id)
            logger.info(f"Found property: {property_obj.name}")

            # Admin users can access all properties
            if request.user.is_superuser or request.user.is_staff:
                logger.info(f"Admin user {request.user.username} accessing property {property_id}")
                pass  # Allow access
            elif request.user.username == 'admin':
                logger.info(f"Admin username {request.user.username} accessing property {property_id}")
                pass  # Allow access
            elif not property_obj.users.filter(id=request.user.id).exists():
                if property_id != "PB749146D" or not settings.DEBUG:
                    logger.warning(f"User {request.user.username} does not have permission for property {property_id}")
                    return Response(
                        {"detail": "You do not have permission to access this property"},
                        status=status.HTTP_403_FORBIDDEN
                    )
                logger.info(f"Special case: Allowing access to {property_id} in DEBUG mode")

            has_pm_jobs = Job.objects.filter(
                rooms__properties=property_obj,
                is_preventivemaintenance=True
            ).exists()

            logger.info(f"Property {property_id} has PM jobs: {has_pm_jobs}")
            return Response({
                'property_id': property_obj.property_id,
                'is_preventivemaintenance': has_pm_jobs
            })
        except Property.DoesNotExist:
            logger.error(f"Property {property_id} not found")
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=['post'])
    def add_user(self, request, property_id=None):
        """
        Add the current authenticated user to this property.
        Used during onboarding for new users.
        """
        logger.info(f"add_user called for property_id: {property_id} by user: {request.user.username}")
        try:
            property_obj = Property.objects.get(property_id=property_id)
            
            # Add the current user to the property
            if not property_obj.users.filter(id=request.user.id).exists():
                property_obj.users.add(request.user)
                logger.info(f"Added user {request.user.username} to property {property_id}")
                
                # Also update the UserProfile if it exists
                try:
                    from .models import UserProfile
                    profile, created = UserProfile.objects.get_or_create(user=request.user)
                    if not profile.properties.filter(id=property_obj.id).exists():
                        profile.properties.add(property_obj)
                        logger.info(f"Added property {property_id} to user profile")
                except Exception as profile_error:
                    logger.warning(f"Could not update user profile: {profile_error}")
                
                return Response({
                    'success': True,
                    'message': f'User {request.user.username} added to property {property_obj.name}',
                    'property_id': property_obj.property_id,
                    'property_name': property_obj.name
                })
            else:
                logger.info(f"User {request.user.username} already has access to property {property_id}")
                return Response({
                    'success': True,
                    'message': f'User already has access to property {property_obj.name}',
                    'property_id': property_obj.property_id,
                    'property_name': property_obj.name
                })
                
        except Property.DoesNotExist:
            logger.error(f"Property {property_id} not found")
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['post'])
    def assign_properties(self, request):
        """
        Assign multiple properties to the current user.
        Used during onboarding for new users.
        
        Expected payload: { "property_ids": [1, 2, 3] }
        """
        logger.info(f"assign_properties called by user: {request.user.username}")
        property_ids = request.data.get('property_ids', [])
        
        if not property_ids:
            return Response(
                {"error": "property_ids is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        assigned = []
        errors = []
        
        for prop_id in property_ids:
            try:
                # Try to find property by id (integer) or property_id (string)
                if isinstance(prop_id, int):
                    property_obj = Property.objects.get(id=prop_id)
                else:
                    property_obj = Property.objects.get(property_id=prop_id)
                
                # Add user to property
                if not property_obj.users.filter(id=request.user.id).exists():
                    property_obj.users.add(request.user)
                    logger.info(f"Added user {request.user.username} to property {property_obj.property_id}")
                    
                    # Also update UserProfile
                    try:
                        from .models import UserProfile
                        profile, created = UserProfile.objects.get_or_create(user=request.user)
                        if not profile.properties.filter(id=property_obj.id).exists():
                            profile.properties.add(property_obj)
                    except Exception as e:
                        logger.warning(f"Could not update user profile: {e}")
                
                assigned.append({
                    'id': property_obj.id,
                    'property_id': property_obj.property_id,
                    'name': property_obj.name
                })
            except Property.DoesNotExist:
                errors.append({'id': prop_id, 'error': 'Property not found'})
            except Exception as e:
                errors.append({'id': prop_id, 'error': str(e)})
        
        logger.info(f"assign_properties result: {len(assigned)} assigned, {len(errors)} errors")
        
        # Send welcome email to new user if properties were assigned successfully
        if assigned and request.user.email:
            try:
                from .email_utils import send_welcome_email, send_new_user_notification_to_admin
                
                # Send welcome email to the new user
                email_sent = send_welcome_email(
                    user_email=request.user.email,
                    username=request.user.get_full_name() or request.user.username,
                    properties=assigned
                )
                
                if email_sent:
                    logger.info(f"Welcome email sent to new user: {request.user.email}")
                else:
                    logger.warning(f"Failed to send welcome email to: {request.user.email}")
                
                # Also notify admins about the new user
                send_new_user_notification_to_admin(
                    new_user_email=request.user.email,
                    new_username=request.user.get_full_name() or request.user.username,
                    properties=assigned
                )
                
            except Exception as email_error:
                logger.error(f"Error sending welcome email: {email_error}")
                # Don't fail the request if email fails
        
        return Response({
            'success': len(errors) == 0,
            'assigned': assigned,
            'errors': errors,
            'message': f'Assigned {len(assigned)} properties to user {request.user.username}',
            'email_sent': bool(assigned and request.user.email)
        })

    @action(detail=False, methods=['get'])
    def all(self, request):
        """
        Get ALL properties in the system.
        Used for onboarding to show new users all available properties.
        Only accessible to authenticated users.
        """
        logger.info(f"all properties requested by user: {request.user.username}")
        properties = Property.objects.all()
        serializer = PropertySerializer(properties, many=True, context={'request': request})
        return Response(serializer.data)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]


class RosterLeaveViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing roster leave records (PH/VC).
    """
    serializer_class = RosterLeaveSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['staff_id', 'week', 'day', 'leave_type']
    ordering_fields = ['week', 'day', 'created_at']
    ordering = ['week', 'day']
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        queryset = RosterLeave.objects.select_related('created_by')
        if not (user.is_staff or user.is_superuser):
            queryset = queryset.filter(created_by=user)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

class PreventiveMaintenanceImageUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    def post(self, request, pm_id):
        try:
            pm = PreventiveMaintenance.objects.get(pm_id=pm_id)

            before_image = request.FILES.get('before_image')
            after_image = request.FILES.get('after_image')

            def process_image(image_file, filename_prefix):
                img = Image.open(image_file)
                img = img.convert('RGB')
                img.thumbnail((800, 800))
                buffer = BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                buffer.seek(0)
                return ContentFile(buffer.read(), name=f"{filename_prefix}.jpg")

            if before_image:
                pm.before_image = process_image(before_image, "before_image")

            if after_image:
                pm.after_image = process_image(after_image, "after_image")

            pm.save()
            return Response({'message': 'Images uploaded and processed successfully'}, status=status.HTTP_200_OK)
        except PreventiveMaintenance.DoesNotExist:
            return Response({'error': 'PreventiveMaintenance not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Authentication Views
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = User.objects.filter(username=username).first()

        if user and user.check_password(password):
            refresh = RefreshToken.for_user(user)
            session = Session.objects.create(
                user=user,
                session_token=str(uuid.uuid4()),
                access_token=str(refresh.access_token),
                refresh_token=str(refresh),
                expires_at=timezone.now() + timedelta(days=30),
            )
            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'session_token': session.session_token,
                'user_id': user.id,
            })
        return Response({'detail': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        logger.debug(f"Register request payload: {request.data}")
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            session = Session.objects.create(
                user=user,
                session_token=str(uuid.uuid4()),
                access_token=str(refresh.access_token),
                refresh_token=str(refresh),
                expires_at=timezone.now() + timedelta(days=30),
            )
            response_data = {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'session_token': session.session_token,
                'user_id': user.id,
            }
            logger.info(f"User registered: {user.username} - Response: {response_data}")
            return Response(response_data, status=status.HTTP_201_CREATED)
        logger.warning(f"Registration failed: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        session_token = request.data.get('session_token')
        if session_token:
            Session.objects.filter(session_token=session_token, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class CustomSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        session = Session.objects.filter(user=request.user).first()
        if not session:
            return Response({'detail': 'No active session found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'session_token': session.session_token,
            'access_token': session.access_token,
            'refresh_token': session.refresh_token,
            'expires_at': session.expires_at,
            'created_at': session.created_at,
        })

    def post(self, request):
        refresh = RefreshToken.for_user(request.user)
        session, created = Session.objects.update_or_create(
            user=request.user,
            defaults={
                'session_token': str(uuid.uuid4()),
                'access_token': str(refresh.access_token),
                'refresh_token': str(refresh),
                'expires_at': timezone.now() + timedelta(days=30),
            }
        )
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'session_token': session.session_token,
            'user_id': request.user.id,
        })

# Additional API Views
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def auth_check(request):
    """Check if the user is authenticated and return basic user info"""
    return Response({
        "authenticated": True,
        "username": request.user.username,
        "email": request.user.email,
    }, status=status.HTTP_200_OK)

@api_view(['GET'])
@permission_classes([AllowAny])
def auth_providers(request):
    """Return a list of available authentication providers"""
    providers = {
        "google": {
            "name": "Google",
            "endpoint": "/api/v1/auth/google/",
            "description": "Sign in with Google OAuth2",
        },
        "local": {
            "name": "Local",
            "endpoint": "/api/v1/auth/login/",
            "description": "Sign in with username and password",
        },
    }
    return Response(providers, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """Handle user login and return JWT tokens"""
    username = request.data.get('username')
    password = request.data.get('password')
    user = User.objects.filter(username=username).first()

    if user and user.check_password(password):
        refresh = RefreshToken.for_user(user)
        session = Session.objects.create(
            user=user,
            session_token=str(uuid.uuid4()),
            access_token=str(refresh.access_token),
            refresh_token=str(refresh),
            expires_at=timezone.now() + timedelta(days=30),
        )
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'session_token': session.session_token,
            'user_id': user.id,
        })
    return Response({'detail': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password(request):
    """Generate a password reset token and send a reset link to the user's email if available."""
    from django.conf import settings
    from django.core.mail import send_mail

    identifier = request.data.get('email') or request.data.get('username')
    if not identifier:
        return Response({'detail': 'Email or username is required'}, status=status.HTTP_400_BAD_REQUEST)

    # Do not reveal whether the user exists (avoid account enumeration)
    user = User.objects.filter(Q(email__iexact=identifier) | Q(username__iexact=identifier)).first()
    if user:
        token = uuid.uuid4().hex
        profile = user.userprofile
        profile.reset_password_token = token
        profile.reset_password_expires_at = timezone.now() + timedelta(hours=1)
        profile.reset_password_used = False
        profile.save(update_fields=['reset_password_token', 'reset_password_expires_at', 'reset_password_used'])
        logger.info(f"Password reset token for {user.username}: {token}")

        # Send email if the user has an email address configured
        if user.email:
            reset_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/auth/reset-password?token={token}"
            subject = "Reset your password"
            message = (
                f"Hello {user.username},\n\n"
                f"You requested to reset your password. Click the link below to set a new password.\n\n"
                f"{reset_link}\n\n"
                f"This link will expire in 1 hour. If you did not request this, you can ignore this email.\n\n"
                f"Thanks,\nPCMS.live Team"
            )
            try:
                from .email_utils import send_email as send_via_gmail
                if send_via_gmail(user.email, subject, message, settings.DEFAULT_FROM_EMAIL):
                    logger.info(f"Password reset email sent to {user.email}")
                else:
                    logger.error("Failed to send password reset email (all methods)")
            except Exception as e:
                logger.error(f"Failed to send password reset email: {e}")
                # Continue to avoid enumeration
                pass

        # In development, include token in response for easier testing
        response_payload = {'message': 'If an account exists, password reset instructions have been sent.'}
        if settings.DEBUG:
            response_payload['token'] = token
        return Response(response_payload, status=status.HTTP_200_OK)

    return Response({'message': 'If an account exists, password reset instructions have been sent.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    """Reset a user's password using a valid token."""
    token = request.data.get('token')
    new_password = request.data.get('new_password')

    if not token or not new_password:
        return Response({'detail': 'token and new_password are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        profile = UserProfile.objects.get(reset_password_token=token)
    except UserProfile.DoesNotExist:
        return Response({'detail': 'Invalid or expired token'}, status=status.HTTP_400_BAD_REQUEST)

    if profile.reset_password_used or not profile.reset_password_expires_at or profile.reset_password_expires_at < timezone.now():
        return Response({'detail': 'Invalid or expired token'}, status=status.HTTP_400_BAD_REQUEST)

    user = profile.user
    user.set_password(new_password)
    user.save(update_fields=['password'])

    profile.reset_password_used = True
    profile.reset_password_token = None
    profile.reset_password_expires_at = None
    profile.save(update_fields=['reset_password_used', 'reset_password_token', 'reset_password_expires_at'])

    return Response({'message': 'Password has been reset successfully'}, status=status.HTTP_200_OK)

@api_view(['GET', 'POST', 'OPTIONS'])
@permission_classes([AllowAny])
def log_view(request):
    """Endpoint to accept NextAuth/client logs without requiring auth"""
    if request.method == 'POST':
        # Accept log payloads and return no content
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({"message": "ok"}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([AllowAny])
def google_auth(request):
    logger.info("google_auth view started")
    try:
        id_token_credential = request.data.get('id_token')
        access_token = request.data.get('access_token')

        if not id_token_credential:
            logger.warning("No ID token provided in request")
            return Response({'error': 'No ID token provided'}, status=status.HTTP_400_BAD_REQUEST)

        idinfo = id_token.verify_oauth2_token(id_token_credential, requests.Request(), settings.GOOGLE_CLIENT_ID)
        logger.info("Token verification successful")

        email = idinfo.get('email')
        google_id = idinfo.get('sub')

        if not email:
            logger.warning("Email not provided by Google in token")
            return Response({'error': 'Email not provided by Google'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            userprofile = UserProfile.objects.get(google_id=google_id)
            user = userprofile.user
        except UserProfile.DoesNotExist:
            try:
                user = User.objects.get(email=email)
                userprofile = user.userprofile
                userprofile.google_id = google_id
                userprofile.save()
            except User.DoesNotExist:
                username = email.split('@')[0]
                base_username = username
                counter = 1
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}{counter}"
                    counter += 1
                user = User.objects.create(
                    username=username,
                    email=email,
                    is_active=True,
                    first_name=idinfo.get('given_name', ''),
                    last_name=idinfo.get('family_name', '')
                )
                userprofile = UserProfile.objects.create(user=user, google_id=google_id)

        userprofile.update_from_google_data(idinfo)
        userprofile.access_token = access_token
        userprofile.save()

        refresh = RefreshToken.for_user(user)
        session = Session.objects.create(
            user=user,
            session_token=str(uuid.uuid4()),
            access_token=str(refresh.access_token),
            refresh_token=str(refresh),
            expires_at=timezone.now() + timedelta(days=30),
        )

        response_data = {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'session_token': session.session_token,
            'user_id': user.id,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'profile_image': userprofile.profile_image.url if userprofile.profile_image else None,
                'positions': userprofile.positions,
                'properties': list(userprofile.properties.values('id', 'name', 'property_id')),
            }
        }
        logger.info(f"Response Data to Frontend: {json.dumps(response_data)}")
        return Response(response_data, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Unexpected error in google_auth: {str(e)}")
        logger.exception(e)
        return Response({'error': 'Authentication failed', 'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Health Check
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "healthy"}, status=200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_data(request):
    """
    Get aggregated preventive maintenance data for all properties the user has access to.
    """
    logger.info(f"get_preventive_maintenance_data called by user: {request.user.username}")
    try:
        # Get properties accessible to the current user
        user_properties = Property.objects.filter(users=request.user)
        logger.info(f"Found {user_properties.count()} properties for user")
        
        # Get preventive maintenance jobs for these properties
        pm_jobs = Job.objects.filter(
            rooms__properties__in=user_properties,
            is_preventivemaintenance=True
        ).select_related('user').prefetch_related('rooms', 'topics')
        
        # Get counts by status
        status_counts = {
            'total': pm_jobs.count(),
            'pending': pm_jobs.filter(status='pending').count(),
            'in_progress': pm_jobs.filter(status='in_progress').count(),
            'completed': pm_jobs.filter(status='completed').count(),
            'waiting_sparepart': pm_jobs.filter(status='waiting_sparepart').count(),
            'cancelled': pm_jobs.filter(status='cancelled').count(),
        }
        
        # Calculate completion rate
        completion_rate = 0
        if status_counts['total'] > 0:
            completion_rate = (status_counts['completed'] / status_counts['total']) * 100
        
        # Return aggregated data
        return Response({
            'status_counts': status_counts,
            'completion_rate': completion_rate,
            'property_count': user_properties.count(),
        })
    except Exception as e:
        logger.exception(f"Error in get_preventive_maintenance_data: {str(e)}")
        return Response(
            {"detail": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_jobs(request):
    """Get jobs marked for preventive maintenance"""
    # Get query parameters
    property_id = request.query_params.get('property_id')
    status_param = request.query_params.get('status')
    limit = request.query_params.get('limit', 50)  # Default to 50 jobs
    user_filter = request.query_params.get('user_id')
    
    # Build base query
    query = Job.objects.filter(is_preventivemaintenance=True)
    
    # Add property filter if provided
    if property_id:
        try:
            property_obj = get_object_or_404(Property, property_id=property_id)
            # Check user has access to this property
            if not property_obj.users.filter(id=request.user.id).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            query = query.filter(rooms__properties__in=[property_obj])
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = Property.objects.filter(users=request.user)
        query = query.filter(rooms__properties__in=user_properties)
    
    # Add status filter if provided
    if status_param:
        query = query.filter(status=status_param)

    # Add user filter if provided (supports numeric id or username)
    if user_filter and str(user_filter).lower() != 'all':
        try:
            query = query.filter(user_id=int(user_filter))
        except (TypeError, ValueError):
            query = query.filter(user__username=str(user_filter))
    
    # Apply distinct, select related, and prefetch related for efficiency
    query = query.distinct().select_related('user').prefetch_related(
        'rooms', 'topics', 'job_images'
    )
    
    # Apply limit
    if limit and limit.isdigit():
        query = query[:int(limit)]
    
    # Serialize and return
    serializer = JobSerializer(query, many=True, context={'request': request})
    return Response({'jobs': serializer.data, 'count': len(serializer.data)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_rooms(request):
    """Get rooms with preventive maintenance jobs"""
    
    # Get property_id from query params
    property_id = request.query_params.get('property_id')
    
    # Start with rooms that have PM jobs
    rooms_with_pm = Room.objects.filter(
        jobs__is_preventivemaintenance=True
    ).distinct()
    
    # Add property filter if provided
    if property_id:
        try:
            property_obj = get_object_or_404(Property, property_id=property_id)
            # Check user has access to this property
            if not property_obj.users.filter(id=request.user.id).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            rooms_with_pm = rooms_with_pm.filter(properties=property_obj)
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = Property.objects.filter(users=request.user)
        rooms_with_pm = rooms_with_pm.filter(properties__in=user_properties)
    
    # Serialize and return
    serializer = RoomSerializer(rooms_with_pm, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_topics(request):
    """Get topics used in preventive maintenance jobs"""
    
    # Get user's properties
    user_properties = Property.objects.filter(users=request.user)
    
    # Get topics from PM jobs for user's properties
    topics = Topic.objects.filter(
        jobs__is_preventivemaintenance=True,
        jobs__rooms__properties__in=user_properties
    ).distinct()
    
    # Serialize and return
    serializer = TopicSerializer(topics, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def debug_rooms(request):
    """Debug endpoint to show all rooms without permission checks"""
    logger.info(f"Debug rooms endpoint called by user: {request.user.username}")
    
    # Get all rooms
    all_rooms = Room.objects.all()
    logger.info(f"Total rooms in database: {all_rooms.count()}")
    
    # Get user's properties
    user_properties = Property.objects.filter(users=request.user)
    logger.info(f"User {request.user.username} has access to {user_properties.count()} properties")
    
    # Get rooms for user's properties
    user_rooms = Room.objects.filter(properties__in=user_properties).distinct()
    logger.info(f"Rooms accessible to user: {user_rooms.count()}")
    
    # Get property filter if provided
    property_id = request.query_params.get('property')
    if property_id:
        logger.info(f"Property filter requested: {property_id}")
        property_rooms = Room.objects.filter(properties__property_id=property_id)
        logger.info(f"Rooms for property {property_id}: {property_rooms.count()}")
        
        # Check if user has access to this property
        try:
            property_obj = user_properties.get(property_id=property_id)
            logger.info(f"User has access to property: {property_obj.name}")
        except Property.DoesNotExist:
            logger.warning(f"User does NOT have access to property: {property_id}")
    
    # Return debug information
    debug_data = {
        'total_rooms': all_rooms.count(),
        'user_properties': [{'property_id': p.property_id, 'name': p.name} for p in user_properties],
        'user_accessible_rooms': user_rooms.count(),
        'property_filter': property_id,
        'rooms_for_property': Room.objects.filter(properties__property_id=property_id).count() if property_id else None,
        'user_has_property_access': property_id in [p.property_id for p in user_properties] if property_id else None,
        'all_rooms_sample': [
            {
                'room_id': r.room_id,
                'name': r.name,
                'room_type': r.room_type,
                'properties': [{'property_id': p.property_id, 'name': p.name} for p in r.properties.all()]
            } for r in all_rooms[:5]  # Show first 5 rooms
        ],
        'debug_queries': {
            'query1_properties_in': Room.objects.filter(properties__in=user_properties).distinct().count(),
            'query2_property_id_in': Room.objects.filter(properties__property_id__in=[p.property_id for p in user_properties]).distinct().count(),
            'query3_explicit_ids': Room.objects.filter(properties__property_id__in=[p.property_id for p in user_properties]).distinct().count()
        },
        'room_property_details': [
            {
                'room_name': r.name,
                'room_properties': [{'property_id': p.property_id, 'name': p.name} for p in r.properties.all()]
            } for r in all_rooms
        ],
        'property_room_details': [
            {
                'property_name': p.name,
                'property_id': p.property_id,
                'rooms': [{'room_id': r.room_id, 'name': r.name} for r in p.rooms.all()]
            } for p in user_properties
        ]
    }
    
    return Response(debug_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def test_rooms_all(request):
    """Test endpoint to return all rooms without permission checks"""
    logger.info(f"Test rooms all endpoint called by user: {request.user.username}")
    
    # Get all rooms
    all_rooms = Room.objects.all()
    logger.info(f"Total rooms in database: {all_rooms.count()}")
    
    # Return all rooms
    serializer = RoomSerializer(all_rooms, many=True)
    return Response({
        'message': 'All rooms returned without permission checks',
        'total_rooms': all_rooms.count(),
        'rooms': serializer.data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def property_is_preventivemaintenance(request, property_id):
    """Check if a property has preventive maintenance jobs"""
    
    # Get the property
    property_instance = get_object_or_404(Property, property_id=property_id)
    
    # Check user has access to this property
    if not property_instance.users.filter(id=request.user.id).exists():
        if property_id != "PB749146D" or not settings.DEBUG:
            return Response(
                {"detail": "You do not have permission to access this property"},
                status=status.HTTP_403_FORBIDDEN
            )
    
    # Check if property has any PM jobs
    has_pm_jobs = Job.objects.filter(
        rooms__properties=property_instance,
        is_preventivemaintenance=True
    ).exists()
    
    # Update the property field
    if property_instance.is_preventivemaintenance != has_pm_jobs:
        property_instance.is_preventivemaintenance = has_pm_jobs
        property_instance.save()
    
    # Serialize and return
    serializer = PropertyPMStatusSerializer(property_instance)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_dashboard_summary(request):
    """Return aggregated job analytics for the chart dashboard."""
    user = request.user
    month_labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    base_queryset = Job.objects.all()

    if not (user.is_staff or user.is_superuser):
        accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
        base_queryset = base_queryset.filter(rooms__properties__in=accessible_property_ids)

    property_filter = request.query_params.get('property_id')
    if property_filter:
        base_queryset = base_queryset.filter(rooms__properties__property_id=property_filter)

    base_queryset = base_queryset.distinct()

    totals = base_queryset.aggregate(
        total=Count('id', distinct=True),
        pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
        non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
        completed=Count('id', filter=Q(status='completed'), distinct=True),
    )

    total_jobs = totals['total'] or 0
    pm_jobs = totals['pm'] or 0
    non_pm_jobs = totals['non_pm'] or 0
    completed_jobs = totals['completed'] or 0
    completion_rate = (completed_jobs / total_jobs * 100) if total_jobs else 0

    annotated_queryset = base_queryset.annotate(
        month=ExtractMonth('created_at'),
        year=ExtractYear('created_at')
    )

    trend_by_month = [
        {
            'month': month_labels[item['month'] - 1],
            'year': item['year'],
            'jobs': item['jobs'],
        }
        for item in annotated_queryset.values('month', 'year')
        .annotate(jobs=Count('id', distinct=True))
        .order_by('year', 'month')
    ]

    pm_non_pm_by_month = [
        {
            'month': month_labels[item['month'] - 1],
            'year': item['year'],
            'pm': item['pm'],
            'nonPm': item['non_pm'],
        }
        for item in annotated_queryset.values('month', 'year')
        .annotate(
            pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
            non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
        )
        .order_by('year', 'month')
    ]

    status_counts = annotated_queryset.values('month', 'year').annotate(
        completed=Count('id', filter=Q(status='completed'), distinct=True),
        waiting_sparepart=Count('id', filter=Q(status='waiting_sparepart'), distinct=True),
        waiting_fix_defect=Count('id', filter=Q(is_defective=True), distinct=True),
    ).order_by('year', 'month')

    status_by_month = []
    for item in status_counts:
        month_label = month_labels[item['month'] - 1]
        status_by_month.extend([
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Completed',
                'count': item['completed'],
            },
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Waiting Sparepart',
                'count': item['waiting_sparepart'],
            },
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Waiting Fix Defect',
                'count': item['waiting_fix_defect'],
            },
        ])

    top_users_by_month = []
    top_users = annotated_queryset.values(
        'month',
        'year',
        'user__username',
        'user__first_name',
        'user__last_name',
    ).annotate(
        pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
        non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
    ).order_by('year', 'month', 'user__username')

    for item in top_users:
        first_name = (item['user__first_name'] or '').strip()
        last_name = (item['user__last_name'] or '').strip()
        full_name = f"{first_name} {last_name}".strip()
        username = item['user__username'] or 'Unknown'
        month_label = month_labels[item['month'] - 1]
        top_users_by_month.append({
            'month': month_label,
            'year': item['year'],
            'user': full_name if full_name else username,
            'pm': item['pm'],
            'nonPm': item['non_pm'],
        })

    payload = {
        'totalJobs': total_jobs,
        'pmJobs': pm_jobs,
        'nonPmJobs': non_pm_jobs,
        'completionRate': completion_rate,
        'trendByMonth': trend_by_month,
        'pmNonPmByMonth': pm_non_pm_by_month,
        'statusByMonth': status_by_month,
        'topUsersByMonth': top_users_by_month,
    }

    return Response(payload, status=status.HTTP_200_OK)

@require_http_methods(["GET"])
@cache_control(max_age=31536000)  # Cache for 1 year
def serve_static_file(request, file_path):
    """
    Custom view to serve static files when Django's built-in serving fails
    """
    # Construct the full path to the static file
    static_root = getattr(settings, 'STATIC_ROOT', '/app/static')
    full_path = os.path.join(static_root, file_path)
    
    # Security check: ensure the path is within STATIC_ROOT
    if not os.path.commonpath([static_root, full_path]) == static_root:
        raise Http404("Invalid file path")
    
    # Check if file exists
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise Http404("File not found")
    
    # Determine content type based on file extension
    content_type = 'text/plain'
    if file_path.endswith('.css'):
        content_type = 'text/css'
    elif file_path.endswith('.js'):
        content_type = 'application/javascript'
    elif file_path.endswith('.png'):
        content_type = 'image/png'
    elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
        content_type = 'image/jpeg'
    elif file_path.endswith('.gif'):
        content_type = 'image/gif'
    elif file_path.endswith('.svg'):
        content_type = 'image/svg+xml'
    elif file_path.endswith('.woff'):
        content_type = 'font/woff'
    elif file_path.endswith('.woff2'):
        content_type = 'font/woff2'
    elif file_path.endswith('.ttf'):
        content_type = 'font/ttf'
    elif file_path.endswith('.eot'):
        content_type = 'application/vnd.ms-fontobject'
    
    # Read and serve the file
    try:
        with open(full_path, 'rb') as f:
            content = f.read()
        
        response = HttpResponse(content, content_type=content_type)
        response['Content-Length'] = len(content)
        return response
    except Exception as e:
        raise Http404(f"Error reading file: {str(e)}")

@api_view(['GET'])
@permission_classes([AllowAny])
def get_csrf_token(request):
    """Get CSRF token for frontend requests"""
    from django.middleware.csrf import get_token
    from django.http import JsonResponse
    
    # Get the CSRF token
    csrf_token = get_token(request)
    
    return JsonResponse({
        'csrfToken': csrf_token,
        'csrfHeaderName': 'X-CSRFToken'
    })

# Maintenance PDF Report Generation
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def generate_maintenance_pdf_report(request):
    """
    Generate a clean and compact maintenance PDF report
    Supports filtering and different report formats
    """
    try:
        from .pdf_utils import MaintenanceReportGenerator
        from django.http import HttpResponse
        import io
        
        # Get query parameters
        report_type = request.query_params.get('type', 'detailed')  # 'detailed' or 'compact'
        include_images = request.query_params.get('include_images', 'false').lower() == 'true'
        title = request.query_params.get('title', 'Maintenance Report')
        
        # Get filter parameters
        status_filter = request.query_params.get('status')
        frequency_filter = request.query_params.get('frequency')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        topic_id = request.query_params.get('topic_id')
        property_id = request.query_params.get('property_id')
        
        # Build queryset
        queryset = PreventiveMaintenance.objects.select_related(
            'job'
        ).prefetch_related(
            'topics',
            'job__rooms',
            'job__rooms__properties'
        )
        
        # Apply filters
        if status_filter:
            now = timezone.now()
            if status_filter == 'completed':
                queryset = queryset.filter(completed_date__isnull=False)
            elif status_filter == 'pending':
                queryset = queryset.filter(completed_date__isnull=True, scheduled_date__gte=now)
            elif status_filter == 'overdue':
                queryset = queryset.filter(completed_date__isnull=True, scheduled_date__lt=now)
        
        if frequency_filter and frequency_filter != 'all':
            queryset = queryset.filter(frequency=frequency_filter)
        
        if date_from:
            queryset = queryset.filter(scheduled_date__gte=date_from)
        
        if date_to:
            queryset = queryset.filter(scheduled_date__lte=date_to)
        
        if topic_id:
            queryset = queryset.filter(topics__id=topic_id)
        
        if property_id:
            queryset = queryset.filter(job__rooms__properties__property_id=property_id)
        
        # Filter by user access (only show maintenance for properties user has access to)
        if not request.user.is_staff:
            user_properties = Property.objects.filter(users=request.user)
            queryset = queryset.filter(job__rooms__properties__in=user_properties)
        
        # Order by scheduled date
        queryset = queryset.order_by('scheduled_date')
        
        # Get the data
        maintenance_data = list(queryset.distinct())
        
        if not maintenance_data:
            return Response({
                'error': 'No maintenance data found for the specified filters'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Create PDF generator
        generator = MaintenanceReportGenerator(
            title=title,
            include_images=include_images,
            compact_mode=(report_type == 'compact')
        )
        
        # Generate PDF
        output_stream = io.BytesIO()
        
        if report_type == 'compact':
            generator.generate_compact_report(maintenance_data, output_stream)
        else:
            generator.generate_report(maintenance_data, output_stream)
        
        # Create HTTP response
        response = HttpResponse(
            output_stream.getvalue(),
            content_type='application/pdf'
        )
        
        # Set filename
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        filename = f"maintenance_report_{report_type}_{timestamp}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        return response
        
    except ImportError as e:
        logger.error(f"PDF generation failed - missing dependency: {str(e)}")
        return Response({
            'error': 'PDF generation not available - missing dependencies'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
    except Exception as e:
        logger.exception(f"Error generating maintenance PDF report: {str(e)}")
        return Response({
            'error': f'Failed to generate PDF report: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_user_profile(request):
    """
    Update user profile with Auth0 profile information.
    This endpoint is called by the frontend after successful Auth0 authentication.
    """
    try:
        user = request.user
        auth0_profile = request.data.get('auth0_profile', {})
        
        logger.info(f"🔍 Profile update requested for user: {user.username}")
        logger.info(f"📝 Auth0 profile data received: {auth0_profile}")
        
        if not auth0_profile:
            logger.warning(f"❌ No Auth0 profile data provided for user: {user.username}")
            return Response(
                {'error': 'No Auth0 profile data provided'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Track what fields were updated
        updated_fields = []
        
        # Update email if available and different
        if auth0_profile.get('email') and user.email != auth0_profile['email']:
            old_email = user.email
            user.email = auth0_profile['email']
            updated_fields.append('email')
            logger.info(f"📧 Updated email for {user.username}: {old_email} -> {user.email}")
        
        # Update first name if available and different
        if auth0_profile.get('given_name') and user.first_name != auth0_profile['given_name']:
            old_first_name = user.first_name
            user.first_name = auth0_profile['given_name'][:30]
            updated_fields.append('first_name')
            logger.info(f"👤 Updated first_name for {user.username}: {old_first_name} -> {user.first_name}")
        
        # Update last name if available and different
        if auth0_profile.get('family_name') and user.last_name != auth0_profile['family_name']:
            old_last_name = user.last_name
            user.last_name = auth0_profile['family_name'][:150]
            updated_fields.append('last_name')
            logger.info(f"👤 Updated last_name for {user.username}: {old_last_name} -> {user.last_name}")
        
        # If no given_name/family_name but we have name, split it
        if (not user.first_name and not user.last_name) and auth0_profile.get('name'):
            name_parts = auth0_profile['name'].split(' ', 1)
            if len(name_parts) >= 2:
                user.first_name = name_parts[0][:30]
                user.last_name = name_parts[1][:150]
                updated_fields.extend(['first_name', 'last_name'])
                logger.info(f"👤 Split name for {user.username}: {auth0_profile['name']} -> first: {user.first_name}, last: {user.last_name}")
            elif len(name_parts) == 1:
                user.first_name = name_parts[0][:30]
                updated_fields.append('first_name')
                logger.info(f"👤 Single name for {user.username}: {auth0_profile['name']} -> first: {user.first_name}")
        
        # Use nickname if no first name is available
        if not user.first_name and auth0_profile.get('nickname'):
            user.first_name = auth0_profile['nickname'][:30]
            updated_fields.append('first_name')
            logger.info(f"👤 Used nickname for {user.username}: {auth0_profile['nickname']} -> first: {user.first_name}")
        
        # Save the user if any fields were updated
        if updated_fields:
            user.save(update_fields=updated_fields)
            logger.info(f"✅ Updated user {user.username} profile fields: {updated_fields}")
        else:
            logger.info(f"ℹ️ No profile updates needed for user {user.username}")
        
        # Return the updated user profile
        response_data = {
            'message': 'Profile updated successfully',
            'updated_fields': updated_fields,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'date_joined': user.date_joined,
                'last_login': user.last_login
            }
        }
        
        logger.info(f"📤 Returning profile update response for {user.username}: {response_data}")
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"❌ Error updating user profile for {request.user.username if request.user else 'unknown'}: {e}", exc_info=True)
        return Response(
            {'error': 'Failed to update user profile'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Utility Consumption ViewSet
class UtilityConsumptionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing utility consumption records.
    Tracks electricity (total, on-peak, off-peak), water, and night sale data.
    """
    queryset = UtilityConsumption.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = MaintenancePagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['property', 'month', 'year']
    search_fields = ['property__name']
    ordering_fields = ['year', 'month', 'created_at', 'updated_at']
    ordering = ['-year', '-month']
    
    def get_queryset(self):
        """
        Return utility consumption records filtered by user's accessible properties.
        """
        user = self.request.user
        queryset = UtilityConsumption.objects.select_related('property', 'created_by').all()
        
        # Filter by property if user is not staff
        if not (user.is_staff or user.is_superuser):
            # Get properties the user has access to
            user_properties = Property.objects.filter(users=user)
            queryset = queryset.filter(property__in=user_properties)
        
        # Filter by property_id if provided
        property_id = self.request.query_params.get('property_id')
        if property_id:
            queryset = queryset.filter(property__property_id=property_id)
        
        # Filter by year if provided
        year = self.request.query_params.get('year')
        if year:
            try:
                queryset = queryset.filter(year=int(year))
            except ValueError:
                pass
        
        # Filter by month if provided
        month = self.request.query_params.get('month')
        if month:
            try:
                queryset = queryset.filter(month=int(month))
            except ValueError:
                pass
        
        return queryset.distinct()
    
    def get_serializer_class(self):
        """
        Return appropriate serializer class based on action
        """
        if self.action == 'list':
            return UtilityConsumptionListSerializer
        return UtilityConsumptionSerializer
    
    def perform_create(self, serializer):
        """Add the current user as the creator when creating a record"""
        serializer.save(created_by=self.request.user)
    
    def perform_update(self, serializer):
        """Update the updated_at timestamp when updating a record"""
        serializer.save()


class InventoryViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing inventory items for maintenance engineers.
    Tracks tools, parts, supplies, equipment, and consumables.
    """
    queryset = Inventory.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = MaintenancePagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['property', 'room', 'category', 'status', 'jobs', 'preventive_maintenances']
    search_fields = ['name', 'item_id', 'description', 'location', 'supplier']
    ordering_fields = ['name', 'quantity', 'created_at', 'updated_at', 'category', 'status']
    ordering = ['-created_at']
    lookup_field = 'item_id'
    
    def get_queryset(self):
        """
        Return inventory items filtered by user's accessible properties.
        """
        user = self.request.user
        queryset = (
            Inventory.objects.select_related('property', 'room', 'created_by')
            .prefetch_related(
                'jobs__user',
                'preventive_maintenances__assigned_to',
                'preventive_maintenances__created_by'
            )
            .all()
        )

        if not user.is_authenticated:
            return queryset.none()
        
        # Filter by property if user is not staff
        if not (user.is_staff or user.is_superuser):
            # Get properties the user has access to
            user_properties = Property.objects.filter(users=user)
            queryset = queryset.filter(property__in=user_properties)
        
        # Filter by property_id if provided
        property_id = self.request.query_params.get('property_id')
        if property_id:
            queryset = queryset.filter(property__property_id=property_id)
        
        # Filter by category if provided
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        
        # Filter by status if provided
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filter by room_id if provided
        room_id = self.request.query_params.get('room_id')
        if room_id:
            queryset = queryset.filter(room__room_id=room_id)
        
        # Filter low stock items
        low_stock = self.request.query_params.get('low_stock')
        if low_stock and low_stock.lower() == 'true':
            queryset = queryset.filter(quantity__lte=F('min_quantity'))
        
        job_id = self.request.query_params.get('job_id')
        if job_id:
            queryset = queryset.filter(jobs__job_id__iexact=job_id)
        
        pm_id = self.request.query_params.get('pm_id')
        if pm_id:
            queryset = queryset.filter(preventive_maintenances__pm_id__iexact=pm_id)
        
        return queryset.distinct()
    
    def get_object(self):
        """
        Override to support case-insensitive item_id lookup.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        item_id = self.kwargs[lookup_url_kwarg]
        
        # Try case-insensitive lookup using iexact
        obj = queryset.filter(item_id__iexact=item_id).first()
        
        if obj is None:
            from django.http import Http404
            raise Http404(f"No Inventory matches the given query with item_id: {item_id}")
        
        self.check_object_permissions(self.request, obj)
        return obj
    
    def get_serializer_class(self):
        """
        Return appropriate serializer class based on action
        """
        if self.action == 'list':
            return InventoryListSerializer
        return InventorySerializer
    
    def get_serializer_context(self):
        """Add request to serializer context"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_create(self, serializer):
        """Add the current user as the creator when creating an inventory item"""
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def restock(self, request, item_id=None):
        """
        Restock an inventory item by adding quantity.
        Expects: {'quantity': <number>}
        """
        inventory = self.get_object()
        quantity_to_add = request.data.get('quantity', 0)
        
        try:
            quantity_to_add = int(quantity_to_add)
            if quantity_to_add <= 0:
                return Response(
                    {'error': 'Quantity must be greater than 0'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            inventory.quantity += quantity_to_add
            inventory.last_restocked = timezone.now()
            inventory.save()
            
            serializer = self.get_serializer(inventory)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except ValueError:
            return Response(
                {'error': 'Invalid quantity value'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def use(self, request, item_id=None):
        """
        Use/consume an inventory item by subtracting quantity.
        Expects: {'quantity': <number>, 'job_id': <optional>, 'pm_id': <optional>}
        Job/PM identifiers will be added to the item's relationship history.
        """
        inventory = self.get_object()
        quantity_to_use = request.data.get('quantity', 0)
        job_id = request.data.get('job_id')
        pm_id = request.data.get('pm_id')
        
        try:
            quantity_to_use = int(quantity_to_use)
            if quantity_to_use <= 0:
                return Response(
                    {'error': 'Quantity must be greater than 0'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if inventory.quantity < quantity_to_use:
                return Response(
                    {'error': f'Insufficient stock. Available: {inventory.quantity}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Link to job or PM if provided
            if job_id:
                from .models import Job
                try:
                    job = Job.objects.get(job_id=job_id, user=request.user)
                    inventory.jobs.add(job)
                except Job.DoesNotExist:
                    return Response(
                        {'error': f'Job with ID {job_id} not found or not accessible'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            if pm_id:
                from .models import PreventiveMaintenance
                pm = PreventiveMaintenance.objects.filter(
                    pm_id=pm_id
                ).filter(
                    Q(assigned_to=request.user) | Q(created_by=request.user)
                ).first()
                if pm:
                    inventory.preventive_maintenances.add(pm)
                else:
                    return Response(
                        {'error': f'PM with ID {pm_id} not found or not accessible'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            inventory.quantity -= quantity_to_use
            inventory.save()
            
            serializer = self.get_serializer(inventory)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except ValueError:
            return Response(
                {'error': 'Invalid quantity value'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """
        Get all inventory items that are low in stock.
        """
        queryset = self.get_queryset()
        low_stock_items = queryset.filter(quantity__lte=F('min_quantity'))
        
        page = self.paginate_queryset(low_stock_items)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(low_stock_items, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def filter_options(self, request):
        """
        Get available filter options for inventory items.
        Returns categories and statuses from the model choices.
        """
        categories = [
            {'value': choice[0], 'label': choice[1]}
            for choice in Inventory.CATEGORY_CHOICES
        ]
        statuses = [
            {'value': choice[0], 'label': choice[1]}
            for choice in Inventory.STATUS_CHOICES
        ]
        
        return Response({
            'categories': categories,
            'statuses': statuses
        })


# Notification API Endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_overdue_notifications(request):
    """
    Get overdue maintenance tasks for the authenticated user.
    
    Returns a list of preventive maintenance tasks that are past their scheduled date
    and not yet completed. Results are filtered based on user's property access.
    
    Query Parameters:
        - None
    
    Returns:
        - List of overdue preventive maintenance tasks with pagination
    """
    try:
        user = request.user
        overdue_tasks = NotificationService.get_overdue_maintenance(user)
        
        # Serialize the results
        serializer = PreventiveMaintenanceListSerializer(
            overdue_tasks, 
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'count': len(overdue_tasks),
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching overdue notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch overdue notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_upcoming_notifications(request):
    """
    Get upcoming maintenance alerts for the authenticated user.
    
    Returns a list of preventive maintenance tasks that are due within the next N days
    and not yet completed. Results are filtered based on user's property access.
    
    Query Parameters:
        - days (int, optional): Number of days to look ahead. Default is 7.
    
    Returns:
        - List of upcoming preventive maintenance tasks with pagination
    """
    try:
        user = request.user
        
        # Get days parameter from query string, default to 7
        days_param = request.query_params.get('days', '7')
        try:
            days = int(days_param)
            if days < 1:
                days = 7
        except ValueError:
            days = 7
        
        upcoming_tasks = NotificationService.get_upcoming_alerts(user, days=days)
        
        # Serialize the results
        serializer = PreventiveMaintenanceListSerializer(
            upcoming_tasks, 
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'count': len(upcoming_tasks),
            'days': days,
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching upcoming notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch upcoming notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_all_notifications(request):
    """
    Get all notifications (overdue + upcoming) for the authenticated user.
    
    Returns a combined list of overdue and upcoming preventive maintenance tasks.
    Results are filtered based on user's property access.
    
    Query Parameters:
        - days (int, optional): Number of days to look ahead for upcoming tasks. Default is 7.
    
    Returns:
        - Combined list of overdue and upcoming preventive maintenance tasks
    """
    try:
        user = request.user
        
        # Get days parameter from query string, default to 7
        days_param = request.query_params.get('days', '7')
        try:
            days = int(days_param)
            if days < 1:
                days = 7
        except ValueError:
            days = 7
        
        # Get both overdue and upcoming tasks
        overdue_tasks = NotificationService.get_overdue_maintenance(user)
        upcoming_tasks = NotificationService.get_upcoming_alerts(user, days=days)
        
        # Combine and serialize
        all_tasks = list(overdue_tasks) + list(upcoming_tasks)
        serializer = PreventiveMaintenanceListSerializer(
            all_tasks, 
            many=True, 
            context={'request': request}
        )
        
        return Response({
            'overdue_count': len(overdue_tasks),
            'upcoming_count': len(upcoming_tasks),
            'total_count': len(all_tasks),
            'days': days,
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching all notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
