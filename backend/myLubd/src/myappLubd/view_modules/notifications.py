"""Notifications definitions."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..serializers import PreventiveMaintenanceListSerializer
import logging
from ..services import NotificationService

logger = logging.getLogger('myappLubd.views')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_overdue_notifications(request):
    """
    Get overdue maintenance tasks for the authenticated user.

    Returns a list of preventive maintenance tasks that are past their scheduled date
    and not yet completed. Results are filtered based on user's property access.

    Query Parameters:
        - property_id (str, optional): Scope results to a single property.

    Returns:
        - List of overdue preventive maintenance tasks with pagination
    """
    try:
        user = request.user
        property_id = request.query_params.get('property_id') or None
        overdue_tasks = NotificationService.get_overdue_maintenance(user, property_id=property_id)

        # Serialize the results
        serializer = PreventiveMaintenanceListSerializer(
            overdue_tasks,
            many=True,
            context={'request': request}
        )

        return Response({
            'count': len(overdue_tasks),
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching overdue notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch overdue notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_upcoming_notifications(request):
    """
    Get upcoming maintenance alerts for the authenticated user.

    Returns a list of preventive maintenance tasks that are due within the next N days
    and not yet completed. Results are filtered based on user's property access.

    Query Parameters:
        - days (int, optional): Number of days to look ahead. Default is 7.
        - property_id (str, optional): Scope results to a single property.

    Returns:
        - List of upcoming preventive maintenance tasks with pagination
    """
    try:
        user = request.user
        days = NotificationService.normalize_days(request.query_params.get('days', 7))
        property_id = request.query_params.get('property_id') or None

        upcoming_tasks = NotificationService.get_upcoming_alerts(user, days=days, property_id=property_id)

        # Serialize the results
        serializer = PreventiveMaintenanceListSerializer(
            upcoming_tasks,
            many=True,
            context={'request': request}
        )

        return Response({
            'count': len(upcoming_tasks),
            'days': days,
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching upcoming notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch upcoming notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_all_notifications(request):
    """
    Get all notifications (overdue + upcoming) for the authenticated user.

    Returns a combined list of overdue and upcoming preventive maintenance tasks.
    Results are filtered based on user's property access.

    Query Parameters:
        - days (int, optional): Number of days to look ahead for upcoming tasks. Default is 7.
        - property_id (str, optional): Scope results to a single property.

    Returns:
        - Combined list of overdue and upcoming preventive maintenance tasks
    """
    try:
        user = request.user
        notification_payload = NotificationService.get_all_notifications(
            user,
            days=request.query_params.get('days', 7),
            property_id=request.query_params.get('property_id') or None
        )
        all_tasks = notification_payload['all_tasks']
        serializer = PreventiveMaintenanceListSerializer(
            all_tasks,
            many=True,
            context={'request': request}
        )

        return Response({
            'overdue_count': notification_payload['overdue_count'],
            'upcoming_count': notification_payload['upcoming_count'],
            'total_count': notification_payload['total_count'],
            'days': notification_payload['days'],
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error fetching all notifications: {str(e)}")
        return Response(
            {'error': 'Failed to fetch notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
