"""Locations definitions."""
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q
from ..models import Property, Topic, Area
from ..serializers import TopicSerializer, AreaSerializer
from ..tenancy import accessible_property_ids, get_accessible_properties
from .common import _ensure_user_can_operate_property


class TopicViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Topic.objects.all()
    serializer_class = TopicSerializer

    def _selected_property_queryset(self):
        property_filter = (
            self.request.query_params.get('property') or
            self.request.query_params.get('property_id')
        )
        if not property_filter or str(property_filter).lower() == 'all':
            return Property.objects.none()

        selected_properties = Property.objects.filter(
            Q(property_id=str(property_filter)) |
            Q(name=str(property_filter))
        )
        if str(property_filter).isdigit():
            selected_properties = selected_properties | Property.objects.filter(id=int(property_filter))

        return selected_properties.distinct()

    def get_queryset(self):
        """Return the shared visible catalogue used by Create Job.

        Topic rows are global, not tenant-owned. Their availability must not be
        inferred from existing jobs because a new Property still needs topics
        for its first work order.
        """
        user = self.request.user

        include_hidden = self.request.query_params.get('include_hidden', 'false').lower() == 'true'
        property_filter = (
            self.request.query_params.get('property') or
            self.request.query_params.get('property_id')
        )
        selected_properties = self._selected_property_queryset()
        requested_property_filter = bool(property_filter and str(property_filter).lower() != 'all')
        has_property_filter = selected_properties.exists()
        if requested_property_filter and not has_property_filter:
            return Topic.objects.none()

        if has_property_filter and not user.is_superuser:
            accessible_ids = get_accessible_properties(user).values_list('id', flat=True)
            if not selected_properties.filter(id__in=accessible_ids).exists():
                return Topic.objects.none()

        queryset = Topic.objects.all()
        if not include_hidden:
            queryset = queryset.filter(is_visible_in_create_job=True)

        return queryset


class AreaViewSet(viewsets.ModelViewSet):
    """CRUD for property areas/zones with tenant (property) isolation."""
    permission_classes = [IsAuthenticated]
    serializer_class = AreaSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Area.objects.select_related('property').annotate(
            jobs_count_value=Count('jobs', distinct=True)
        )

        if not user.is_superuser:
            accessible_property_ids = get_accessible_properties(user).values_list('id', flat=True)
            qs = qs.filter(property_id__in=accessible_property_ids)

        property_filter = self.request.query_params.get('property_id') or self.request.query_params.get('property')
        if property_filter:
            qs = qs.filter(property__property_id=property_filter)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            val = str(is_active).lower() in ['1', 'true', 'yes']
            qs = qs.filter(is_active=val)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))

        return qs.order_by('property__name', 'name')

    def perform_create(self, serializer):
        property_obj = serializer.validated_data.get('property')
        _ensure_user_can_operate_property(self.request.user, property_obj)
        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        new_property = serializer.validated_data.get('property', instance.property)
        _ensure_user_can_operate_property(self.request.user, instance.property)
        _ensure_user_can_operate_property(self.request.user, new_property)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Soft-delete: mark inactive rather than removing the row so historical
        jobs keep their area reference."""
        instance = self.get_object()
        _ensure_user_can_operate_property(request.user, instance.property)
        hard = str(request.query_params.get('hard', '')).lower() in ['1', 'true', 'yes']
        if hard and request.user.is_superuser:
            instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        return Response(AreaSerializer(instance).data, status=status.HTTP_200_OK)
