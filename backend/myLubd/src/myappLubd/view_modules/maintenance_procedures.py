from django.db.models import Avg, Count, Prefetch, Q
from django.http import Http404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Machine, MaintenanceProcedure
from ..serializers import MaintenanceProcedureListSerializer, MaintenanceProcedureSerializer
from ..tenancy import get_accessible_properties
from .common import MaintenancePagination


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

    def _property_reference(self):
        query_value = self.request.query_params.get('property_id')
        if query_value not in (None, ''):
            return str(query_value).strip()
        data = getattr(self.request, 'data', None)
        if hasattr(data, 'get'):
            value = data.get('property_id')
            if value not in (None, ''):
                return str(value).strip()
        return None

    def _resolve_property_scope(self):
        if hasattr(self, '_resolved_property_scope'):
            return self._resolved_property_scope

        reference = self._property_reference()
        if not reference:
            self._resolved_property_scope = None
            return None

        properties = get_accessible_properties(self.request.user)
        lookup = Q(property_id=reference)
        if reference.isdigit():
            lookup |= Q(pk=int(reference))
        self._resolved_property_scope = properties.filter(lookup).first()
        return self._resolved_property_scope

    def _allowed_property_ids(self):
        return set(
            get_accessible_properties(self.request.user).values_list('id', flat=True)
        )

    def get_queryset(self):
        """
        Return all maintenance procedures for all users (they are shared templates).
        However, only admin users can create/update/delete them.
        """
        user = self.request.user
        property_scope = self._resolve_property_scope()
        property_reference = self._property_reference()

        # A supplied but invalid/unauthorized property must never fall back to
        # the shared global procedure list.
        if property_reference and property_scope is None:
            return MaintenanceProcedure.objects.none()

        machine_scope = Machine.objects.select_related('property')
        queryset = MaintenanceProcedure.objects.all()

        if property_scope is not None:
            queryset = queryset.filter(machines__property=property_scope)
            machine_scope = machine_scope.filter(property=property_scope)
        elif not (user.is_staff or user.is_superuser):
            allowed_property_ids = self._allowed_property_ids()
            queryset = queryset.filter(machines__property_id__in=allowed_property_ids)
            machine_scope = machine_scope.filter(property_id__in=allowed_property_ids)

        return queryset.prefetch_related(
            Prefetch('machines', queryset=machine_scope, to_attr='_scoped_machines')
        ).distinct()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        property_scope = self._resolve_property_scope()
        context['procedure_property_pk'] = property_scope.pk if property_scope else None
        context['procedure_property_id'] = property_scope.property_id if property_scope else None
        context['allowed_property_ids'] = self._allowed_property_ids()
        return context

    def _get_admin_scoped_object(self):
        user = self.request.user
        if not (user.is_superuser or user.is_staff):
            raise PermissionDenied("Only admin users can modify maintenance procedures")
        if not self._property_reference():
            raise ValidationError({'property_id': 'An authorized property_id is required.'})
        if self._resolve_property_scope() is None:
            raise Http404("Property not found.")
        return self.get_object()

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
        procedure = self._get_admin_scoped_object()
        step_data = {
            key: value for key, value in request.data.items()
            if key != 'property_id'
        }
        
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
        procedure = self._get_admin_scoped_object()
        step_number = request.data.get('step_number')
        step_data = {
            key: value for key, value in request.data.items()
            if key != 'property_id'
        }
        
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
        procedure = self._get_admin_scoped_object()
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
        procedure = self._get_admin_scoped_object()
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
        procedure = self._get_admin_scoped_object()
        new_name = request.data.get('new_name')
        
        if not new_name:
            return Response({
                'success': False,
                'error': 'new_name is required'
            }, status=400)
        
        try:
            duplicate = procedure.duplicate_procedure(new_name)
            duplicate.machines.set(
                procedure.machines.filter(property=self._resolve_property_scope())
            )
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
