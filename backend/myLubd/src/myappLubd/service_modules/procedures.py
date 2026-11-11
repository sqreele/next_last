"""MaintenanceProcedureService domain operations."""
from typing import Dict, List, Any
import logging
from ..models import MaintenanceProcedure
from ..tenancy import get_accessible_properties, get_operable_properties, user_can_manage_pm_master
from django.core.exceptions import PermissionDenied
from django.db import transaction

logger = logging.getLogger(__name__)


class MaintenanceProcedureService:
    """
    Service for maintenance procedure business logic
    """

    @staticmethod
    @transaction.atomic
    def create_procedure(procedure_data: Dict[str, Any], user) -> MaintenanceProcedure:
        """
        Create a new maintenance procedure
        """
        try:
            procedure_data = procedure_data.copy()
            steps_data = procedure_data.pop('steps', [])

            procedure = MaintenanceProcedure(**procedure_data)
            procedure.full_clean()
            if not user_can_manage_pm_master(user, procedure.property) or not get_operable_properties(user).filter(pk=procedure.property_id).exists():
                raise PermissionDenied('You cannot manage templates for this property.')
            procedure.save()

            # Add steps
            for step_data in steps_data:
                procedure.add_step(step_data)

            logger.info(f"Created maintenance procedure {procedure.name}")
            return procedure

        except Exception as e:
            logger.error(f"Failed to create maintenance procedure: {e}")
            raise

    @staticmethod
    def get_procedures_by_difficulty(difficulty: str = None, user=None) -> List[MaintenanceProcedure]:
        """
        Get maintenance procedures by difficulty level
        """
        queryset = MaintenanceProcedure.objects.filter(property__in=get_accessible_properties(user))

        if difficulty:
            queryset = queryset.filter(difficulty_level=difficulty)

        return list(queryset.order_by('name'))

    @staticmethod
    def search_procedures_by_tools(tool_query: str, user=None) -> List[MaintenanceProcedure]:
        """
        Search procedures by required tools
        """
        procedures = MaintenanceProcedure.objects.filter(property__in=get_accessible_properties(user))
        matching_procedures = []

        for procedure in procedures:
            if procedure.required_tools and tool_query.lower() in procedure.required_tools.lower():
                matching_procedures.append(procedure)

        return matching_procedures
