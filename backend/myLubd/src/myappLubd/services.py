"""
Service layer for business logic separation
"""
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from calendar import monthrange
import csv
from io import StringIO
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Q, Count, F, Prefetch
from django.core.paginator import Paginator
from django.contrib.auth import get_user_model
import logging

from .models import (
    Job, Property, Room, Topic, UserProfile, 
    PreventiveMaintenance, Machine, MaintenanceProcedure
)
from .optimizations import QueryOptimizer, CacheOptimizer
from .cache_enhanced import cache_manager, cache_invalidation

logger = logging.getLogger(__name__)
User = get_user_model()


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
                # Extract related data
                topic_data = job_data.pop('topic_data', {})
                room_id = job_data.pop('room_id')
                images = job_data.pop('images', [])
                
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
                
                # Create job
                job = Job.objects.create(
                    user=user,
                    updated_by=user,
                    **job_data
                )
                
                # Add relationships
                job.rooms.add(room)
                job.topics.add(topic)
                
                # Handle images
                for image in images:
                    from .models import JobImage
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
            queryset = queryset.filter(rooms__properties__property_id=filters['property_id'])
        
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


class PropertyService:
    """
    Service for property-related business logic
    """
    
    @staticmethod
    def get_user_properties(user) -> List[Property]:
        """
        Get properties accessible to a user
        """
        cache_key = f"user_properties:{user.id}"
        
        def fetch_properties():
            if user.is_staff or user.is_superuser:
                return list(Property.objects.all())
            return list(Property.objects.filter(users=user))
        
        return cache_manager.get_or_set(cache_key, fetch_properties, timeout=300)
    
    @staticmethod
    def get_property_rooms(property_id: str, user) -> List[Room]:
        """
        Get rooms for a specific property
        """
        # Check user access
        property_obj = PropertyService.get_property_by_id(property_id, user)
        
        cache_key = f"property_rooms:{property_id}"
        
        def fetch_rooms():
            return list(Room.objects.filter(properties=property_obj))
        
        return cache_manager.get_or_set(cache_key, fetch_rooms, timeout=300)
    
    @staticmethod
    def get_property_by_id(property_id: str, user) -> Property:
        """
        Get property by ID with access control
        """
        try:
            property_obj = Property.objects.get(property_id=property_id)
            
            # Check access
            if not (user.is_staff or user.is_superuser):
                if not property_obj.users.filter(id=user.id).exists():
                    raise ValidationError("Access denied to this property")
            
            return property_obj
            
        except Property.DoesNotExist:
            raise ValidationError("Property not found")
    
    @staticmethod
    def get_property_stats(property_id: str, user) -> Dict[str, Any]:
        """
        Get statistics for a property
        """
        property_obj = PropertyService.get_property_by_id(property_id, user)
        
        cache_key = f"property_stats:{property_id}"
        
        def fetch_stats():
            jobs = Job.objects.filter(rooms__properties=property_obj)
            
            return {
                'total_jobs': jobs.count(),
                'pending_jobs': jobs.filter(status='pending').count(),
                'in_progress_jobs': jobs.filter(status='in_progress').count(),
                'completed_jobs': jobs.filter(status='completed').count(),
                'preventive_maintenance_jobs': jobs.filter(is_preventivemaintenance=True).count(),
                'rooms_count': property_obj.rooms.count(),
                'machines_count': property_obj.machines.count()
            }
        
        return cache_manager.get_or_set(cache_key, fetch_stats, timeout=300)


