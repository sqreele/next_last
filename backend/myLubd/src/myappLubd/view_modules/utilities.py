"""Utilities definitions."""
from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from ..models import UtilityConsumption
from ..serializers import UtilityConsumptionSerializer, UtilityConsumptionListSerializer
from django_filters.rest_framework import DjangoFilterBackend
from ..tenancy import get_accessible_properties
from .common import MaintenancePagination, _ensure_user_can_operate_property


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

        # Filter by canonical property scope unless platform break-glass.
        if not user.is_superuser:
            # Get properties the user has access to
            user_properties = get_accessible_properties(user)
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
        _ensure_user_can_operate_property(
            self.request.user, serializer.validated_data.get('property')
        )
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        """Update the updated_at timestamp when updating a record"""
        instance = self.get_object()
        _ensure_user_can_operate_property(self.request.user, instance.property)
        target_property = serializer.validated_data.get('property', instance.property)
        _ensure_user_can_operate_property(self.request.user, target_property)
        serializer.save()

    def perform_destroy(self, instance):
        _ensure_user_can_operate_property(self.request.user, instance.property)
        instance.delete()
