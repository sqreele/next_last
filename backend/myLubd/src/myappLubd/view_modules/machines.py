from django.db.models import Prefetch, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Machine, PreventiveMaintenance
from ..serializers import (
    MachineCreateSerializer,
    MachineDetailSerializer,
    MachineListSerializer,
    MachinePreventiveMaintenanceSerializer,
    MachineUpdateSerializer,
    PreventiveMaintenanceListSerializer,
)
from .common import MaintenancePagination


class MachineViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing machines.
    """
    queryset = Machine.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = MaintenancePagination
    lookup_field = 'machine_id'
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'property', 'location', 'category']
    search_fields = ['name', 'description', 'machine_id', 'category']
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

        category_filter = self.request.query_params.get('category')
        if category_filter:
            queryset = queryset.filter(category__iexact=category_filter)

        search_term = self.request.query_params.get('search')
        if search_term:
            queryset = queryset.filter(
                Q(name__icontains=search_term) |
                Q(description__icontains=search_term) |
                Q(machine_id__icontains=search_term) |
                Q(category__icontains=search_term)
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
    def set_maintenance(self, request, machine_id=None):
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
    def change_status(self, request, machine_id=None):
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
    def set_preventive_maintenances(self, request, machine_id=None):
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
    def maintenance_history(self, request, machine_id=None):
        """Get history of completed maintenance for this machine"""
        machine = self.get_object()
        maintenances = machine.preventive_maintenances.filter(
            completed_date__isnull=False
        ).order_by('-completed_date')
        serializer = PreventiveMaintenanceListSerializer(maintenances, many=True, context={'request': request})
        return Response(serializer.data)

