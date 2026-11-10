"""MachineService domain operations."""
from typing import Dict, List, Any
from django.db import transaction
from django.core.exceptions import ValidationError
import logging
from ..models import Machine
from ..cache_enhanced import cache_invalidation
from ..tenancy import get_accessible_properties
from .properties import PropertyService

logger = logging.getLogger(__name__)


class MachineService:
    """
    Service for machine-related business logic
    """

    @staticmethod
    def get_user_machines(user) -> List[Machine]:
        """
        Get machines accessible to a user
        """
        if user.is_superuser:
            return list(Machine.objects.select_related('property').all())

        user_properties = get_accessible_properties(user)
        return list(Machine.objects.filter(property__in=user_properties).select_related('property'))

    @staticmethod
    def create_machine(machine_data: Dict[str, Any], user) -> Machine:
        """
        Create a new machine
        """
        try:
            # Validate property access
            property_id = machine_data.get('property')
            if property_id:
                property_obj = PropertyService.get_property_by_id(property_id, user)
                machine_data['property'] = property_obj

            from ..tenancy import (
                enforce_storage_limit,
                enforce_subscription_limit,
                lock_tenants_for_membership_change,
            )
            with transaction.atomic():
                locked_tenant = lock_tenants_for_membership_change(
                    machine_data['property'].tenant,
                )[machine_data['property'].tenant_id]
                enforce_subscription_limit(locked_tenant, 'max_assets')
                enforce_storage_limit(
                    locked_tenant,
                    int(getattr(machine_data.get('image'), 'size', 0) or 0),
                )
                machine = Machine.objects.create(**machine_data)

            # Invalidate cache
            cache_invalidation.invalidate_property_related_cache(property_id)

            logger.info(f"Created machine {machine.machine_id}")
            return machine

        except Exception as e:
            logger.error(f"Failed to create machine: {e}")
            raise

    @staticmethod
    def update_machine_status(machine_id: str, status: str, user) -> Machine:
        """
        Update machine status
        """
        try:
            machine = Machine.objects.get(machine_id=machine_id)

            # Validate status
            valid_statuses = [choice[0] for choice in Machine.STATUS_CHOICES]
            if status not in valid_statuses:
                raise ValidationError(f"Invalid status: {status}")

            machine.status = status
            machine.save()

            # Invalidate cache
            cache_invalidation.invalidate_property_related_cache(machine.property.property_id)

            logger.info(f"Updated machine {machine_id} status to {status}")
            return machine

        except Machine.DoesNotExist:
            raise ValidationError("Machine not found")
        except Exception as e:
            logger.error(f"Failed to update machine status: {e}")
            raise
