"""PropertyService domain operations."""
from typing import Dict, List, Any
from django.core.exceptions import ValidationError
from ..models import Job, Property, Room
from ..cache_enhanced import cache_manager
from ..tenancy import get_accessible_properties


class PropertyService:
    """
    Service for property-related business logic
    """

    @staticmethod
    def get_user_properties(user) -> List[Property]:
        """
        Get properties accessible to a user
        """
        cache_key = f"user_properties:{user.id}"

        def fetch_properties():
            if user.is_superuser:
                return list(Property.objects.all())
            return list(get_accessible_properties(user))

        return cache_manager.get_or_set(cache_key, fetch_properties, timeout=300)

    @staticmethod
    def get_property_rooms(property_id: str, user) -> List[Room]:
        """
        Get rooms for a specific property
        """
        # Check user access
        property_obj = PropertyService.get_property_by_id(property_id, user)

        cache_key = f"property_rooms:{property_id}"

        def fetch_rooms():
            return list(Room.objects.filter(property=property_obj))

        return cache_manager.get_or_set(cache_key, fetch_rooms, timeout=300)


    @staticmethod
    def get_property_by_id(property_id: str, user) -> Property:
        """
        Get property by ID with access control
        """
        try:
            property_obj = Property.objects.get(property_id=property_id)

            # Check access
            if not user.is_superuser and not get_accessible_properties(user).filter(pk=property_obj.pk).exists():
                raise ValidationError("Access denied to this property")

            return property_obj

        except Property.DoesNotExist:
            raise ValidationError("Property not found")

    @staticmethod
    def get_property_stats(property_id: str, user) -> Dict[str, Any]:
        """
        Get statistics for a property
        """
        property_obj = PropertyService.get_property_by_id(property_id, user)

        cache_key = f"property_stats:{property_id}"

        def fetch_stats():
            jobs = Job.objects.filter(property=property_obj)

            return {
                'total_jobs': jobs.count(),
                'pending_jobs': jobs.filter(status='pending').count(),
                'in_progress_jobs': jobs.filter(status='in_progress').count(),
                'completed_jobs': jobs.filter(status='completed').count(),
                'preventive_maintenance_jobs': jobs.filter(is_preventivemaintenance=True).count(),
                'rooms_count': property_obj.canonical_rooms.count(),
                'machines_count': property_obj.machines.count()
            }

        return cache_manager.get_or_set(cache_key, fetch_stats, timeout=300)
