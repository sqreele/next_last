"""Read-only previews using the production email templates and isolated Demo jobs."""
from collections import Counter
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .demo_api import DemoApiThrottle, DEMO_PROPERTY_ID, _demo_jobs, _require_demo_mode
from .models import Job

TEMPLATES = {
    'daily': 'daily_summary.html',
    'pending': 'pending_jobs_summary.html',
    'property': 'property_jobs_summary.html',
    'technician': 'user_property_jobs.html',
}


class DemoEmailPreviewView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [DemoApiThrottle]

    def get(self, request):
        _require_demo_mode()
        kind = request.query_params.get('kind', 'daily')
        if kind not in TEMPLATES:
            return Response({'detail': 'Unknown email template.'}, status=400)
        try:
            day = date.fromisoformat(request.query_params['date']) if request.query_params.get('date') else timezone.localdate(timezone=ZoneInfo('Asia/Bangkok'))
        except ValueError:
            return Response({'detail': 'Use a valid YYYY-MM-DD date.'}, status=400)
        tz = ZoneInfo('Asia/Bangkok')
        now = datetime.combine(day, time(6), tzinfo=tz)
        jobs = list(_demo_jobs().order_by('-created_at'))
        assignees = sorted({job.user.get_human_display_name() for job in jobs})
        technician = request.query_params.get('technician') or (assignees[0] if assignees else 'Demo technician')
        if kind == 'technician':
            jobs = [job for job in jobs if job.user.get_human_display_name() == technician]
        if kind == 'pending':
            jobs = [job for job in jobs if job.status in {'pending', 'in_progress', 'waiting_sparepart'}]

        def status_list(items):
            counts = Counter(job.status for job in items)
            return [{'label': label, 'count': counts[key]} for key, label in Job.STATUS_CHOICES]

        today = [job for job in jobs if timezone.localtime(job.created_at, tz).date() == day]
        monthly = [job for job in jobs if timezone.localtime(job.created_at, tz).strftime('%Y-%m') == day.strftime('%Y-%m')]
        rooms = Counter(room.name for job in jobs for room in job.rooms.all())
        topics = Counter(topic.title for job in jobs for topic in job.topics.all())
        today_topics = Counter(topic.title for job in today for topic in job.topics.all())
        month_topics = Counter(topic.title for job in monthly for topic in job.topics.all())
        context = {
            'brand_name': 'StayMaint Demo', 'base_url': 'https://demo.invalid',
            'date_str': day.isoformat(), 'time_str': '06:00', 'timezone_label': 'Asia/Bangkok',
            'property_id': DEMO_PROPERTY_ID, 'property_name': 'StayMaint Demo Hotel - Chinatown',
            'user_name': technician, 'date_range': 'Current Demo dataset',
            'total_jobs': len(jobs), 'completed_jobs': sum(job.status == 'completed' for job in jobs),
            'pending_jobs': sum(job.status in {'pending', 'in_progress', 'waiting_sparepart'} for job in jobs),
            'status_list': status_list(today if kind == 'daily' else jobs), 'jobs': jobs[:50],
            'room_stats': [{'name': name, 'job_count': count} for name, count in rooms.most_common()],
            'topic_stats': [{'title': title, 'count': count} for title, count in topics.most_common()],
            'recent_jobs': [{'job': job, 'properties': ['StayMaint Demo Hotel - Chinatown']} for job in jobs[:20]],
            'total_created': len(today),
            'completed_today': sum(bool(job.completed_at) and timezone.localtime(job.completed_at, tz).date() == day for job in jobs),
            'total_created_this_month': len(monthly),
            'total_completed_this_month': sum(bool(job.completed_at) and timezone.localtime(job.completed_at, tz).strftime('%Y-%m') == day.strftime('%Y-%m') for job in jobs),
            'month_name': now.strftime('%B %Y'), 'monthly_status_list': status_list(monthly),
            'today_topics': [{'title': title, 'count': count} for title, count in today_topics.most_common()],
            'monthly_topics': [{'title': title, 'count': count} for title, count in month_topics.most_common()],
            'total_unique_topics_today': len(today_topics), 'total_unique_topics_month': len(month_topics),
            'total_topic_assignments_today': sum(today_topics.values()), 'total_topic_assignments_month': sum(month_topics.values()),
            'daily_stats': [],
            'stats': {'total': len(jobs), **{key: sum(job.status == key for job in jobs) for key in ('pending', 'in_progress', 'waiting_sparepart')},
                      'high_priority': sum(job.priority in {'high', 'critical'} for job in jobs), 'defective': sum(job.is_defective for job in jobs)},
            'job_details': [],
        }
        for number in range(1, day.day + 1):
            selected = [job for job in monthly if timezone.localtime(job.created_at, tz).day == number]
            context['daily_stats'].append({'date': day.replace(day=number).isoformat(),
                'day_name': day.replace(day=number).strftime('%a'), 'total': len(selected),
                'cumulative_total': sum(timezone.localtime(job.created_at, tz).day <= number for job in monthly),
                'status_counts': dict(Counter(job.status for job in selected)), 'is_today': number == day.day})
        for job in jobs[:50]:
            context['job_details'].append({
                'job': job, 'job_id': job.job_id, 'description': job.description, 'remarks': job.remarks,
                'priority': job.priority, 'priority_info': {'bg': '#fff7ed', 'color': '#9a3412'},
                'status_info': {'label': job.get_status_display(), 'bg': '#f0fdfa', 'color': '#0f766e'},
                'created_at': job.created_at, 'updated_at': job.updated_at, 'user_name': job.user.get_human_display_name(),
                'rooms': [room.name for room in job.rooms.all()], 'topics': [topic.title for topic in job.topics.all()],
                'properties': ['StayMaint Demo Hotel - Chinatown'], 'is_defective': job.is_defective,
                'has_images': bool(job.job_images.all()), 'image_count': len(job.job_images.all()),
                'images': [{'url': f'/api/demo/images/{image.pk}/', 'uploaded_at': image.uploaded_at} for image in job.job_images.all()],
            })
        with timezone.override(tz):
            html = render_to_string('emails/' + TEMPLATES[kind], context)
        return Response({'html': html, 'template': TEMPLATES[kind], 'kind': kind,
                         'date': day.isoformat(), 'technicians': assignees, 'technician': technician,
                         'job_count': len(today if kind == 'daily' else jobs), 'preview_only': True})
