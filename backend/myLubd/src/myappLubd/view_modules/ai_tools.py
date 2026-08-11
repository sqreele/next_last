from datetime import timedelta

from django.db.models import Count, Q
from django.db.models.functions import ExtractMonth, ExtractYear
from django.utils import timezone

from ..models import Area, Job, PreventiveMaintenance, Property, Room, Topic
from .ai_context import _resolve_room, _resolve_topic


def _serialize_user(user):
    if not user:
        return None
    display_name = user.get_full_name().strip() if hasattr(user, 'get_full_name') else ''
    display_name = display_name or getattr(user, 'email', '') or getattr(user, 'username', '') or 'Unknown'
    return {
        'user_id': getattr(user, 'id', None),
        'username': getattr(user, 'username', None),
        'name': display_name,
        'email': getattr(user, 'email', None),
    }


def _serialize_job(job):
    return {
        'job_id': job.job_id,
        'status': job.status,
        'priority': job.priority,
        'description': job.description,
        'remarks': job.remarks,
        'created_at': job.created_at.isoformat() if job.created_at else None,
        'updated_at': job.updated_at.isoformat() if job.updated_at else None,
        'completed_at': job.completed_at.isoformat() if job.completed_at else None,
        'reported_by': _serialize_user(job.user),
        'technician': _serialize_user(job.user),
        'last_updated_by': _serialize_user(job.updated_by),
        'technician_note': 'ใน schema ปัจจุบัน Job.user ถูกใช้เป็น technician/ผู้รับผิดชอบงาน และ updated_by คือผู้แก้ไขหรือปิดงานล่าสุด',
        'rooms': [
            {
                'room_id': room.room_id,
                'name': room.name,
                'room_type': room.room_type,
            }
            for room in job.rooms.all()
        ],
        'topics': [topic.title for topic in job.topics.all()],
        'area': {
            'id': job.area.id,
            'name': job.area.name,
            'property': job.area.property.name,
        } if job.area and job.area.property else None,
    }


def _display_user_name_from_values(row):
    return ' '.join(
        part for part in [row.get('user__first_name'), row.get('user__last_name')]
        if part
    ).strip() or row.get('user__username') or row.get('user__email') or 'Unknown'


def _build_category_details(jobs, job_ids, selected_topic=None):
    topic_queryset = Topic.objects.annotate(
        job_count=Count('jobs', filter=Q(jobs__id__in=job_ids), distinct=True)
    ).filter(job_count__gt=0)
    if selected_topic:
        topic_queryset = topic_queryset.filter(pk=selected_topic.pk)

    category_details = []
    for topic in topic_queryset.order_by('-job_count', 'title')[:10]:
        topic_jobs = jobs.filter(topics=topic).distinct()
        topic_job_ids = list(topic_jobs.values_list('id', flat=True))
        status_counts = list(
            topic_jobs
            .values('status')
            .annotate(count=Count('id', distinct=True))
            .order_by('status')
        )
        room_rows = list(
            Room.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=topic_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'room_type', 'name')
            .values('room_id', 'name', 'room_type', 'job_count')[:20]
        )
        area_rows = list(
            Area.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=topic_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'name')
            .values('id', 'name', 'job_count')[:20]
        )
        sample_jobs = (
            topic_jobs
            .prefetch_related('rooms', 'topics')
            .select_related('area__property')
            .order_by('-created_at')[:10]
        )
        category_details.append({
            'category': topic.title,
            'job_count': topic.job_count,
            'status_counts': [
                {'status': row['status'], 'count': row['count']}
                for row in status_counts
            ],
            'rooms': [
                {
                    'room_id': row['room_id'],
                    'name': row['name'],
                    'room_type': row['room_type'],
                    'jobs': row['job_count'],
                }
                for row in room_rows
            ],
            'areas': [
                {
                    'id': row['id'],
                    'name': row['name'],
                    'jobs': row['job_count'],
                }
                for row in area_rows
            ],
            'jobs': [_serialize_job(job) for job in sample_jobs],
        })

    return category_details


