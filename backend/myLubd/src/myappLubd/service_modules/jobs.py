"""JobService domain operations."""
from typing import Dict, List, Any, Tuple
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Q
from django.core.paginator import Paginator
import logging
from ..models import Job, Room, Topic
from ..optimizations import QueryOptimizer
from ..cache_enhanced import cache_invalidation
from ..job_property import resolve_job_property, resolve_property_reference

logger = logging.getLogger(__name__)


class JobService:
    """
    Service for job-related business logic
    """

    @staticmethod
    def create_job(user, job_data: Dict[str, Any]) -> Job:
        """
        Create a new job with proper validation and relationships
        """
        try:
            with transaction.atomic():
                job_data = dict(job_data)
                # Extract related data
                topic_data = job_data.pop('topic_data', {})
                room_id = job_data.pop('room_id')
                images = job_data.pop('images', [])
                explicit_property = resolve_property_reference(job_data.pop('property_id', None) or job_data.pop('property', None))

                # Validate required fields
                if not room_id:
                    raise ValidationError("Room ID is required")
                if not topic_data.get('title'):
                    raise ValidationError("Topic title is required")

                # Get or create topic
                topic, created = Topic.objects.get_or_create(
                    title=topic_data['title'],
                    defaults={'description': topic_data.get('description', '')}
                )

                # Get room
                try:
                    room = Room.objects.get(room_id=room_id)
                except Room.DoesNotExist:
                    raise ValidationError("Invalid room ID")
                area = job_data.get('area')
                resolved_property = resolve_job_property(
                    explicit_property=explicit_property,
                    area=area,
                    rooms=[room],
                )

                from ..tenancy import enforce_storage_limit, enforce_subscription_limit, lock_tenants_for_membership_change
                locked_tenant = lock_tenants_for_membership_change(
                    resolved_property.tenant,
                )[resolved_property.tenant_id]
                enforce_subscription_limit(locked_tenant, 'max_monthly_work_orders')
                enforce_storage_limit(
                    locked_tenant,
                    sum(int(getattr(image, 'size', 0) or 0) for image in images),
                )

                # Create job
                job = Job.objects.create(
                    user=user,
                    updated_by=user,
                    property=resolved_property,
                    **job_data
                )

                # Add relationships
                job.rooms.add(room)
                job.topics.add(topic)

                # Handle images
                for image in images:
                    from ..models import JobImage
                    JobImage.objects.create(
                        job=job,
                        image=image,
                        uploaded_by=user
                    )

                # Invalidate cache
                cache_invalidation.invalidate_user_related_cache(user.id)

                logger.info(f"Created job {job.job_id} for user {user.username}")
                return job

        except Exception as e:
            logger.error(f"Failed to create job: {e}")
            raise

    @staticmethod
    def get_user_jobs(user, filters: Dict[str, Any] = None) -> Tuple[List[Job], Dict[str, Any]]:
        """
        Get jobs for a user with filtering and pagination
        """
        filters = filters or {}

        # Build query
        queryset = QueryOptimizer.get_optimized_job_queryset().filter(user=user)

        # Apply filters
        if filters.get('status'):
            queryset = queryset.filter(status=filters['status'])

        if filters.get('property_id'):
            queryset = queryset.filter(property__property_id=filters['property_id'])

        if filters.get('is_preventivemaintenance') is not None:
            queryset = queryset.filter(is_preventivemaintenance=filters['is_preventivemaintenance'])

        if filters.get('search'):
            search_term = filters['search']
            queryset = queryset.filter(
                Q(description__icontains=search_term) |
                Q(job_id__icontains=search_term)
            )

        # Pagination
        page_size = filters.get('page_size', 24)
        page_number = filters.get('page', 1)

        paginator = Paginator(queryset, page_size)
        page = paginator.get_page(page_number)

        # Get statistics
        stats = {
            'total': paginator.count,
            'pending': queryset.filter(status='pending').count(),
            'in_progress': queryset.filter(status='in_progress').count(),
            'completed': queryset.filter(status='completed').count(),
            'cancelled': queryset.filter(status='cancelled').count(),
        }

        return list(page), stats

    @staticmethod
    def update_job_status(job_id: str, status: str, user) -> Job:
        """
        Update job status with proper validation
        """
        try:
            job = Job.objects.get(job_id=job_id)

            # Validate status transition
            valid_transitions = {
                'pending': ['in_progress', 'cancelled'],
                'in_progress': ['completed', 'cancelled', 'waiting_sparepart'],
                'waiting_sparepart': ['in_progress', 'completed', 'cancelled'],
                'completed': [],  # No transitions from completed
                'cancelled': []   # No transitions from cancelled
            }

            if status not in valid_transitions.get(job.status, []):
                raise ValidationError(f"Invalid status transition from {job.status} to {status}")

            # Update job
            job.status = status
            job.updated_by = user

            if status == 'completed' and not job.completed_at:
                job.completed_at = timezone.now()

            job.save()

            # Invalidate cache
            cache_invalidation.invalidate_user_related_cache(user.id)

            logger.info(f"Updated job {job_id} status to {status}")
            return job

        except Job.DoesNotExist:
            raise ValidationError("Job not found")
        except Exception as e:
            logger.error(f"Failed to update job status: {e}")
            raise
