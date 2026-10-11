"""Focused, query-efficient helpers for the maintenance Job admin."""

from django.db.models import Count, Exists, OuterRef, Q

from .models import Job, Room


MISSING_ROOM_PREVIEW_LIMIT = 250


def build_missing_rooms_summary(request):
    """Summarize active Rooms without a Job matching the current admin scope."""
    floor = (request.GET.get('missing_floor') or '').strip()
    property_filter = (request.GET.get('property') or '').strip()
    topic_filter = (request.GET.get('topic') or '').strip()

    rooms = Room.objects.filter(is_active=True)
    if property_filter:
        rooms = rooms.filter(property_id=property_filter)
    if floor:
        rooms = rooms.filter(name__regex=rf'^{floor}[0-9]+$')

    matching_jobs = Job.objects.filter(rooms=OuterRef('pk'))
    if property_filter:
        matching_jobs = matching_jobs.filter(property_id=property_filter)
    if topic_filter:
        matching_jobs = matching_jobs.filter(topics__id=topic_filter)
    if floor:
        matching_jobs = matching_jobs.filter(rooms__name__regex=rf'^{floor}[0-9]+$')

    annotated = rooms.annotate(has_matching_job=Exists(matching_jobs))
    totals = annotated.aggregate(
        total=Count('pk'),
        with_jobs=Count('pk', filter=Q(has_matching_job=True)),
        missing=Count('pk', filter=Q(has_matching_job=False)),
    )
    missing_rooms = list(
        annotated.filter(has_matching_job=False)
        .order_by('name')
        .values_list('name', flat=True)[:MISSING_ROOM_PREVIEW_LIMIT]
    )

    return {
        'floor': floor,
        'property': property_filter,
        'selected_topic_id': topic_filter or None,
        'total_rooms_in_model': totals['total'],
        'rooms_with_jobs': totals['with_jobs'],
        'missing_rooms_count': totals['missing'],
        'missing_rooms': missing_rooms,
        'missing_rooms_truncated': totals['missing'] > len(missing_rooms),
    }
