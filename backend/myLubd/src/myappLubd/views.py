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
from .models import UserProfile, Property, Room, Topic, Job, Session, PreventiveMaintenance, JobImage, Machine, MaintenanceProcedure
from django.urls import reverse
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .serializers import (
    UserProfileSerializer, PropertySerializer, RoomSerializer, TopicSerializer, JobSerializer,
    UserSerializer, PreventiveMaintenanceSerializer, PreventiveMaintenanceCreateUpdateSerializer,
    PreventiveMaintenanceCompleteSerializer, PreventiveMaintenanceListSerializer,
    PreventiveMaintenanceDetailSerializer, PropertyPMStatusSerializer,
    MachineSerializer, MachineListSerializer, MachineDetailSerializer,
    MachineCreateSerializer, MachineUpdateSerializer, MachinePreventiveMaintenanceSerializer,
    MaintenanceProcedureSerializer, MaintenanceProcedureListSerializer
)
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from django.shortcuts import get_object_or_404
import logging
import json
import uuid
from datetime import timedelta
from django.http import JsonResponse, HttpResponseRedirect
import os
from django.http import HttpResponse, Http404
from django.conf import settings
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_http_methods

logger = logging.getLogger(__name__)
User = get_user_model()

# Pagination class
class MaintenancePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

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

    def get_queryset(self):
        """
        Return a queryset filtered by request parameters.
        Supports filtering by:
        - status (completed, pending, overdue)
        - topic_id
        - date_from & date_to
        - pm_id (exact match)
        """
        queryset = PreventiveMaintenance.objects.all()

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
        elif self.action in ['retrieve', 'create', 'update', 'partial_update']:
            return PreventiveMaintenanceDetailSerializer
        elif self.action == 'complete':
            return PreventiveMaintenanceCompleteSerializer
        return self.serializer_class

    def perform_create(self, serializer):
        """Add the current user as the creator when creating a record"""
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        """Add the current user as the updater when updating a record"""
        serializer.save(updated_by=self.request.user)

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

        if 'completed_date' not in request.data:
            request.data['completed_date'] = timezone.now().isoformat()

        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        completed_date = serializer.validated_data.get('completed_date') or timezone.now()
        next_due_date = self._calculate_next_due_date(instance, completed_date)

        serializer.save(next_due_date=next_due_date, updated_by=request.user)
        return Response(
            PreventiveMaintenanceDetailSerializer(instance, context={'request': request}).data
        )

    def _calculate_next_due_date(self, instance, reference_date):
        """
        Calculate the next due date based on the maintenance frequency
        """
        frequency_map = {
            'daily': timedelta(days=1),
            'weekly': timedelta(weeks=1),
            'biweekly': timedelta(weeks=2),
            'monthly': timedelta(days=30),
            'quarterly': timedelta(days=90),
            'biannually': timedelta(days=182),
            'annually': timedelta(days=365)
        }
        if instance.frequency == 'custom' and instance.custom_days:
            return reference_date + timedelta(days=instance.custom_days)
        return reference_date + frequency_map.get(instance.frequency, timedelta(days=30))

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
        return MaintenanceProcedure.objects.all()

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
        
        # Check if user is admin/superuser - give access to all properties and rooms
        if user.is_superuser or user.is_staff:
            logger.info(f"User {user.username} is admin/staff - returning all rooms")
            property_id = self.request.query_params.get('property')
            if property_id:
                queryset = Room.objects.filter(properties__property_id=property_id)
                logger.info(f"Found {queryset.count()} rooms for property {property_id}")
                return queryset
            return Room.objects.all()
        
        # Special case for admin username
        if user.username == 'admin':
            logger.info(f"Admin username {user.username} - returning all rooms")
            property_id = self.request.query_params.get('property')
            if property_id:
                queryset = Room.objects.filter(properties__property_id=property_id)
                logger.info(f"Found {queryset.count()} rooms for property {property_id}")
                return queryset
            return Room.objects.all()
        
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
                
                # If no rooms found, try to return all rooms for this user (fallback)
                if queryset.count() == 0:
                    logger.warning(f"No rooms found for property {property_id}, falling back to user's accessible rooms")
                    fallback_queryset = Room.objects.filter(properties__in=user_properties).distinct()
                    logger.info(f"Fallback query result: {fallback_queryset.count()} rooms")
                    return fallback_queryset
                
                return queryset
                
            except Property.DoesNotExist:
                logger.warning(f"User {user.username} doesn't have access to property {property_id}")
                
                # Instead of returning empty, try to return rooms from user's accessible properties
                logger.info("Attempting to return rooms from user's accessible properties as fallback")
                fallback_queryset = Room.objects.filter(properties__in=user_properties).distinct()
                logger.info(f"Fallback query result: {fallback_queryset.count()} rooms")
                return fallback_queryset
        
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
        
        # If still no rooms found, return all rooms as a last resort (for debugging)
        if queryset.count() == 0:
            logger.warning("No rooms found for user's properties, returning all rooms as debug fallback")
            all_rooms = Room.objects.all()
            logger.info(f"Debug fallback: {all_rooms.count()} total rooms in database")
            
            # Additional debug info
            logger.info(f"All rooms in database: {[r.name for r in all_rooms]}")
            logger.info(f"User properties: {[p.name for p in user_properties]}")
            
            # Try to understand why the relationship isn't working
            for room in all_rooms:
                room_props = list(room.properties.all())
                logger.info(f"Room {room.name} has properties: {[p.property_id for p in room_props]}")
            
            for prop in user_properties:
                prop_rooms = list(prop.rooms.all())
                logger.info(f"Property {prop.name} has rooms: {[r.name for r in prop_rooms]}")
            
            return all_rooms
        
        return queryset

class TopicViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer

class JobViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Job.objects.all()
    serializer_class = JobSerializer
    lookup_field = 'job_id'

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

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            serializer.save(user=self.request.user, updated_by=self.request.user)
        else:
            serializer.save()

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

class UserProfileViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer

    def get_queryset(self):
        return UserProfile.objects.filter(user=self.request.user).prefetch_related('properties')

    @action(detail=False, methods=['get'])
    def me(self, request):
        profile = get_object_or_404(UserProfile, user=request.user)
        serializer = self.get_serializer(profile)
        return Response(serializer.data)

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
    queryset = Property.objects.all()
    serializer_class = PropertySerializer
    lookup_field = 'property_id'

    def get_queryset(self):
        logger.info(f"User {self.request.user.username} requesting properties")
        
        # Check if user is admin/superuser - give access to all properties
        if self.request.user.is_superuser or self.request.user.is_staff:
            logger.info(f"User {self.request.user.username} is admin/staff - returning all properties")
            queryset = Property.objects.all()
            logger.info(f"Found {queryset.count()} total properties")
            return queryset
        
        # Check if user has properties assigned
        user_properties = Property.objects.filter(users=self.request.user)
        logger.info(f"User {self.request.user.username} has {user_properties.count()} assigned properties")
        
        # If user has no properties assigned, check if they're admin user
        if user_properties.count() == 0 and self.request.user.username == 'admin':
            logger.info(f"Admin user {self.request.user.username} has no properties - returning all properties")
            queryset = Property.objects.all()
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

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

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
            query = query.filter(rooms__properties=property_obj)
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
