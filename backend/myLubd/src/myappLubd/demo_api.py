from django.conf import settings
from django.core.management import call_command
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import Area, Inventory, Job, JobComment, JobImage, PreventiveMaintenance, Property, Room, TenantMembership, Topic


DEMO_PROPERTY_ID = 'PB749146D'
DEMO_JOB_PREFIXES = ('DEMO-CT-', 'DWEB')
ALLOWED_PRIORITIES = {'low', 'medium', 'high', 'critical'}
ALLOWED_TRANSITIONS = {
    'pending': {'in_progress'},
    'in_progress': {'completed'},
}


class DemoApiThrottle(AnonRateThrottle):
    rate = '60/minute'


class DemoResetThrottle(AnonRateThrottle):
    rate = '2/minute'


def _require_demo_mode():
    if not settings.DEMO_MODE:
        raise Http404


def _demo_jobs():
    query = Job.all_objects.filter(property__property_id=DEMO_PROPERTY_ID, deleted_at__isnull=True)
    prefix_query = None
    from django.db.models import Q
    for prefix in DEMO_JOB_PREFIXES:
        clause = Q(job_id__startswith=prefix)
        prefix_query = clause if prefix_query is None else prefix_query | clause
    return query.filter(prefix_query).select_related('user', 'area').prefetch_related(
        'rooms', 'topics', 'job_images', 'comments__author',
    )


def _serialize_job(job):
    room = job.rooms.first()
    topic = job.topics.first()
    images = [
        {
            'id': image.pk,
            'image_type': image.image_type,
            'image_url': f'/api/demo/images/{image.pk}/',
        }
        for image in job.job_images.all()
        if image.image
    ]
    if not images:
        sample_number = (sum(ord(character) for character in job.job_id) % 4) + 1
        images = [{
            'id': f'sample-{sample_number}',
            'image_type': 'before',
            'image_url': f'/demo/evidence/maintenance-{sample_number}.svg',
        }]
    return {
        'id': job.job_id,
        'title': job.description.removeprefix('[DEMO] ').strip(),
        'room': room.name if room else (job.area.name if job.area_id else 'Unassigned'),
        'technician': job.user.get_human_display_name(),
        'status': job.status,
        'priority': job.priority,
        'category': topic.title if topic else 'Orther (อาการอื่นๆ)',
        'updated': job.updated_at.isoformat(),
        'created': job.created_at.isoformat(),
        'completed': job.completed_at.isoformat() if job.completed_at else None,
        'remarks': job.remarks.replace('[DEMO-PUBLIC-DATABASE]', '').replace('[DEMO-PRESENTATION-CHINATOWN]', '').strip(),
        'is_defective': job.is_defective,
        'is_preventive_maintenance': job.is_preventivemaintenance,
        'images': images,
        'comments': [
            {
                'id': comment.pk,
                'author': comment.author.get_human_display_name() if comment.author else 'Demo user',
                'comment': comment.comment.removeprefix('[DEMO] ').strip(),
                'created': comment.created_at.isoformat(),
            }
            for comment in job.comments.all()
        ],
    }


def demo_snapshot():
    jobs = list(_demo_jobs().order_by('-created_at'))
    inventory = list(
        Inventory.objects.filter(
            property__property_id=DEMO_PROPERTY_ID,
            item_id__startswith='DEMO-CT-INV-',
        ).values('item_id', 'name', 'quantity', 'status')
    )
    maintenance = list(
        PreventiveMaintenance.objects.filter(pm_id__startswith='DEMOCTPM')
        .order_by('scheduled_date')
        .values('pm_id', 'pmtitle', 'status', 'scheduled_date', 'quality_score')
    )
    return {
        'property': {'property_id': DEMO_PROPERTY_ID, 'name': 'StayMaint Demo Hotel - Chinatown'},
        'rooms': list(
            Room.objects.filter(property__property_id=DEMO_PROPERTY_ID, is_active=True)
            .order_by('name')
            .values_list('name', flat=True)
        ),
        'categories': list(Topic.objects.order_by('title').values_list('title', flat=True)),
        'areas': list(
            Area.objects.filter(property__property_id=DEMO_PROPERTY_ID, is_active=True)
            .order_by('name')
            .values_list('name', flat=True)
        ),
        'jobs': [_serialize_job(job) for job in jobs],
        'inventory': inventory,
        'maintenance': maintenance,
        'reset_interval_minutes': 30,
    }


