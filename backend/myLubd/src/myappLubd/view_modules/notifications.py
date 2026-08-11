import logging
import os

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import PushSubscription
from ..serializers import PreventiveMaintenanceListSerializer
from ..services import NotificationService


logger = logging.getLogger(__name__)


PUSH_ENDPOINT_CONFLICT = {'error': 'Push subscription endpoint is already registered.'}


# Notification API Endpoints
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


# ============================================================
# Web Push subscription endpoints
# ============================================================


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_subscribe(request):
    """
    Register a PushManager subscription against the authenticated user.

    Body shape (mirrors PushSubscription.toJSON() from the browser):
        {
          "endpoint": "...",
          "keys": {"p256dh": "...", "auth": "..."}
        }

    Idempotent: if the same endpoint already exists we update the keys and
    re-activate, so subscribing twice from the same browser is a no-op.
    """
    payload = request.data or {}
    endpoint = (payload.get('endpoint') or '').strip()
    keys = payload.get('keys') or {}
    p256dh = (keys.get('p256dh') or '').strip()
    auth = (keys.get('auth') or '').strip()

    if not endpoint or not p256dh or not auth:
        return Response(
            {'error': 'endpoint and keys.{p256dh,auth} are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_agent = (request.META.get('HTTP_USER_AGENT') or '')[:255]
    with transaction.atomic():
        sub = PushSubscription.objects.select_for_update().filter(endpoint=endpoint).first()
        created = False

        if sub is None:
            try:
                # The nested savepoint keeps the outer transaction usable if
                # another request wins the globally-unique endpoint race.
                with transaction.atomic():
                    sub = PushSubscription.objects.create(
                        endpoint=endpoint,
                        user=request.user,
                        p256dh=p256dh,
                        auth=auth,
                        user_agent=user_agent,
                        is_active=True,
                    )
                    created = True
            except IntegrityError:
                sub = PushSubscription.objects.select_for_update().get(endpoint=endpoint)

        if not created:
            if sub.user_id != request.user.id:
                return Response(PUSH_ENDPOINT_CONFLICT, status=status.HTTP_409_CONFLICT)
            sub.p256dh = p256dh
            sub.auth = auth
            sub.user_agent = user_agent
            sub.is_active = True
            sub.save(update_fields=['p256dh', 'auth', 'user_agent', 'is_active'])

    return Response(
        {
            'id': sub.id,
            'created': created,
            'is_active': sub.is_active,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_unsubscribe(request):
    """Deactivate a subscription by endpoint. Body: {"endpoint": "..."}."""
    endpoint = (request.data or {}).get('endpoint', '').strip()
    if not endpoint:
        return Response({'error': 'endpoint required'}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        sub = PushSubscription.objects.select_for_update().filter(endpoint=endpoint).first()
        if sub is not None and sub.user_id != request.user.id:
            return Response(PUSH_ENDPOINT_CONFLICT, status=status.HTTP_409_CONFLICT)
        if sub is None:
            updated = 0
        else:
            updated = PushSubscription.objects.filter(pk=sub.pk).update(is_active=False)
    return Response({'deactivated': updated})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def push_public_key(request):
    """Expose the configured VAPID public key so the frontend can subscribe."""
    key = os.environ.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '').strip()
    return Response({'public_key': key, 'configured': bool(key)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def push_test(request):
    """Send a smoke-test push to every active subscription of the caller."""
    from ..push import send_push_to_user

    delivered = send_push_to_user(
        request.user,
        {
            'title': 'HotelCare Pro test push',
            'body': f'Push delivered to {request.user.username or request.user.email or "your device"}',
            'tag': 'pcms-test',
            'url': '/dashboard',
        },
    )
    return Response({'delivered': delivered})
