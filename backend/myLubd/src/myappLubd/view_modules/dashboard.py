from django.db.models import Count, Q
from django.db.models.functions import ExtractMonth, ExtractYear
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Job, Property
from .common import display_name_from_user_values


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_dashboard_summary(request):
    """Return aggregated job analytics for the chart dashboard."""
    user = request.user
    month_labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    base_queryset = Job.objects.all()

    if not (user.is_staff or user.is_superuser):
        accessible_property_ids = Property.objects.filter(users=user).values_list('id', flat=True)
        base_queryset = base_queryset.filter(rooms__properties__in=accessible_property_ids)

    property_filter = request.query_params.get('property_id')
    if property_filter:
        base_queryset = base_queryset.filter(rooms__properties__property_id=property_filter)

    base_queryset = base_queryset.distinct()

    totals = base_queryset.aggregate(
        total=Count('id', distinct=True),
        pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
        non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
        completed=Count('id', filter=Q(status='completed'), distinct=True),
    )

    total_jobs = totals['total'] or 0
    pm_jobs = totals['pm'] or 0
    non_pm_jobs = totals['non_pm'] or 0
    completed_jobs = totals['completed'] or 0
    completion_rate = (completed_jobs / total_jobs * 100) if total_jobs else 0

    annotated_queryset = base_queryset.annotate(
        month=ExtractMonth('created_at'),
        year=ExtractYear('created_at')
    )

    trend_by_month = [
        {
            'month': month_labels[item['month'] - 1],
            'year': item['year'],
            'jobs': item['jobs'],
        }
        for item in annotated_queryset.values('month', 'year')
        .annotate(jobs=Count('id', distinct=True))
        .order_by('year', 'month')
    ]

    pm_non_pm_by_month = [
        {
            'month': month_labels[item['month'] - 1],
            'year': item['year'],
            'pm': item['pm'],
            'nonPm': item['non_pm'],
        }
        for item in annotated_queryset.values('month', 'year')
        .annotate(
            pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
            non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
        )
        .order_by('year', 'month')
    ]

    status_counts = annotated_queryset.values('month', 'year').annotate(
        completed=Count('id', filter=Q(status='completed'), distinct=True),
        waiting_sparepart=Count('id', filter=Q(status='waiting_sparepart'), distinct=True),
        waiting_fix_defect=Count('id', filter=Q(is_defective=True), distinct=True),
    ).order_by('year', 'month')

    status_by_month = []
    for item in status_counts:
        month_label = month_labels[item['month'] - 1]
        status_by_month.extend([
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Completed',
                'count': item['completed'],
            },
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Waiting Sparepart',
                'count': item['waiting_sparepart'],
            },
            {
                'month': month_label,
                'year': item['year'],
                'status': 'Waiting Fix Defect',
                'count': item['waiting_fix_defect'],
            },
        ])

    top_users_by_month = []
    top_users = annotated_queryset.values(
        'month',
        'year',
        'user__username',
        'user__first_name',
        'user__last_name',
        'user__email',
    ).annotate(
        pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
        non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
    ).order_by('year', 'month', 'user__username')

    for item in top_users:
        month_label = month_labels[item['month'] - 1]
        top_users_by_month.append({
            'month': month_label,
            'year': item['year'],
            'user': display_name_from_user_values(
                item.get('user__first_name'),
                item.get('user__last_name'),
                item.get('user__email'),
                item.get('user__username'),
            ),
            'pm': item['pm'],
            'nonPm': item['non_pm'],
        })

    topics_by_month = []
    topic_counts = annotated_queryset.values('month', 'year', 'topics__title').annotate(
        count=Count('id', distinct=True),
        pm=Count('id', filter=Q(is_preventivemaintenance=True), distinct=True),
        non_pm=Count('id', filter=Q(is_preventivemaintenance=False), distinct=True),
    ).order_by('year', 'month', 'topics__title')

    for item in topic_counts:
        if not item['topics__title']:
            continue

        month_label = month_labels[item['month'] - 1]
        topics_by_month.append({
            'month': month_label,
            'year': item['year'],
            'topic': item['topics__title'],
            'count': item['count'],
            'pm': item['pm'],
            'nonPm': item['non_pm'],
            'isPreventive': (item['pm'] or 0) > 0,
        })

    payload = {
        'totalJobs': total_jobs,
        'pmJobs': pm_jobs,
        'nonPmJobs': non_pm_jobs,
        'completionRate': completion_rate,
        'trendByMonth': trend_by_month,
        'pmNonPmByMonth': pm_non_pm_by_month,
        'statusByMonth': status_by_month,
        'topUsersByMonth': top_users_by_month,
        'topicsByMonth': topics_by_month,
    }

    return Response(payload, status=status.HTTP_200_OK)

