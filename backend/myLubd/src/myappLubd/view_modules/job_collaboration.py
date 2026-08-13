import logging

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from ..models import JobComment, Property
from ..serializers import JobCommentSerializer
from ..tenancy import accessible_property_ids
from .common import display_name_from_user


User = get_user_model()
logger = logging.getLogger(__name__)


def _job_property_scope_ids(job):
    """Return every authoritative Property PK associated with a Job."""
    property_ids = set(
        Property.objects.filter(rooms__jobs=job).values_list('id', flat=True)
    )
    if job.area_id:
        property_ids.add(job.area.property_id)
    return property_ids


class JobCollaborationMixin:
        @action(detail=True, methods=['get', 'post'], url_path='comments')
        def comments(self, request, job_id=None):
            """List or create comments on a job. Tenant isolation is enforced via
            the existing get_queryset(): the job must be reachable to the user.
            """
            job = self.get_object()
    
            if request.method.lower() == 'get':
                qs = job.comments.select_related('author').order_by('created_at')
                serializer = JobCommentSerializer(qs, many=True, context={'request': request})
                return Response({
                    'count': qs.count(),
                    'results': serializer.data,
                }, status=status.HTTP_200_OK)
    
            # POST
            serializer = JobCommentSerializer(data=request.data, context={'request': request})
            serializer.is_valid(raise_exception=True)
            author = request.user if request.user.is_authenticated else None
            request_id = serializer.validated_data.get('client_comment_request_id')
            lookup = {
                'job': job,
                'author': author,
                'client_comment_request_id': request_id,
            }
            comment = None
            created = True

            if request_id is not None:
                comment = JobComment.objects.filter(**lookup).first()

            if comment is None:
                try:
                    # The conditional unique constraint is authoritative. The
                    # inner atomic block supplies a savepoint so a concurrent
                    # uniqueness collision can be resolved safely afterward.
                    with transaction.atomic():
                        comment = JobComment.objects.create(
                            **lookup,
                            comment=serializer.validated_data['comment'],
                        )
                except IntegrityError:
                    if request_id is None:
                        raise
                    comment = JobComment.objects.filter(**lookup).first()
                    if comment is None:
                        raise
                    created = False
            else:
                created = False

            if comment.comment != serializer.validated_data['comment']:
                raise ValidationError({
                    'client_comment_request_id': (
                        'This request ID is already bound to a different comment.'
                    ),
                })

            out = JobCommentSerializer(comment, context={'request': request})
            response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
            return Response(out.data, status=response_status)
    
        @action(detail=True, methods=['get'], url_path='audit-log')
        def audit_log(self, request, job_id=None):
            """Synthetic activity log derived from existing job state and comments.
    
            Until a dedicated AuditLog model lands (which would require a
            migration), we surface the auditable timestamps already on the model:
            creation, completion, image uploads, comments, and remark notes (the
            UpdateStatusModal prepends `[ts · user → new_status] message` lines
            which we parse out here). The response is a chronological list of
            events the frontend can render as a timeline.
            """
            job = self.get_object()
            events = []
    
            creator_name = display_name_from_user(job.user, fallback='system')
            events.append({
                'kind': 'created',
                'at': job.created_at.isoformat() if job.created_at else None,
                'actor': creator_name,
                'message': 'Job created',
            })
    
            if job.completed_at:
                updater_name = display_name_from_user(job.updated_by, fallback='unknown')
                events.append({
                    'kind': 'completed',
                    'at': job.completed_at.isoformat(),
                    'actor': updater_name,
                    'message': 'Job completed',
                })
    
            # Image uploads — JobImage has uploaded_at and uploaded_by
            for image in job.job_images.all().order_by('uploaded_at'):
                uploaded_by = display_name_from_user(image.uploaded_by, fallback='unknown') if image.uploaded_by else None
                image_url = None
                if image.image:
                    try:
                        image_url = request.build_absolute_uri(image.image.url)
                    except Exception:
                        image_url = image.image.url
                events.append({
                    'kind': 'photo_uploaded',
                    'at': image.uploaded_at.isoformat() if image.uploaded_at else None,
                    'actor': uploaded_by or 'unknown',
                    'message': 'Photo uploaded',
                    'image_url': image_url,
                })
    
            # Comments
            for comment in job.comments.select_related('author').order_by('created_at'):
                author = display_name_from_user(comment.author, fallback='unknown')
                events.append({
                    'kind': 'comment',
                    'at': comment.created_at.isoformat() if comment.created_at else None,
                    'actor': author,
                    'message': comment.comment,
                })
    
            # Parse status-change lines that UpdateStatusModal appends to remarks.
            # Format: `[YYYY-MM-DD HH:MM · username → status] message`
            if job.remarks:
                import re
    
                pattern = re.compile(
                    r'\[(?P<ts>\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})\s*[·-]\s*(?P<actor>[^→]+?)\s*→\s*(?P<status>[a-z_]+)\]\s*(?P<msg>.*)',
                    re.IGNORECASE,
                )
                for line in job.remarks.splitlines():
                    match = pattern.search(line)
                    if not match:
                        continue
                    events.append({
                        'kind': 'status_change',
                        'at': match.group('ts').replace(' ', 'T') + ':00',
                        'actor': match.group('actor').strip(),
                        'message': f"Status → {match.group('status')}",
                        'note': match.group('msg').strip() or None,
                        'new_status': match.group('status'),
                    })
    
            # Sort: missing timestamps last
            def _sort_key(event):
                return event.get('at') or '9999-12-31T23:59:59'
    
            events.sort(key=_sort_key)
    
            return Response({
                'job_id': job.job_id,
                'count': len(events),
                'events': events,
            })
    
        @action(detail=True, methods=['post'], url_path='reassign')
        def reassign(self, request, job_id=None):
            """Reassign a Job within its single authoritative Property scope.
    
            Body: {"user_id": <canonical User.id>, "note"?: str}
    
            Stamps the remarks with the same status-note format the audit log
            already parses, so the timeline picks up the reassignment as a
            first-class event. Pushes both the new and previous assignee."""
            job = self.get_object()
            target_raw = (request.data or {}).get('user_id')
            if not target_raw:
                return Response(
                    {'error': 'user_id is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
    
            target_str = str(target_raw).strip()
            if not target_str.isdigit():
                return Response(
                    {'error': 'user_id must be a canonical numeric user ID.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            target = User.objects.filter(pk=int(target_str)).first()
            if target is None:
                return Response(
                    {'error': 'Target user not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
    
            # Lock the Job while validating and mutating so two concurrent
            # reassignments cannot both write from the same prior assignment.
            with transaction.atomic():
                job = (
                    type(job).objects.select_for_update()
                    .get(pk=job.pk)
                )
                job_property_ids = _job_property_scope_ids(job)
                if len(job_property_ids) != 1:
                    return Response(
                        {'error': 'Job property scope is missing or ambiguous.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                job_property_id = next(iter(job_property_ids))
                target_property_ids = accessible_property_ids(target)
                if (
                    target_property_ids is not None
                    and job_property_id not in target_property_ids
                ):
                    return Response(
                        {'error': "Target user has no access to this job's property."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                previous = job.user
                if previous and previous.pk == target.pk:
                    return Response(
                        {'error': 'Job is already assigned to that user.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                note = ((request.data or {}).get('note') or '').strip()[:300]
                stamp = timezone.now().strftime('%Y-%m-%d %H:%M')
                actor = display_name_from_user(
                    request.user,
                    fallback=getattr(request.user, 'email', None) or 'system',
                )
                new_username = display_name_from_user(
                    target,
                    fallback=getattr(target, 'email', None) or f'user-{target.pk}',
                )
                prev_username = (
                    display_name_from_user(previous, fallback='unassigned')
                    if previous
                    else 'unassigned'
                )
                log_line = (
                    f"[{stamp} · {actor} → reassigned] "
                    f"{prev_username} → {new_username}"
                    + (f" — {note}" if note else '')
                )

                job.user = target
                job.updated_by = request.user
                job.remarks = f"{job.remarks}\n{log_line}" if job.remarks else log_line
                job.save(update_fields=['user', 'updated_by', 'remarks', 'updated_at'])
    
            # Push to the new assignee; signal-driven push on Job.save() already
            # fires on changed status but not on assignment, so we send an
            # explicit one here. Previous assignee gets a courtesy note.
            try:
                from ..push import send_push_to_user
                send_push_to_user(
                    target,
                    {
                        'title': 'Job reassigned to you',
                        'body': (job.description or job.job_id)[:120],
                        'tag': f'job-reassign-{job.job_id}',
                        'url': f'/dashboard/jobs/{job.job_id}',
                        'renotify': True,
                    },
                )
                if previous is not None and previous.pk != target.pk:
                    send_push_to_user(
                        previous,
                        {
                            'title': 'Job reassigned',
                            'body': f"#{job.job_id} is now assigned to {new_username}.",
                            'tag': f'job-reassign-prev-{job.job_id}',
                            'url': f'/dashboard/jobs/{job.job_id}',
                        },
                    )
            except Exception:  # pragma: no cover - defensive
                logger.exception('Reassignment push failed for job=%s', job.job_id)
    
            return Response(
                {
                    'job_id': job.job_id,
                    'assignee': new_username,
                    'previous': prev_username,
                },
                status=status.HTTP_200_OK,
            )