class PreventiveMaintenanceService:
    """
    Service for preventive maintenance business logic
    """
    
    @staticmethod
    def create_preventive_maintenance(user, pm_data: Dict[str, Any]) -> PreventiveMaintenance:
        """
        Create a new preventive maintenance task
        """
        try:
            with transaction.atomic():
                # Extract related data
                topic_ids = pm_data.pop('topic_ids', [])
                machine_ids = pm_data.pop('machine_ids', [])
                
                # Create PM task
                pm_task = PreventiveMaintenance.objects.create(
                    created_by=user,
                    **pm_data
                )
                
                # Add relationships
                if topic_ids:
                    pm_task.topics.set(topic_ids)
                
                if machine_ids:
                    machines = Machine.objects.filter(machine_id__in=machine_ids)
                    pm_task.machines.set(machines)
                
                # Invalidate cache
                cache_invalidation.invalidate_user_related_cache(user.id)
                
                logger.info(f"Created PM task {pm_task.pm_id}")
                return pm_task
                
        except Exception as e:
            logger.error(f"Failed to create PM task: {e}")
            raise
    
    @staticmethod
    def get_upcoming_maintenance(user, days: int = 30) -> List[PreventiveMaintenance]:
        """
        Get upcoming maintenance tasks
        """
        now = timezone.now()
        end_date = now + timezone.timedelta(days=days)
        
        queryset = QueryOptimizer.get_optimized_preventive_maintenance_queryset().filter(
            completed_date__isnull=True,
            scheduled_date__gte=now,
            scheduled_date__lte=end_date
        ).order_by('scheduled_date')
        
        # Filter by user access
        if not user.is_staff:
            user_properties = Property.objects.filter(users=user)
            queryset = queryset.filter(
                Q(job__rooms__properties__in=user_properties) |
                Q(machines__property__in=user_properties)
            )
        
        return list(queryset.distinct())
    
    @staticmethod
    def complete_maintenance(pm_id: str, completion_data: Dict[str, Any], user) -> PreventiveMaintenance:
        """
        Complete a preventive maintenance task
        """
        try:
            pm_task = PreventiveMaintenance.objects.get(pm_id=pm_id)
            
            if pm_task.completed_date:
                raise ValidationError("Maintenance task already completed")
            
            # Update completion data
            pm_task.completed_date = completion_data.get('completed_date', timezone.now())
            pm_task.completion_notes = completion_data.get('notes', '')
            pm_task.completed_by = user
            
            # Calculate next due date
            pm_task.calculate_next_due_date()
            
            pm_task.save()
            
            # Invalidate cache
            cache_invalidation.invalidate_user_related_cache(user.id)
            
            logger.info(f"Completed PM task {pm_id}")
            return pm_task
            
        except PreventiveMaintenance.DoesNotExist:
            raise ValidationError("Maintenance task not found")
        except Exception as e:
            logger.error(f"Failed to complete PM task: {e}")
            raise


class MachineService:
    """
    Service for machine-related business logic
    """
    
    @staticmethod
    def get_user_machines(user) -> List[Machine]:
        """
        Get machines accessible to a user
        """
        if user.is_staff or user.is_superuser:
            return list(Machine.objects.select_related('property').all())
        
        user_properties = Property.objects.filter(users=user)
        return list(Machine.objects.filter(property__in=user_properties).select_related('property'))
    
    @staticmethod
    def create_machine(machine_data: Dict[str, Any], user) -> Machine:
        """
        Create a new machine
        """
        try:
            # Validate property access
            property_id = machine_data.get('property')
            if property_id:
                property_obj = PropertyService.get_property_by_id(property_id, user)
                machine_data['property'] = property_obj
            
            machine = Machine.objects.create(**machine_data)
            
            # Invalidate cache
            cache_invalidation.invalidate_property_related_cache(property_id)
            
            logger.info(f"Created machine {machine.machine_id}")
            return machine
            
        except Exception as e:
            logger.error(f"Failed to create machine: {e}")
            raise
    
    @staticmethod
    def update_machine_status(machine_id: str, status: str, user) -> Machine:
        """
        Update machine status
        """
        try:
            machine = Machine.objects.get(machine_id=machine_id)
            
            # Validate status
            valid_statuses = [choice[0] for choice in Machine.STATUS_CHOICES]
            if status not in valid_statuses:
                raise ValidationError(f"Invalid status: {status}")
            
            machine.status = status
            machine.save()
            
            # Invalidate cache
            cache_invalidation.invalidate_property_related_cache(machine.property.property_id)
            
            logger.info(f"Updated machine {machine_id} status to {status}")
            return machine
            
        except Machine.DoesNotExist:
            raise ValidationError("Machine not found")
        except Exception as e:
            logger.error(f"Failed to update machine status: {e}")
            raise


class MaintenanceProcedureService:
    """
    Service for maintenance procedure business logic
    """
    
    @staticmethod
    def create_procedure(procedure_data: Dict[str, Any], user) -> MaintenanceProcedure:
        """
        Create a new maintenance procedure
        """
        try:
            steps_data = procedure_data.pop('steps', [])
            
            procedure = MaintenanceProcedure.objects.create(**procedure_data)
            
            # Add steps
            for step_data in steps_data:
                procedure.add_step(step_data)
            
            logger.info(f"Created maintenance procedure {procedure.name}")
            return procedure
            
        except Exception as e:
            logger.error(f"Failed to create maintenance procedure: {e}")
            raise
    
    @staticmethod
    def get_procedures_by_difficulty(difficulty: str = None) -> List[MaintenanceProcedure]:
        """
        Get maintenance procedures by difficulty level
        """
        queryset = MaintenanceProcedure.objects.all()
        
        if difficulty:
            queryset = queryset.filter(difficulty_level=difficulty)
        
        return list(queryset.order_by('name'))
    
    @staticmethod
    def search_procedures_by_tools(tool_query: str) -> List[MaintenanceProcedure]:
        """
        Search procedures by required tools
        """
        procedures = MaintenanceProcedure.objects.all()
        matching_procedures = []
        
        for procedure in procedures:
            if procedure.required_tools and tool_query.lower() in procedure.required_tools.lower():
                matching_procedures.append(procedure)
        
        return matching_procedures