class DemoSnapshotView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    throttle_classes = [DemoApiThrottle]

    def get(self, request):
        _require_demo_mode()
        return Response(demo_snapshot())

    def post(self, request):
        _require_demo_mode()
        if _demo_jobs().count() >= 100:
            return Response({'detail': 'Demo job limit reached. Wait for the next reset.'}, status=429)

        title = str(request.data.get('title') or '').strip()
        room_name = str(request.data.get('room') or '').strip()
        area_name = str(request.data.get('area') or '').strip()
        priority = str(request.data.get('priority') or 'medium').strip().lower()
        category = str(request.data.get('category') or 'Orther (อาการอื่นๆ)').strip()
        requested_status = str(request.data.get('status') or 'pending').strip().lower()
        remarks = str(request.data.get('remarks') or '').strip()
        upload = request.FILES.get('before_image') or request.FILES.get('image')
        after_upload = request.FILES.get('after_image')
        if not 3 <= len(title) <= 160:
            return Response({'detail': 'Title must contain 3 to 160 characters.'}, status=400)
        if bool(room_name) == bool(area_name):
            return Response({'detail': 'Select either one room or one area.'}, status=400)
        if len(room_name) > 100 or len(area_name) > 100:
            return Response({'detail': 'Invalid demo location.'}, status=400)
        if priority not in ALLOWED_PRIORITIES:
            return Response({'detail': 'Invalid priority.'}, status=400)
        if requested_status not in {'pending', 'in_progress', 'completed'}:
            return Response({'detail': 'Invalid initial status.'}, status=400)
        if len(remarks) > 1000:
            return Response({'detail': 'Remarks must be 1000 characters or fewer.'}, status=400)
        topic = Topic.objects.filter(title=category).first()
        if topic is None:
            return Response({'detail': 'Select a category from the demo category list.'}, status=400)
        if after_upload is not None and requested_status != 'completed':
            return Response({'detail': 'After evidence is only available for completed jobs.'}, status=400)
        for candidate in (upload, after_upload):
            if candidate is None:
                continue
            if int(getattr(candidate, 'size', 0) or 0) > 3 * 1024 * 1024:
                return Response({'detail': 'Demo image must be 3 MB or smaller.'}, status=400)
            if str(getattr(candidate, 'content_type', '')).lower() not in {
                'image/jpeg', 'image/png', 'image/webp',
            }:
                return Response({'detail': 'Demo image must be JPEG, PNG, or WebP.'}, status=400)

        property_obj = Property.objects.filter(property_id=DEMO_PROPERTY_ID).first()
        if property_obj is None:
            return Response({'detail': 'Demo dataset is unavailable.'}, status=503)
        room = Room.objects.filter(property=property_obj, name=room_name, is_active=True).first() if room_name else None
        area = Area.objects.filter(property=property_obj, name=area_name, is_active=True).first() if area_name else None
        if room_name and room is None:
            return Response({'detail': 'Select a room from the demo room list.'}, status=400)
        if area_name and area is None:
            return Response({'detail': 'Select an area from the demo area list.'}, status=400)
        membership = (
            TenantMembership.objects.filter(
                tenant=property_obj.tenant,
                properties=property_obj,
                is_active=True,
                role='technician',
                user__is_active=True,
            )
            .select_related('user')
            .order_by('user_id')
            .first()
        )
        if membership is None:
            return Response({'detail': 'Demo technician is unavailable.'}, status=503)

        try:
            with transaction.atomic():
                now = timezone.now()
                job = Job(
                    job_id=f"DWEB{get_random_string(8, allowed_chars='0123456789ABCDEF')}",
                    user=membership.user,
                    updated_by=membership.user,
                    property=property_obj,
                    area=area,
                    description=f'[DEMO] {title}',
                    remarks=f'[DEMO-PUBLIC-DATABASE] {remarks}'.strip(),
                    status=requested_status,
                    priority=priority,
                    is_defective=str(request.data.get('is_defective') or 'true').lower() == 'true',
                    is_preventivemaintenance=str(request.data.get('is_preventive_maintenance') or 'false').lower() == 'true',
                    created_at=now,
                    updated_at=now,
                    completed_at=now if requested_status == 'completed' else None,
                )
                Job.objects.bulk_create([job])
                if room is not None:
                    Job.rooms.through.objects.create(job_id=job.pk, room_id=room.pk)
                Job.topics.through.objects.create(job_id=job.pk, topic_id=topic.pk)
                if upload is not None:
                    JobImage.objects.create(
                        job=job,
                        image=upload,
                        image_type='before',
                        uploaded_by=membership.user,
                    )
                if after_upload is not None:
                    JobImage.objects.create(
                        job=job,
                        image=after_upload,
                        image_type='after',
                        uploaded_by=membership.user,
                    )
        except DjangoValidationError as exc:
            return Response({'detail': '; '.join(exc.messages)}, status=400)
        job = _demo_jobs().get(pk=job.pk)
        return Response(_serialize_job(job), status=status.HTTP_201_CREATED)


