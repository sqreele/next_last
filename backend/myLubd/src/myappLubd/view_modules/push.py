"""Push definitions."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ..models import PushSubscription
import os


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
    sub, created = PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            'user': request.user,
            'p256dh': p256dh,
            'auth': auth,
            'user_agent': user_agent,
            'is_active': True,
        },
    )
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
    updated = PushSubscription.objects.filter(
        user=request.user, endpoint=endpoint
    ).update(is_active=False)
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
            'title': 'StayMaint test push',
            'body': f'Push delivered to {request.user.username or request.user.email or "your device"}',
            'tag': 'pcms-test',
            'url': '/dashboard',
        },
    )
    return Response({'delivered': delivered})