class NotificationService:
    """
    Service for notification and alert logic
    """
    
    @staticmethod
    def get_overdue_maintenance(user) -> List[PreventiveMaintenance]:
        """
        Get overdue maintenance tasks
        """
        now = timezone.now()
        
        queryset = QueryOptimizer.get_optimized_preventive_maintenance_queryset().filter(
            completed_date__isnull=True,
            scheduled_date__lt=now
        ).order_by('scheduled_date')
        
        # Filter by user access
        if not user.is_staff:
            user_properties = Property.objects.filter(users=user)
            queryset = queryset.filter(
                Q(job__rooms__properties__in=user_properties) |
                Q(machines__property__in=user_properties)
            )
        
        return list(queryset.distinct())

    @staticmethod
    def get_upcoming_alerts(user, days: int = 7) -> List[PreventiveMaintenance]:
        """
        Get maintenance tasks due in the next few days
        """
        now = timezone.now()
        end_date = now + timezone.timedelta(days=days)
        
        queryset = QueryOptimizer.get_optimized_preventive_maintenance_queryset().filter(
            completed_date__isnull=True,
            scheduled_date__gte=now,
            scheduled_date__lte=end_date
        ).order_by('scheduled_date')
        
        # Filter by user access
        if not user.is_staff:
            user_properties = Property.objects.filter(users=user)
            queryset = queryset.filter(
                Q(job__rooms__properties__in=user_properties) |
                Q(machines__property__in=user_properties)
            )
        
        return list(queryset.distinct())