def get_maintenance_summary(property_name: str = "", room_name: str = "", category_name: str = ""):
    """
    ดึงข้อมูลสรุปดิบของระบบแจ้งซ่อม HotelCare Pro สำหรับให้ Gemini ใช้ตอบคำถามเชิงสถิติอย่างถูกต้อง

    ฟังก์ชันนี้ควรถูกเรียกเมื่อผู้ใช้ถามเกี่ยวกับภาพรวมงานแจ้งซ่อม เช่น จำนวนงานทั้งหมด
    จำนวนงานที่เสร็จแล้ว จำนวนงานที่ยังเปิดอยู่ จำนวนงานที่ยกเลิก หรือหมวดหมู่งานเสีย/แจ้งซ่อม
    หรือห้องที่เสียบ่อยที่สุด รวมถึงรายละเอียดงานแต่ละห้องและรายการงาน PM
    โดยผลลัพธ์เป็นข้อมูลจากระบบเท่านั้น เพื่อป้องกันไม่ให้ AI คิดตัวเลขเอง
    หากผู้ใช้ถามแยกตามสาขา ให้ส่งชื่อสาขาหรือ property id ผ่าน property_name
    หากผู้ใช้ถามแยกตามห้อง ให้ส่งชื่อ เลขห้อง หรือ room id ผ่าน room_name
    หากผู้ใช้ถามเจาะจงหมวดหมู่/category/topic ให้ส่งชื่อหมวดหมู่ผ่าน category_name

    Returns:
        dict: ข้อมูลสรุปงานแจ้งซ่อม ประกอบด้วย total_jobs, completed, open, cancelled
        และ top_categories ซึ่งเป็นรายการหมวดหมู่ที่เสียบ่อยพร้อมจำนวนงาน
    """
    return {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'}


def _get_maintenance_summary_for_property(property_obj, room_name: str = "", category_name: str = ""):
    """Execute the summary query for an already-authorized Property object."""
    if not isinstance(property_obj, Property):
        return {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'}
    room_obj, room_error = _resolve_room(room_name, property_obj)
    if room_error:
        return {
            'error': 'ROOM_NOT_FOUND',
            **room_error,
        }
    topic_obj, topic_error = _resolve_topic(category_name)
    if topic_error:
        return {
            'error': 'CATEGORY_NOT_FOUND',
            **topic_error,
        }

    jobs = Job.objects.all()
    if property_obj:
        jobs = jobs.filter(
            Q(area__property=property_obj) |
            Q(rooms__properties=property_obj)
        ).distinct()
    if room_obj:
        jobs = jobs.filter(rooms=room_obj).distinct()
    if topic_obj:
        jobs = jobs.filter(topics=topic_obj).distinct()

    totals = jobs.aggregate(
        total_jobs=Count('id', distinct=True),
        completed=Count('id', filter=Q(status='completed'), distinct=True),
        cancelled=Count('id', filter=Q(status='cancelled'), distinct=True),
    )
    open_jobs = jobs.exclude(status__in=['completed', 'cancelled']).count()
    job_ids = list(jobs.values_list('id', flat=True))
    top_categories = list(
        Topic.objects
        .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=job_ids), distinct=True))
        .filter(job_count__gt=0)
        .order_by('-job_count', 'title')
        .values('title', 'job_count')[:5]
    )
    top_rooms = list(
        Room.objects
        .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=job_ids), distinct=True))
        .filter(job_count__gt=0)
        .order_by('-job_count', 'room_type', 'name')
        .values('room_id', 'name', 'room_type', 'job_count')[:5]
    )
    category_details = _build_category_details(jobs, job_ids, topic_obj)
    reporter_rows = list(
        jobs
        .annotate(year=ExtractYear('created_at'), month=ExtractMonth('created_at'))
        .values('year', 'month', 'user_id', 'user__username', 'user__first_name', 'user__last_name', 'user__email')
        .annotate(job_count=Count('id', distinct=True))
        .order_by('year', 'month', '-job_count', 'user__username')
    )
    monthly_top_reporters = []
    seen_months = set()
    for row in reporter_rows:
        month_key = (row['year'], row['month'])
        if month_key in seen_months:
            continue
        seen_months.add(month_key)
        display_name = _display_user_name_from_values(row)
        monthly_top_reporters.append({
            'year': row['year'],
            'month': row['month'],
            'reporter': {
                'user_id': row['user_id'],
                'username': row.get('user__username'),
                'name': display_name,
                'email': row.get('user__email'),
            },
            'jobs': row['job_count'],
        })
    technician_rows = list(
        jobs
        .values('user_id', 'user__username', 'user__first_name', 'user__last_name', 'user__email')
        .annotate(job_count=Count('id', distinct=True))
        .order_by('-job_count', 'user__username')[:10]
    )
    top_technicians = []
    for row in technician_rows:
        top_technicians.append({
            'user_id': row['user_id'],
            'username': row.get('user__username'),
            'name': _display_user_name_from_values(row),
            'email': row.get('user__email'),
            'jobs': row['job_count'],
            'note': 'นับจาก Job.user ซึ่งโปรเจกต์ใช้เป็น technician/ผู้รับผิดชอบงาน',
        })

    month_keys = list(
        jobs
        .annotate(year=ExtractYear('created_at'), month=ExtractMonth('created_at'))
        .values('year', 'month')
        .annotate(total=Count('id', distinct=True))
        .order_by('year', 'month')
    )
    monthly_report_details = []
    for month_row in month_keys:
        year = month_row['year']
        month = month_row['month']
        month_jobs = jobs.filter(created_at__year=year, created_at__month=month).distinct()
        month_job_ids = list(month_jobs.values_list('id', flat=True))
        status_counts = list(
            month_jobs
            .values('status')
            .annotate(count=Count('id', distinct=True))
            .order_by('status')
        )
        month_top_reporters = []
        for reporter_row in (
            month_jobs
            .values('user_id', 'user__username', 'user__first_name', 'user__last_name', 'user__email')
            .annotate(job_count=Count('id', distinct=True))
            .order_by('-job_count', 'user__username')[:3]
        ):
            month_top_reporters.append({
                'user_id': reporter_row['user_id'],
                'username': reporter_row.get('user__username'),
                'name': _display_user_name_from_values(reporter_row),
                'email': reporter_row.get('user__email'),
                'jobs': reporter_row['job_count'],
            })
        month_top_rooms = list(
            Room.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=month_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'room_type', 'name')
            .values('room_id', 'name', 'room_type', 'job_count')[:3]
        )
        month_top_categories = list(
            Topic.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=month_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'title')
            .values('title', 'job_count')[:3]
        )
        sample_jobs = (
            month_jobs
            .prefetch_related('rooms', 'topics')
            .select_related('area__property')
            .order_by('-created_at')[:10]
        )
        monthly_report_details.append({
            'year': year,
            'month': month,
            'total_jobs': month_row['total'],
            'status_counts': [
                {'status': row['status'], 'count': row['count']}
                for row in status_counts
            ],
            'top_reporters': month_top_reporters,
            'top_rooms': [
                {
                    'room_id': row['room_id'],
                    'name': row['name'],
                    'room_type': row['room_type'],
                    'jobs': row['job_count'],
                }
                for row in month_top_rooms
            ],
            'top_categories': [
                {'category': row['title'], 'jobs': row['job_count']}
                for row in month_top_categories
            ],
            'jobs': [_serialize_job(job) for job in sample_jobs],
        })

    year_keys = list(
        jobs
        .annotate(year=ExtractYear('created_at'))
        .values('year')
        .annotate(total=Count('id', distinct=True))
        .order_by('year')
    )
    yearly_report_details = []
    for year_row in year_keys:
        year = year_row['year']
        year_jobs = jobs.filter(created_at__year=year).distinct()
        year_job_ids = list(year_jobs.values_list('id', flat=True))
        status_counts = list(
            year_jobs
            .values('status')
            .annotate(count=Count('id', distinct=True))
            .order_by('status')
        )
        monthly_counts = list(
            year_jobs
            .annotate(month=ExtractMonth('created_at'))
            .values('month')
            .annotate(total=Count('id', distinct=True))
            .order_by('month')
        )
        year_top_rooms = list(
            Room.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=year_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'room_type', 'name')
            .values('room_id', 'name', 'room_type', 'job_count')[:5]
        )
        year_top_categories = list(
            Topic.objects
            .annotate(job_count=Count('jobs', filter=Q(jobs__id__in=year_job_ids), distinct=True))
            .filter(job_count__gt=0)
            .order_by('-job_count', 'title')
            .values('title', 'job_count')[:5]
        )
        yearly_report_details.append({
            'year': year,
            'total_jobs': year_row['total'],
            'status_counts': [
                {'status': row['status'], 'count': row['count']}
                for row in status_counts
            ],
            'monthly_counts': [
                {'month': row['month'], 'jobs': row['total']}
                for row in monthly_counts
            ],
            'top_rooms': [
                {
                    'room_id': row['room_id'],
                    'name': row['name'],
                    'room_type': row['room_type'],
                    'jobs': row['job_count'],
                }
                for row in year_top_rooms
            ],
            'top_categories': [
                {'category': row['title'], 'jobs': row['job_count']}
                for row in year_top_categories
            ],
        })
    room_details = []
    room_queryset = Room.objects.all()
    if property_obj:
        room_queryset = room_queryset.filter(properties=property_obj)
    if room_obj:
        room_queryset = room_queryset.filter(pk=room_obj.pk)

    room_job_filter = Q(jobs__id__in=job_ids)
    for room in (
        room_queryset
        .annotate(job_count=Count('jobs', filter=room_job_filter, distinct=True))
        .filter(job_count__gt=0)
        .order_by('-job_count', 'room_type', 'name')[:10]
    ):
        room_jobs = (
            jobs.filter(rooms=room)
            .prefetch_related('rooms', 'topics')
            .select_related('area__property')
            .order_by('-created_at')[:10]
        )
        room_details.append({
            'room_id': room.room_id,
            'name': room.name,
            'room_type': room.room_type,
            'job_count': room.job_count,
            'jobs': [_serialize_job(job) for job in room_jobs],
        })
    preventive_maintenance = PreventiveMaintenance.objects.select_related(
        'assigned_to',
        'created_by',
        'job',
        'procedure_template',
    ).prefetch_related('topics')
    if property_obj:
        preventive_maintenance = preventive_maintenance.filter(
            Q(job__area__property=property_obj) |
            Q(job__rooms__properties=property_obj)
        ).distinct()

    pm_status_counts = list(
        preventive_maintenance
        .values('status')
        .annotate(count=Count('id'))
        .order_by('status')
    )
    pm_items = []
    for pm in preventive_maintenance.order_by('-scheduled_date')[:20]:
        pm_items.append({
            'pm_id': pm.pm_id,
            'title': pm.pmtitle,
            'status': pm.status,
            'priority': pm.priority,
            'frequency': pm.frequency,
            'scheduled_date': pm.scheduled_date.isoformat() if pm.scheduled_date else None,
            'completed_date': pm.completed_date.isoformat() if pm.completed_date else None,
            'next_due_date': pm.next_due_date.isoformat() if pm.next_due_date else None,
            'assigned_to': pm.assigned_to.get_full_name() or pm.assigned_to.username if pm.assigned_to else None,
            'topics': [topic.title for topic in pm.topics.all()],
        })

    return {
        'property': {
            'property_id': property_obj.property_id,
            'name': property_obj.name,
        } if property_obj else None,
        'room': {
            'room_id': room_obj.room_id,
            'name': room_obj.name,
            'room_type': room_obj.room_type,
        } if room_obj else None,
        'category': {
            'id': topic_obj.id,
            'title': topic_obj.title,
        } if topic_obj else None,
        'total_jobs': totals['total_jobs'] or 0,
        'completed': totals['completed'] or 0,
        'open': open_jobs,
        'cancelled': totals['cancelled'] or 0,
        'top_categories': [
            {'category': row['title'], 'jobs': row['job_count']}
            for row in top_categories
        ],
        'top_rooms': [
            {
                'room_id': row['room_id'],
                'name': row['name'],
                'room_type': row['room_type'],
                'jobs': row['job_count'],
            }
            for row in top_rooms
        ],
        'monthly_top_reporters': monthly_top_reporters,
        'top_technicians': top_technicians,
        'yearly_report_details': yearly_report_details,
        'monthly_report_details': monthly_report_details,
        'category_details': category_details,
        'room_details': room_details,
        'preventive_maintenance': {
            'total': preventive_maintenance.count(),
            'status_counts': [
                {'status': row['status'], 'count': row['count']}
                for row in pm_status_counts
            ],
            'items': pm_items,
        },
    }


