"""Machines definitions."""
from rest_framework import status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Prefetch
from django.utils import timezone
from django.db.models import Q
from django.db import transaction
from ..models import PreventiveMaintenance, Machine
from ..serializers import PreventiveMaintenanceListSerializer, MachineListSerializer, MachineDetailSerializer, MachineCreateSerializer, MachineUpdateSerializer, MachinePreventiveMaintenanceSerializer
from django_filters.rest_framework import DjangoFilterBackend
from ..tenancy import get_accessible_machines, require_work_creation_permission, enforce_subscription_limit, enforce_storage_limit, get_accessible_properties, lock_tenants_for_membership_change
from ..subscription_permissions import require_subscription_write
from .common import MaintenancePagination, _ensure_user_can_operate_property


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
        Return machines scoped to canonical property access; only a platform
        superuser receives the global list.
        """
        user = self.request.user
        queryset = get_accessible_machines(self.request.user).select_related('property')
        if self.action != 'list':
            queryset = queryset.prefetch_related(
                Prefetch('preventive_maintenances', queryset=PreventiveMaintenance.objects.order_by('next_due_date'))
            )

        if not user.is_superuser:
            queryset = queryset.filter(property__in=get_accessible_properties(user))

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

    def perform_create(self, serializer):
        property_obj = serializer.validated_data.get('property')
        require_work_creation_permission(self.request.user, property_obj)
        _ensure_user_can_operate_property(self.request.user, property_obj)
        incoming = serializer.validated_data.get('image')
        incoming_bytes = int(getattr(incoming, 'size', 0) or 0)
        with transaction.atomic():
            locked_tenant = lock_tenants_for_membership_change(property_obj.tenant)[property_obj.tenant_id]
            enforce_subscription_limit(locked_tenant, 'max_assets')
            enforce_storage_limit(locked_tenant, incoming_bytes)
            require_subscription_write(
                self.request,
                locked_tenant,
                operation='create',
                resource_type='machine',
            )
            serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        _ensure_user_can_operate_property(self.request.user, instance.property)
        target_property = serializer.validated_data.get('property', instance.property)
        _ensure_user_can_operate_property(self.request.user, target_property)
        incoming = serializer.validated_data.get('image')
        old_size = int(instance.image.size or 0) if instance.image else 0
        incoming_size = int(getattr(incoming, 'size', 0) or 0) if incoming else old_size
        if target_property.tenant_id != instance.property.tenant_id and not incoming:
            incoming_size = old_size
        with transaction.atomic():
            locked_tenant = lock_tenants_for_membership_change(target_property.tenant)[target_property.tenant_id]
            storage_delta = incoming_size if target_property.tenant_id != instance.property.tenant_id else max(0, incoming_size - old_size)
            enforce_storage_limit(locked_tenant, storage_delta)
            require_subscription_write(
                self.request,
                locked_tenant,
                operation='update',
                resource_type='machine',
            )
            serializer.save()

    def perform_destroy(self, instance):
        _ensure_user_can_operate_property(self.request.user, instance.property)
        instance.delete()

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
        _ensure_user_can_operate_property(request.user, machine.property)
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
        _ensure_user_can_operate_property(request.user, machine.property)
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
        _ensure_user_can_operate_property(request.user, machine.property)
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