class PreventiveMaintenanceService:
    """
    Service for preventive maintenance import, status changes, and scheduling.
    """

    STATUS_MAP = {
        'scheduled': 'pending',
        'pending': 'pending',
        'in_progress': 'in_progress',
        'in progress': 'in_progress',
        'completed': 'completed',
        'cancelled': 'cancelled',
        'canceled': 'cancelled',
        'overdue': 'overdue',
    }

    FREQUENCY_MAP = {
        'daily': 'daily',
        'weekly': 'weekly',
        'monthly': 'monthly',
        'quarterly': 'quarterly',
        'semiannual': 'semi_annual',
        'semi-annual': 'semi_annual',
        'semi_annual': 'semi_annual',
        'annual': 'annual',
        'yearly': 'annual',
        'custom': 'custom',
    }

    STATUS_TRANSITIONS = {
        'pending': {'in_progress', 'completed', 'cancelled', 'overdue'},
        'in_progress': {'completed', 'cancelled', 'overdue'},
        'overdue': {'in_progress', 'completed', 'cancelled'},
        'completed': set(),
        'cancelled': set(),
    }

    @staticmethod
    def normalize_status(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        return PreventiveMaintenanceService.STATUS_MAP.get(normalized)

    @staticmethod
    def normalize_frequency(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        return PreventiveMaintenanceService.FREQUENCY_MAP.get(normalized)

    @staticmethod
    def parse_datetime_value(value: Any, field_name: str) -> datetime:
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValidationError(f"{field_name} is required")

        if isinstance(value, datetime):
            parsed = value
        else:
            from django.utils.dateparse import parse_datetime

            parsed = parse_datetime(str(value).strip())

        if not parsed:
            raise ValidationError(f"{field_name} must be a valid datetime")

        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_default_timezone())

        return parsed

    @staticmethod
    def calculate_next_due_date(
        frequency: str,
        custom_days: Optional[int],
        base_date: datetime,
    ) -> datetime:
        if not base_date:
            raise ValidationError("Base date is required to calculate next due date")

        if timezone.is_naive(base_date):
            base_date = timezone.make_aware(base_date, timezone.get_default_timezone())

        if frequency == 'daily':
            return base_date + timezone.timedelta(days=1)
        if frequency == 'weekly':
            return base_date + timezone.timedelta(weeks=1)
        if frequency == 'monthly':
            month = base_date.month + 1
            year = base_date.year
            if month > 12:
                month = 1
                year += 1
            day = min(base_date.day, monthrange(year, month)[1])
            return base_date.replace(year=year, month=month, day=day)
        if frequency == 'quarterly':
            month = base_date.month + 3
            year = base_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(base_date.day, monthrange(year, month)[1])
            return base_date.replace(year=year, month=month, day=day)
        if frequency == 'semi_annual':
            month = base_date.month + 6
            year = base_date.year
            if month > 12:
                month -= 12
                year += 1
            day = min(base_date.day, monthrange(year, month)[1])
            return base_date.replace(year=year, month=month, day=day)
        if frequency == 'annual':
            return base_date.replace(year=base_date.year + 1)
        if frequency == 'custom':
            if not custom_days or custom_days <= 0:
                raise ValidationError("Custom days must be greater than zero for custom frequency")
            return base_date + timezone.timedelta(days=custom_days)

        raise ValidationError(f"Unsupported frequency: {frequency}")

    @staticmethod
    def update_status(
        maintenance: PreventiveMaintenance,
        new_status: str,
        user,
        completed_date: Optional[datetime] = None,
    ) -> Dict[str, Optional[PreventiveMaintenance]]:
        normalized_status = PreventiveMaintenanceService.normalize_status(new_status)
        if not normalized_status:
            raise ValidationError("Invalid status value")

        current_status = maintenance.status
        allowed = PreventiveMaintenanceService.STATUS_TRANSITIONS.get(current_status, set())
        if normalized_status not in allowed and normalized_status != current_status:
            raise ValidationError(f"Invalid status transition from {current_status} to {normalized_status}")

        next_schedule = None

        if normalized_status == 'completed':
            if completed_date is None:
                completed_date = timezone.now()
            if timezone.is_naive(completed_date):
                completed_date = timezone.make_aware(completed_date, timezone.get_default_timezone())

            base_date = completed_date or maintenance.scheduled_date
            next_due_date = PreventiveMaintenanceService.calculate_next_due_date(
                maintenance.frequency,
                maintenance.custom_days,
                base_date,
            )

            maintenance.status = normalized_status
            maintenance.completed_date = completed_date
            maintenance.next_due_date = next_due_date
            maintenance.save(update_fields=['status', 'completed_date', 'next_due_date', 'updated_at'])

            next_schedule = PreventiveMaintenanceService.create_next_occurrence(
                maintenance,
                next_due_date,
                user,
            )
        else:
            maintenance.status = normalized_status
            maintenance.save(update_fields=['status', 'updated_at'])

        return {
            'current': maintenance,
            'next_schedule': next_schedule,
        }

    @staticmethod
    def create_next_occurrence(
        maintenance: PreventiveMaintenance,
        scheduled_date: datetime,
        user,
    ) -> PreventiveMaintenance:
        next_due_date = PreventiveMaintenanceService.calculate_next_due_date(
            maintenance.frequency,
            maintenance.custom_days,
            scheduled_date,
        )

        next_task = PreventiveMaintenance.objects.create(
            pmtitle=maintenance.pmtitle,
            scheduled_date=scheduled_date,
            frequency=maintenance.frequency,
            custom_days=maintenance.custom_days,
            next_due_date=next_due_date,
            status='pending',
            notes=maintenance.notes,
            procedure=maintenance.procedure,
            procedure_template=maintenance.procedure_template,
            assigned_to=maintenance.assigned_to,
            created_by=maintenance.created_by,
            job=maintenance.job,
            remarks=maintenance.remarks,
        )

        next_task.topics.set(maintenance.topics.all())
        next_task.machines.set(maintenance.machines.all())

        logger.info(
            "Created next preventive maintenance occurrence %s from %s",
            next_task.pm_id,
            maintenance.pm_id,
        )

        return next_task

    @staticmethod
    def import_from_csv_content(
        csv_content: str,
        default_user,
    ) -> Dict[str, Any]:
        reader = csv.DictReader(StringIO(csv_content))
        results = {
            'created': 0,
            'updated': 0,
            'errors': [],
        }

        for row_index, row in enumerate(reader, start=2):
            try:
                with transaction.atomic():
                    created = PreventiveMaintenanceService.upsert_from_row(row, default_user)
                if created:
                    results['created'] += 1
                else:
                    results['updated'] += 1
            except ValidationError as exc:
                results['errors'].append({
                    'row': row_index,
                    'error': str(exc),
                })
            except Exception as exc:  # noqa: BLE001 - capture unexpected import errors
                results['errors'].append({
                    'row': row_index,
                    'error': f"Unexpected error: {exc}",
                })

        return results

    @staticmethod
    def upsert_from_row(row: Dict[str, Any], default_user) -> bool:
        pm_id = str(row.get('PM ID', '')).strip()
        if not pm_id:
            raise ValidationError("PM ID is required for import")

        scheduled_date = PreventiveMaintenanceService.parse_datetime_value(
            row.get('Scheduled Date'),
            "Scheduled Date",
        )

        completed_date_raw = row.get('Completed Date')
        completed_date = None
        if completed_date_raw:
            completed_date = PreventiveMaintenanceService.parse_datetime_value(
                completed_date_raw,
                "Completed Date",
            )

        status_raw = row.get('Status')
        status_value = PreventiveMaintenanceService.normalize_status(status_raw) or 'pending'

        frequency_raw = row.get('Frequency') or 'monthly'
        frequency = PreventiveMaintenanceService.normalize_frequency(frequency_raw)
        if not frequency:
            raise ValidationError(f"Invalid frequency: {frequency_raw}")

        custom_days = None
        if row.get('Custom Days') not in (None, ''):
            try:
                custom_days = int(row.get('Custom Days'))
            except (TypeError, ValueError) as exc:
                raise ValidationError("Custom Days must be a number") from exc

        if frequency == 'custom' and (not custom_days or custom_days <= 0):
            raise ValidationError("Custom Days must be greater than zero for custom frequency")

        if status_value == 'completed' and not completed_date:
            raise ValidationError("Completed Date is required when Status is Completed")

        base_date = completed_date or scheduled_date
        next_due_date = PreventiveMaintenanceService.calculate_next_due_date(
            frequency,
            custom_days,
            base_date,
        )

        assigned_to = PreventiveMaintenanceService._find_user(
            row.get('Assigned Email'),
            row.get('Assigned To'),
        )

        created_by = PreventiveMaintenanceService._find_user(
            row.get('Creator Email'),
            row.get('Created By'),
        ) or default_user

        procedure_template = PreventiveMaintenanceService._find_procedure_template(
            row.get('Task Template'),
        )

        existing = PreventiveMaintenance.objects.filter(pm_id__iexact=pm_id).first()

        defaults = {
            'pmtitle': row.get('Title') or 'No title',
            'scheduled_date': scheduled_date,
            'completed_date': completed_date if status_value == 'completed' else None,
            'status': status_value,
            'frequency': frequency,
            'custom_days': custom_days,
            'next_due_date': next_due_date,
            'notes': row.get('Notes') or None,
            'procedure': row.get('Procedure') or None,
            'procedure_template': procedure_template,
            'assigned_to': assigned_to,
            'created_by': created_by,
        }

        if existing:
            for field_name, value in defaults.items():
                setattr(existing, field_name, value)
            existing.save()
            maintenance = existing
            created = False
        else:
            maintenance = PreventiveMaintenance.objects.create(pm_id=pm_id, **defaults)
            created = True

        topics = PreventiveMaintenanceService._parse_list_values(row.get('Topics'))
        machines = PreventiveMaintenanceService._parse_list_values(row.get('Machines'))

        if topics is not None:
            topic_ids = []
            for topic_name in topics:
                topic_obj, _ = Topic.objects.get_or_create(title=topic_name)
                topic_ids.append(topic_obj.id)
            maintenance.topics.set(topic_ids)

        if machines is not None:
            maintenance.machines.set(Machine.objects.filter(machine_id__in=machines))

        return created

    @staticmethod
    def _parse_list_values(value: Any) -> Optional[List[str]]:
        if value is None:
            return None
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]

        raw = str(value).strip()
        if not raw:
            return []
        separators = [',', ';', '|']
        for sep in separators:
            if sep in raw:
                return [item.strip() for item in raw.split(sep) if item.strip()]
        return [raw]

    @staticmethod
    def _find_user(email_value: Any, username_value: Any):
        if email_value:
            user = User.objects.filter(email__iexact=str(email_value).strip()).first()
            if user:
                return user

        if username_value:
            user = User.objects.filter(username__iexact=str(username_value).strip()).first()
            if user:
                return user

        return None

    @staticmethod
    def _find_procedure_template(value: Any):
        if not value:
            return None

        raw = str(value).strip()
        if raw.isdigit():
            return MaintenanceProcedure.objects.filter(id=int(raw)).first()

        return MaintenanceProcedure.objects.filter(name__iexact=raw).first()