class DemoImageView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [DemoApiThrottle]

    def get(self, request, image_id):
        _require_demo_mode()
        image = JobImage.objects.filter(pk=image_id, job__in=_demo_jobs()).first()
        if image is None or not image.image:
            raise Http404
        try:
            image.image.open('rb')
        except (FileNotFoundError, OSError):
            raise Http404
        response = FileResponse(image.image, content_type='image/jpeg')
        response['Cache-Control'] = 'no-store'
        response['Content-Disposition'] = f'inline; filename="demo-job-{image.pk}.jpg"'
        return response


class DemoJobView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    throttle_classes = [DemoApiThrottle]

    def get(self, request, job_id):
        _require_demo_mode()
        job = _demo_jobs().filter(job_id=job_id).first()
        if job is None:
            raise Http404
        return Response(_serialize_job(job))

    def patch(self, request, job_id):
        _require_demo_mode()
        job = _demo_jobs().filter(job_id=job_id).first()
        if job is None:
            raise Http404
        requested_status = str(request.data.get('status') or '').strip()
        if requested_status not in ALLOWED_TRANSITIONS.get(job.status, set()):
            return Response({'detail': 'This demo status transition is not allowed.'}, status=400)
        after_upload = request.FILES.get('after_image')
        if after_upload is not None:
            if requested_status != 'completed':
                return Response({'detail': 'After evidence is only available when closing a job.'}, status=400)
            if int(getattr(after_upload, 'size', 0) or 0) > 3 * 1024 * 1024:
                return Response({'detail': 'Demo image must be 3 MB or smaller.'}, status=400)
            if str(getattr(after_upload, 'content_type', '')).lower() not in {
                'image/jpeg', 'image/png', 'image/webp',
            }:
                return Response({'detail': 'Demo image must be JPEG, PNG, or WebP.'}, status=400)
        now = timezone.now()
        updates = {'status': requested_status, 'updated_at': now}
        if requested_status == 'completed':
            updates['completed_at'] = now
        try:
            with transaction.atomic():
                Job.all_objects.filter(pk=job.pk).update(**updates)
                if after_upload is not None:
                    JobImage.objects.create(
                        job=job, image=after_upload, image_type='after', uploaded_by=job.user,
                    )
        except DjangoValidationError as exc:
            return Response({'detail': '; '.join(exc.messages)}, status=400)
        job = _demo_jobs().get(pk=job.pk)
        return Response(_serialize_job(job))


class DemoJobCommentView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]
    throttle_classes = [DemoApiThrottle]

    def post(self, request, job_id):
        _require_demo_mode()
        job = _demo_jobs().filter(job_id=job_id).first()
        if job is None:
            raise Http404
        comment = str(request.data.get('comment') or '').strip()
        if not 2 <= len(comment) <= 500:
            return Response({'detail': 'Comment must contain 2 to 500 characters.'}, status=400)
        JobComment.objects.create(job=job, author=job.user, comment=f'[DEMO] {comment}')
        job = _demo_jobs().get(pk=job.pk)
        return Response(_serialize_job(job), status=status.HTTP_201_CREATED)


class DemoResetView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]
    throttle_classes = [DemoResetThrottle]

    def post(self, request):
        _require_demo_mode()
        call_command('seed_public_demo', reset=True, verbosity=0)
        return Response(demo_snapshot())
