from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated

from ..models import Property, UtilityConsumption
from ..serializers import UtilityConsumptionListSerializer, UtilityConsumptionSerializer
from .common import MaintenancePagination


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
        user = self.request.user
        queryset = UtilityConsumption.objects.select_related('property', 'created_by').all()

        if not (user.is_staff or user.is_superuser):
            user_properties = Property.objects.filter(users=user)
            queryset = queryset.filter(property__in=user_properties)

        property_id = self.request.query_params.get('property_id')
        if property_id:
            queryset = queryset.filter(property__property_id=property_id)

        year = self.request.query_params.get('year')
        if year:
            try:
                queryset = queryset.filter(year=int(year))
            except ValueError:
                pass

        month = self.request.query_params.get('month')
        if month:
            try:
                queryset = queryset.filter(month=int(month))
            except ValueError:
                pass

        return queryset.distinct()

    def get_serializer_class(self):
        if self.action == 'list':
            return UtilityConsumptionListSerializer
        return UtilityConsumptionSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save()

