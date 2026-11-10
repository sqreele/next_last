"""NotificationService domain operations."""
from typing import Dict, List, Optional, Any
from django.utils import timezone
from django.db.models import Q
from ..models import PreventiveMaintenance
from ..optimizations import QueryOptimizer
from ..tenancy import get_accessible_properties


class NotificationService:
    """
    Service for notification and alert logic
    """

    @staticmethod
    def _filter_by_property(queryset, property_id):
        """
        Scope a preventive maintenance queryset to a single property, matching
        on the human-facing Property.property_id (e.g. "P1A2B3C4"). PMs link to
        a property either through their canonical Job property or through their
        machines.
        """
        if not property_id:
            return queryset
        return queryset.filter(
            Q(job__property__property_id=property_id) |
            Q(machines__property__property_id=property_id)
        )

    @staticmethod
    def get_overdue_maintenance(user, property_id: Optional[str] = None) -> List[PreventiveMaintenance]:
        """
        Get overdue maintenance tasks, optionally scoped to a single property.
        """
        now = timezone.now()

        queryset = QueryOptimizer.get_optimized_preventive_maintenance_queryset().filter(
            completed_date__isnull=True,
            scheduled_date__lt=now
        ).order_by('scheduled_date')

        # Filter by user access
        if not user.is_superuser:
            user_properties = get_accessible_properties(user)
            queryset = queryset.filter(
                Q(job__property__in=user_properties) |
                Q(machines__property__in=user_properties)
            )

        queryset = NotificationService._filter_by_property(queryset, property_id)

        return list(queryset.distinct())

    @staticmethod
    def get_upcoming_alerts(user, days: int = 7, property_id: Optional[str] = None) -> List[PreventiveMaintenance]:
        """
        Get maintenance tasks due in the next few days, optionally scoped to a
        single property.
        """
        now = timezone.now()
        end_date = now + timezone.timedelta(days=days)

        queryset = QueryOptimizer.get_optimized_preventive_maintenance_queryset().filter(
            completed_date__isnull=True,
            scheduled_date__gte=now,
            scheduled_date__lte=end_date
        ).order_by('scheduled_date')

        # Filter by user access
        if not user.is_superuser:
            user_properties = get_accessible_properties(user)
            queryset = queryset.filter(
                Q(job__property__in=user_properties) |
                Q(machines__property__in=user_properties)
            )

        queryset = NotificationService._filter_by_property(queryset, property_id)

        return list(queryset.distinct())

    @staticmethod
    def normalize_days(days: Any, default: int = 7, minimum: int = 1) -> int:
        """
        Normalize the days parameter used for upcoming notifications.
        Falls back to default when value is missing, invalid, or below minimum.
        """
        try:
            normalized_days = int(days)
            if normalized_days < minimum:
                return default
            return normalized_days
        except (TypeError, ValueError):
            return default

    @staticmethod
    def get_all_notifications(user, days: int = 7, property_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get combined overdue and upcoming notification payload, optionally
        scoped to a single property.
        """
        normalized_days = NotificationService.normalize_days(days)
        overdue_tasks = NotificationService.get_overdue_maintenance(user, property_id=property_id)
        upcoming_tasks = NotificationService.get_upcoming_alerts(
            user, days=normalized_days, property_id=property_id
        )
        all_tasks = list(overdue_tasks) + list(upcoming_tasks)

        return {
            'overdue_tasks': overdue_tasks,
            'upcoming_tasks': upcoming_tasks,
            'all_tasks': all_tasks,
            'overdue_count': len(overdue_tasks),
            'upcoming_count': len(upcoming_tasks),
            'total_count': len(all_tasks),
            'days': normalized_days,
        }