def get_today_maintenance_jobs(property_name: str = ""):
    """
    ดึงรายการงานแจ้งซ่อมที่ถูกสร้างในวันนี้สำหรับให้ AI chat ตอบคำถาม
    เช่น งานแจ้งซ่อมวันนี้ งานซ่อมวันนี้ หรือ today's repair requests
    """
    return {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'}


def _get_today_maintenance_jobs_for_property(property_obj):
    """Execute today's job query for an already-authorized Property object."""
    if not isinstance(property_obj, Property):
        return {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'}

    now = timezone.localtime(timezone.now())
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    jobs = Job.objects.select_related(
        'user',
        'updated_by',
        'area__property',
    ).prefetch_related('rooms', 'topics').filter(
        created_at__gte=start_of_day,
        created_at__lt=end_of_day,
    )

    if property_obj:
        jobs = jobs.filter(
            Q(area__property=property_obj) |
            Q(rooms__properties=property_obj)
        ).distinct()

    status_counts = list(
        jobs.values('status')
        .annotate(count=Count('id', distinct=True))
        .order_by('status')
    )
    priority_counts = list(
        jobs.values('priority')
        .annotate(count=Count('id', distinct=True))
        .order_by('priority')
    )
    items = list(jobs.order_by('-created_at')[:50])

    return {
        'property': {
            'property_id': property_obj.property_id,
            'name': property_obj.name,
        } if property_obj else None,
        'date': start_of_day.date().isoformat(),
        'timezone': timezone.get_current_timezone_name(),
        'total': jobs.count(),
        'open': jobs.exclude(status__in=['completed', 'cancelled']).count(),
        'completed': jobs.filter(status='completed').count(),
        'cancelled': jobs.filter(status='cancelled').count(),
        'status_counts': [{'status': row['status'], 'count': row['count']} for row in status_counts],
        'priority_counts': [{'priority': row['priority'], 'count': row['count']} for row in priority_counts],
        'items': [_serialize_job(job) for job in items],
    }


def _serialize_preventive_maintenance(pm):
    job = pm.job
    area = job.area if job and job.area else None
    procedure_template = pm.procedure_template

    return {
        'pm_id': pm.pm_id,
        'title': pm.pmtitle,
        'status': pm.status,
        'priority': pm.priority,
        'frequency': pm.frequency,
        'scheduled_date': pm.scheduled_date.isoformat() if pm.scheduled_date else None,
        'completed_date': pm.completed_date.isoformat() if pm.completed_date else None,
        'next_due_date': pm.next_due_date.isoformat() if pm.next_due_date else None,
        'estimated_duration': pm.estimated_duration,
        'actual_duration': pm.actual_duration,
        'assigned_to': _serialize_user(pm.assigned_to),
        'completed_by': _serialize_user(pm.completed_by),
        'created_by': _serialize_user(pm.created_by),
        'topics': [topic.title for topic in pm.topics.all()],
        'notes': pm.notes or '',
        'procedure': pm.procedure or '',
        'remarks': pm.remarks or '',
        'completion_notes': pm.completion_notes or '',
        'job_id': job.job_id if job else None,
        'job_description': job.description if job else '',
        'job_remarks': job.remarks if job else '',
        'job_status': job.status if job else '',
        'job_priority': job.priority if job else '',
        'rooms': [
            {
                'room_id': room.room_id,
                'name': room.name,
                'room_type': room.room_type,
            }
            for room in job.rooms.all()
        ] if job else [],
        'area': {
            'id': area.id,
            'name': area.name,
            'property_id': area.property.property_id if area.property else '',
            'property_name': area.property.name if area.property else '',
        } if area else None,
        'machines': [
            {
                'machine_id': machine.machine_id,
                'name': machine.name,
                'category': machine.category or '',
                'location': machine.location or '',
                'property_id': machine.property.property_id if machine.property else '',
                'property_name': machine.property.name if machine.property else '',
            }
            for machine in pm.machines.all()
        ],
        'procedure_template': {
            'id': procedure_template.id,
            'name': procedure_template.name,
            'category': procedure_template.category,
            'description': procedure_template.description,
            'estimated_duration': procedure_template.estimated_duration,
            'responsible_department': procedure_template.responsible_department,
        } if procedure_template else None,
    }


def _safe_int(value):
    try:
        return int(value) if value not in (None, '') else None
    except (TypeError, ValueError):
        return None


def _build_monthly_task_counts(monthly_tasks):
    month_rows = list(
        monthly_tasks
        .annotate(year_value=ExtractYear('scheduled_date'), month_value=ExtractMonth('scheduled_date'))
        .values('year_value', 'month_value')
        .annotate(total=Count('id', distinct=True))
        .order_by('year_value', 'month_value')
    )
    month_counts = [
        {
            'year': row['year_value'],
            'month': row['month_value'],
            'total': row['total'],
        }
        for row in month_rows
    ]

    totals_by_year_month = {
        (row['year_value'], row['month_value']): row['total']
        for row in month_rows
        if row['year_value'] and row['month_value']
    }
    years = sorted({row['year_value'] for row in month_rows if row['year_value']})
    by_year = [
        {
            'year': year,
            'months': [
                {
                    'month': month,
                    'total': totals_by_year_month.get((year, month), 0),
                }
                for month in range(1, 13)
            ],
        }
        for year in years
    ]

    return month_counts, by_year


def get_recurring_maintenance_tasks(property_name: str = '', frequency: str = '', year: int = 0, month: int = 0):
    """
    ดึงรายการงานประจำ/งาน PM ที่เกิดซ้ำเป็นรายเดือนหรือรายปีสำหรับให้ AI chat ตอบคำถาม
    เช่น งานประจำเดือนนี้ งานประจำรายเดือนของสาขา งานประจำปี หรือตาราง recurring maintenance
    """
    return {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'}


def _get_recurring_maintenance_tasks_for_property(property_obj, frequency: str = '', year: int = 0, month: int = 0):
    """Execute recurring-task queries for an already-authorized Property object."""
    if not isinstance(property_obj, Property):
        return {'error': 'PROPERTY_AUTHORIZATION_REQUIRED'}

    normalized_frequency = str(frequency or '').strip().lower()
    frequency_aliases = {
        'yearly': 'annual',
        'annual': 'annual',
        'รายปี': 'annual',
        'ประจำปี': 'annual',
        'monthly': 'monthly',
        'รายเดือน': 'monthly',
        'ประจำเดือน': 'monthly',
    }
    selected_frequency = frequency_aliases.get(normalized_frequency, normalized_frequency)
    if selected_frequency not in {'monthly', 'annual'}:
        selected_frequency = ''

    selected_year = _safe_int(year)
    selected_month = _safe_int(month)

    tasks = PreventiveMaintenance.objects.select_related(
        'assigned_to',
        'completed_by',
        'created_by',
        'job',
        'job__area',
        'job__area__property',
        'procedure_template',
    ).prefetch_related('topics', 'job__rooms', 'machines', 'machines__property')

    if property_obj:
        tasks = tasks.filter(
            Q(job__area__property=property_obj) |
            Q(job__rooms__properties=property_obj) |
            Q(machines__property=property_obj)
        ).distinct()

    tasks = tasks.filter(frequency__in=['monthly', 'annual'])
    if selected_frequency:
        tasks = tasks.filter(frequency=selected_frequency)
    if selected_year:
        tasks = tasks.filter(scheduled_date__year=selected_year)
    if selected_month and 1 <= selected_month <= 12:
        tasks = tasks.filter(scheduled_date__month=selected_month)

    status_counts = list(
        tasks.values('status')
        .annotate(count=Count('id'))
        .order_by('status')
    )
    monthly_tasks = tasks.filter(frequency='monthly').order_by('scheduled_date', 'pmtitle')
    annual_tasks = tasks.filter(frequency='annual').order_by('scheduled_date', 'pmtitle')
    monthly_month_counts, monthly_counts_by_year = _build_monthly_task_counts(monthly_tasks)

    monthly_by_month = []
    for row in monthly_month_counts:
        month_items = monthly_tasks.filter(
            scheduled_date__year=row['year'],
            scheduled_date__month=row['month'],
        )[:20]
        monthly_by_month.append({
            'year': row['year'],
            'month': row['month'],
            'total': row['total'],
            'items': [_serialize_preventive_maintenance(pm) for pm in month_items],
        })

    annual_by_year = []
    for row in (
        annual_tasks
        .annotate(year_value=ExtractYear('scheduled_date'))
        .values('year_value')
        .annotate(total=Count('id'))
        .order_by('year_value')
    ):
        year_items = annual_tasks.filter(scheduled_date__year=row['year_value'])[:20]
        annual_by_year.append({
            'year': row['year_value'],
            'total': row['total'],
            'items': [_serialize_preventive_maintenance(pm) for pm in year_items],
        })

    return {
        'property': {
            'property_id': property_obj.property_id,
            'name': property_obj.name,
        } if property_obj else None,
        'filters': {
            'frequency': selected_frequency or 'monthly_and_annual',
            'year': selected_year,
            'month': selected_month if selected_month and 1 <= selected_month <= 12 else None,
        },
        'total': tasks.count(),
        'status_counts': [{'status': row['status'], 'count': row['count']} for row in status_counts],
        'monthly': {
            'total': monthly_tasks.count(),
            'month_counts': monthly_month_counts,
            'by_year': monthly_counts_by_year,
            'by_month': monthly_by_month,
        },
        'annual': {
            'total': annual_tasks.count(),
            'by_year': annual_by_year,
        },
    }
