import hashlib
import json
from datetime import timedelta
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..models import GuestReportRateLimit, GuestReportSubmission, Job, Property, Room


# ============================================================
# Public guest maintenance requests (no auth)
# ============================================================
#
# Hotels stick a QR code on the door / in the room that points to
# /report/<property_id>/<room_id>. Guests scan it, fill in a brief form,
# and the request lands in the maintenance backlog as a regular Job. To
# protect against abuse the endpoint:
#
#   - Requires both property and room to exist AND for the room to be
#     attached to that property (so a stranger can't enumerate or spoof
#     other tenants from a single QR scan).
#   - Caps description length and trims everything.
#   - Throttles by IP through an atomic database counter (15 requests per hour).
#   - Assigns the job to the property's first attached user (typically
#     the chief engineer) so the assignee FK never goes null.

GUEST_REPORT_RATE_LIMIT = 15
GUEST_REPORT_RATE_WINDOW = timedelta(hours=1)


def _request_fingerprint(description: str, guest_name: str, guest_contact: str) -> str:
    canonical_payload = json.dumps(
        {
            'description': description,
            'guest_name': guest_name,
            'guest_contact': guest_contact,
        },
        ensure_ascii=False,
        separators=(',', ':'),
        sort_keys=True,
    )
    return hashlib.sha256(canonical_payload.encode('utf-8')).hexdigest()


def _rate_bucket_key(ip: str) -> str:
    return hashlib.sha256(ip.encode('utf-8')).hexdigest()


def _locked_rate_bucket(ip: str, now):
    bucket, _ = GuestReportRateLimit.objects.select_for_update().get_or_create(
        bucket_key=_rate_bucket_key(ip),
        defaults={'window_started_at': now, 'count': 0},
    )
    return bucket


def _consume_rate_slot(bucket, now) -> bool:
    if now >= bucket.window_started_at + GUEST_REPORT_RATE_WINDOW:
        bucket.window_started_at = now
        bucket.count = 0
    if bucket.count >= GUEST_REPORT_RATE_LIMIT:
        return False
    bucket.count += 1
    bucket.save(update_fields=['window_started_at', 'count', 'updated_at'])
    return True


def _submission_conflicts(submission, property_obj, room_obj, payload_fingerprint):
    return (
        submission.property_id_snapshot != property_obj.pk
        or submission.room_id_snapshot != room_obj.pk
        or submission.tenant_id_snapshot != property_obj.tenant_id
        or submission.payload_fingerprint != payload_fingerprint
    )


def _duplicate_response(submission, property_obj, room_obj, payload_fingerprint):
    if _submission_conflicts(submission, property_obj, room_obj, payload_fingerprint):
        return Response(
            {'error': 'Request identity is already bound to a different submission.'},
            status=status.HTTP_409_CONFLICT,
        )
    if submission.job_id is None:
        return Response(
            {'error': 'The original submission is no longer available.'},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(
        {
            'job_id': submission.job.job_id,
            'property': property_obj.name,
            'room': room_obj.name,
            'message': 'Thanks — our maintenance team has been notified.',
            'replayed': True,
        },
        status=status.HTTP_200_OK,
    )


def _client_ip(request) -> str:
    # Production nginx overwrites X-Real-IP with its trusted, real-ip-module
    # result. Prefer it over the client-extensible X-Forwarded-For chain.
    real_ip = request.META.get('HTTP_X_REAL_IP', '').strip()
    if real_ip:
        return real_ip
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').strip()
    if forwarded:
        # nginx appends its resolved remote address to the right-hand side.
        return forwarded.rsplit(',', 1)[-1].strip()
    return (request.META.get('REMOTE_ADDR') or 'anon').strip()


@api_view(['POST'])
@permission_classes([AllowAny])
def public_job_request(request, property_id, room_id):
    """Create a maintenance Job from an unauthenticated guest scan."""

    payload = request.data or {}
    raw_request_id = payload.get('client_request_id')
    try:
        request_id = UUID(str(raw_request_id))
    except (TypeError, ValueError, AttributeError):
        return Response(
            {'error': 'client_request_id must be a valid UUID.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    description = (payload.get('description') or '').strip()
    if not description:
        return Response(
            {'error': 'description is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    description = description[:1000]
    guest_name = (payload.get('guest_name') or '').strip()[:120]
    guest_contact = (payload.get('guest_contact') or '').strip()[:120]
    payload_fingerprint = _request_fingerprint(description, guest_name, guest_contact)

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
    if room_obj is None or not room_obj.properties.filter(pk=property_obj.pk).exists():
        return Response(
            {'error': 'Room not found at this property.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    existing = GuestReportSubmission.objects.select_related('job').filter(
        request_id=request_id,
    ).first()
    if existing is not None:
        return _duplicate_response(
            existing, property_obj, room_obj, payload_fingerprint,
        )

    assignee = property_obj.users.order_by('id').first()
    if assignee is None:
        return Response(
            {'error': 'Property has no staff to dispatch the request to.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    ip = _client_ip(request)
    stamp = timezone.now().strftime('%Y-%m-%d %H:%M')
    remark_lines = [f'[{stamp} · guest → reported via QR scan]']
    if guest_name:
        remark_lines.append(f'Guest: {guest_name}')
    if guest_contact:
        remark_lines.append(f'Contact: {guest_contact}')
    remark_lines.append(f'Source IP: {ip}')

    try:
        with transaction.atomic():
            # Serialize new submissions from the same source before consuming
            # quota. Recheck after acquiring the bucket lock so a replay that
            # committed while this request waited remains quota-neutral.
            now = timezone.now()
            bucket = _locked_rate_bucket(ip, now)
            existing = GuestReportSubmission.objects.select_for_update().filter(
                request_id=request_id,
            ).first()
            if existing is not None:
                return _duplicate_response(
                    existing, property_obj, room_obj, payload_fingerprint,
                )

            if not _consume_rate_slot(bucket, now):
                return Response(
                    {'error': 'Too many requests from this network. Try again later.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

            submission = GuestReportSubmission.objects.create(
                request_id=request_id,
                property_id_snapshot=property_obj.pk,
                room_id_snapshot=room_obj.pk,
                tenant_id_snapshot=property_obj.tenant_id,
                payload_fingerprint=payload_fingerprint,
            )
            job = Job.objects.create(
                user=assignee,
                updated_by=assignee,
                description=description,
                remarks='\n'.join(remark_lines),
                status='pending',
                priority='medium',
            )
            job.rooms.set([room_obj])
            submission.job = job
            submission.save(update_fields=['job'])
    except IntegrityError:
        # A concurrent request with the same UUID won the unique insert. Its
        # transaction is authoritative; the losing transaction (including its
        # rate increment) has been rolled back.
        existing = GuestReportSubmission.objects.select_related('job').filter(
            request_id=request_id,
        ).first()
        if existing is None:
            raise
        return _duplicate_response(
            existing, property_obj, room_obj, payload_fingerprint,
        )

    return Response(
        {
            'job_id': job.job_id,
            'property': property_obj.name,
            'room': room_obj.name,
            'message': 'Thanks — our maintenance team has been notified.',
            'replayed': False,
        },
        status=status.HTTP_201_CREATED,
    )
