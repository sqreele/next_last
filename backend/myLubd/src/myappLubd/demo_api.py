import uuid
from pathlib import Path
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

from .models import Area, Inventory, Job, JobComment, JobImage, PreventiveMaintenance, Property, Room, TenantMembership, Topic, Machine, DemoJobMachine, DemoJobDocument
from .demo_documents import validate_documents
from .demo_categories import MACHINE_CATEGORIES, machine_category_flags


DEMO_PROPERTY_ID = 'PB749146D'
ROOM_PMM_CATEGORY = 'PMMs Rooms'
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
        'rooms', 'topics', 'job_images', 'comments__author', 'demo_documents', 'demo_machine__machine',
    )


def _serialize_machine(machine):
    return {key: getattr(machine, key) for key in (
        'machine_id', 'name', 'brand', 'serial_number', 'category', 'location',
        'status', 'description', 'asset_tag', 'installation_date',
        'last_maintenance_date', 'warranty_end_date',
    )}


def _serialize_job(job):
    machine_link = getattr(job, 'demo_machine', None)
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
        'room': machine_link.machine.name if machine_link else (room.name if room else (job.area.name if job.area_id else 'Unassigned')),
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
        'machine': _serialize_machine(machine_link.machine) if machine_link else None,
        'documents': [{'id': doc.pk, 'name': doc.name, 'size': doc.size, 'url': f'/api/demo/documents/{doc.pk}/'} for doc in job.demo_documents.all()],
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
        'categories': sorted(set(Topic.objects.values_list('title', flat=True)) | {ROOM_PMM_CATEGORY}),
        'machine_categories': list(MACHINE_CATEGORIES),
        'areas': list(
            Area.objects.filter(property__property_id=DEMO_PROPERTY_ID, is_active=True)
            .order_by('name')
            .values_list('name', flat=True)
        ),
        'jobs': [_serialize_job(job) for job in jobs],
        'inventory': inventory,
        'machines': [_serialize_machine(machine) for machine in Machine.objects.filter(property__property_id=DEMO_PROPERTY_ID).order_by('name')],
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
        machine_id = str(request.data.get('machine_id') or '').strip()
        machine_flags = None
        if machine_id:
            try:
                machine_flags = machine_category_flags(category)
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=400)
        elif category in MACHINE_CATEGORIES:
            return Response({'detail': 'Machine work categories require a machine location.'}, status=400)
        documents = request.FILES.getlist('documents')
        if documents and not machine_id:
            return Response({'detail': 'PDF documents require a selected machine.'}, status=400)
        document_error = validate_documents(documents)
        if document_error:
            return Response({'detail': document_error}, status=400)
        before_uploads = [*request.FILES.getlist('before_images'), *request.FILES.getlist('before_image'), *request.FILES.getlist('image')]
        after_uploads = [*request.FILES.getlist('after_images'), *request.FILES.getlist('after_image')]
        if sum(upload.size for _, uploads in request.FILES.lists() for upload in uploads) > 3.5 * 1024 * 1024:
            return Response({'detail': 'Combined attachments must be under 3.5 MB.'}, status=400)
        if len(before_uploads) + len(after_uploads) > 5:
            return Response({'detail': 'A demo job can contain up to 5 photos in total.'}, status=400)
        if not 3 <= len(title) <= 160:
            return Response({'detail': 'Title must contain 3 to 160 characters.'}, status=400)
        if sum(bool(value) for value in (room_name, area_name, machine_id)) != 1:
            return Response({'detail': 'Select exactly one room, area or machine.'}, status=400)
        if len(room_name) > 100 or len(area_name) > 100:
            return Response({'detail': 'Invalid demo location.'}, status=400)
        if priority not in ALLOWED_PRIORITIES:
            return Response({'detail': 'Invalid priority.'}, status=400)
        if requested_status not in {'pending', 'in_progress', 'completed'}:
            return Response({'detail': 'Invalid initial status.'}, status=400)
        if len(remarks) > 1000:
            return Response({'detail': 'Remarks must be 1000 characters or fewer.'}, status=400)
        topic = Topic.objects.filter(title=category).first()
        if topic is None and category != ROOM_PMM_CATEGORY and not machine_id:
            return Response({'detail': 'Select a category from the demo category list.'}, status=400)
        if category == ROOM_PMM_CATEGORY and not room_name:
            return Response({'detail': 'PMMs Rooms requires a room location.'}, status=400)
        if after_uploads and requested_status != 'completed':
            return Response({'detail': 'After evidence is only available for completed jobs.'}, status=400)
        for candidate in before_uploads + after_uploads:
            if int(getattr(candidate, 'size', 0) or 0) > 3 * 1024 * 1024:
                return Response({'detail': 'Demo image must be 3 MB or smaller.'}, status=400)
            if str(getattr(candidate, 'content_type', '')).lower() not in {
                'image/jpeg', 'image/png', 'image/webp',
            }:
                return Response({'detail': 'Demo image must be JPEG, PNG, or WebP.'}, status=400)

        property_obj = Property.objects.filter(property_id=DEMO_PROPERTY_ID).first()
        if property_obj is None:
            return Response({'detail': 'Demo dataset is unavailable.'}, status=503)
        machine = Machine.objects.filter(property=property_obj, machine_id=machine_id).first() if machine_id else None
        if machine_id and machine is None:
            return Response({'detail': 'Select a machine from this demo property.'}, status=400)
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

        created_documents = []
        try:
            with transaction.atomic():
                if category == ROOM_PMM_CATEGORY or machine_id:
                    topic, _ = Topic.objects.get_or_create(title=category)
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
                    is_defective=category != ROOM_PMM_CATEGORY and str(request.data.get('is_defective') or 'true').lower() == 'true',
                    is_preventivemaintenance=category == ROOM_PMM_CATEGORY or str(request.data.get('is_preventive_maintenance') or 'false').lower() == 'true',
                    created_at=now,
                    updated_at=now,
                    completed_at=now if requested_status == 'completed' else None,
                )
                if machine_flags is not None:
                    job.is_preventivemaintenance = machine_flags['is_preventivemaintenance']
                    job.is_defective = machine_flags['is_defective']
                Job.objects.bulk_create([job])
                if machine:
                    DemoJobMachine.objects.create(job=job, machine=machine)
                for document in documents:
                    doc = DemoJobDocument(job=job, name=Path(document.name).name[:200], size=document.size)
                    doc.file.save(f'{uuid.uuid4().hex}.pdf', document, save=False)
                    created_documents.append((doc.file.storage, doc.file.name))
                    doc.save()
                if room is not None:
                    Job.rooms.through.objects.create(job_id=job.pk, room_id=room.pk)
                Job.topics.through.objects.create(job_id=job.pk, topic_id=topic.pk)
                for upload in before_uploads:
                    JobImage.objects.create(
                        job=job,
                        image=upload,
                        image_type='before',
                        uploaded_by=membership.user,
                    )
                for after_upload in after_uploads:
                    JobImage.objects.create(
                        job=job,
                        image=after_upload,
                        image_type='after',
                        uploaded_by=membership.user,
                    )
        except Exception as exc:
            for storage, name in created_documents:
                storage.delete(name)
            if isinstance(exc, DjangoValidationError):
                return Response({'detail': '; '.join(exc.messages)}, status=400)
            raise
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
            if job.job_images.count() >= 5:
                return Response({'detail': 'A demo job can contain up to 5 photos in total.'}, status=400)
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



class DemoDocumentView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [DemoApiThrottle]

    def get(self, request, document_id):
        _require_demo_mode()
        document = DemoJobDocument.objects.filter(pk=document_id, job__in=_demo_jobs()).first()
        if document is None:
            raise Http404
        try:
            document.file.open('rb')
        except (FileNotFoundError, OSError):
            raise Http404
        response = FileResponse(document.file, content_type='application/pdf', as_attachment=True, filename=document.name)
        response['Cache-Control'] = 'no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
