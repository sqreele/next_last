"""MaintenanceProcedureService domain operations."""
from typing import Dict, List, Any
import logging
from ..models import MaintenanceProcedure

logger = logging.getLogger(__name__)


class MaintenanceProcedureService:
    """
    Service for maintenance procedure business logic
    """

    @staticmethod
    def create_procedure(procedure_data: Dict[str, Any], user) -> MaintenanceProcedure:
        """
        Create a new maintenance procedure
        """
        try:
            steps_data = procedure_data.pop('steps', [])

            procedure = MaintenanceProcedure.objects.create(**procedure_data)

            # Add steps
            for step_data in steps_data:
                procedure.add_step(step_data)

            logger.info(f"Created maintenance procedure {procedure.name}")
            return procedure

        except Exception as e:
            logger.error(f"Failed to create maintenance procedure: {e}")
            raise

    @staticmethod
    def get_procedures_by_difficulty(difficulty: str = None) -> List[MaintenanceProcedure]:
        """
        Get maintenance procedures by difficulty level
        """
        queryset = MaintenanceProcedure.objects.all()

        if difficulty:
            queryset = queryset.filter(difficulty_level=difficulty)

        return list(queryset.order_by('name'))

    @staticmethod
    def search_procedures_by_tools(tool_query: str) -> List[MaintenanceProcedure]:
        """
        Search procedures by required tools
        """
        procedures = MaintenanceProcedure.objects.all()
        matching_procedures = []

        for procedure in procedures:
            if procedure.required_tools and tool_query.lower() in procedure.required_tools.lower():
                matching_procedures.append(procedure)

        return matching_procedures
