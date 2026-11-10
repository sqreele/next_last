"""Public Requests definitions."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from ..models import Property, Room, Job
from ..job_property import resolve_job_property
from ..tenancy import enforce_subscription_limit, lock_tenants_for_membership_change, get_property_summary_recipients
from ..subscription_permissions import require_subscription_write
from django.core.cache import cache


def _client_ip(request) -> str:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').strip()
    if forwarded:
        return forwarded.split(',', 1)[0].strip()
    return (request.META.get('REMOTE_ADDR') or 'anon').strip()


@api_view(['POST'])
@permission_classes([AllowAny])
def public_job_request(request, property_id, room_id):
    """Create a maintenance Job from an unauthenticated guest scan."""

    ip = _client_ip(request)
    bucket_key = f'pcms:public-job-request:{ip}'
    count = cache.get(bucket_key, 0)
    if count >= 15:
        return Response(
            {'error': 'Too many requests from this network. Try again later.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    payload = request.data or {}
    description = (payload.get('description') or '').strip()
    if not description:
        return Response(
            {'error': 'description is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    description = description[:1000]
    guest_name = (payload.get('guest_name') or '').strip()[:120]
    guest_contact = (payload.get('guest_contact') or '').strip()[:120]

    # Resolve property and room. Accept both pcms-style property_id (P12345…)
    # and numeric PKs so the QR code can use whichever the operator prefers.
    property_obj = None
    try:
        if str(property_id).isdigit():
            property_obj = Property.objects.filter(id=int(property_id)).first()
        if property_obj is None:
            property_obj = Property.objects.filter(property_id=str(property_id)).first()
    except Exception:  # pragma: no cover - defensive
        property_obj = None
    if property_obj is None:
        return Response({'error': 'Property not found.'}, status=status.HTTP_404_NOT_FOUND)

    room_obj = None
    try:
        if str(room_id).isdigit():
            room_obj = Room.objects.filter(room_id=int(room_id)).first()
    except Exception:  # pragma: no cover - defensive
        room_obj = None
    if room_obj is None:
        # Allow lookup by name as a fallback so QRs printed with the visible
        # room number still work.
        room_obj = Room.objects.filter(name=str(room_id)).first()
    if room_obj is None or room_obj.property_id != property_obj.pk:
        return Response(
            {'error': 'Room not found at this property.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    assignee = get_property_summary_recipients(property_obj).order_by('id').first()
    if assignee is None:
        return Response(
            {'error': 'Property has no staff to dispatch the request to.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    require_subscription_write(
        request,
        property_obj.tenant,
        operation='create',
        resource_type='public_qr_job',
    )

    stamp = timezone.now().strftime('%Y-%m-%d %H:%M')
    remark_lines = [f'[{stamp} · guest → reported via QR scan]']
    if guest_name:
        remark_lines.append(f'Guest: {guest_name}')
    if guest_contact:
        remark_lines.append(f'Contact: {guest_contact}')
    remark_lines.append(f'Source IP: {ip}')

    # Keep the Job row and its canonical location in one transaction.  The
    # Job post_save receiver registers LINE work with transaction.on_commit,
    # so it will render the room only after this relationship is durable.
    with transaction.atomic():
        locked_tenant = lock_tenants_for_membership_change(property_obj.tenant)[property_obj.tenant_id]
        enforce_subscription_limit(locked_tenant, 'max_monthly_work_orders')
        job = Job.objects.create(
            user=assignee,
            updated_by=assignee,
            property=resolve_job_property(explicit_property=property_obj, rooms=[room_obj]),
            description=description,
            remarks='\n'.join(remark_lines),
            status='pending',
            priority='medium',
        )
        job.rooms.set([room_obj])

    cache.set(bucket_key, count + 1, timeout=60 * 60)

    return Response(
        {
            'job_id': job.job_id,
            'property': property_obj.name,
            'room': room_obj.name,
            'message': 'Thanks — our maintenance team has been notified.',
        },
        status=status.HTTP_201_CREATED,
    )
