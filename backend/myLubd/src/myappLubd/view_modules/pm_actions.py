import logging
from calendar import monthrange
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import MaintenanceChecklist, MaintenanceHistory
from ..serializers import (
    InventoryUsageSerializer,
    PreventiveMaintenanceCompleteSerializer,
    PreventiveMaintenanceDetailSerializer,
)
from ..services import PreventiveMaintenanceService
from .inventory_support import consume_inventory_items


logger = logging.getLogger(__name__)


class PreventiveMaintenanceActionMixin:
    
        @action(detail=True, methods=['post'])
        def complete(self, request, pm_id=None):
            """
            Mark a preventive maintenance task as completed
            """
            instance = self.get_object()
            if instance.completed_date:
                return Response(
                    {'detail': 'This maintenance task is already completed.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            completed_date = request.data.get('completed_date')
            if completed_date:
                from django.utils.dateparse import parse_datetime
    
                parsed_date = parse_datetime(str(completed_date))
                if parsed_date:
                    completed_date = parsed_date
    
            checklist_updates = request.data.get('checklist_items') or request.data.get('checklist') or []
            inventory_usage = request.data.get('inventory_usage') or request.data.get('parts_used') or []
    
            with transaction.atomic():
                update_fields = []
                if 'after_image' in request.FILES:
                    instance.after_image = request.FILES['after_image']
                    update_fields.append('after_image')
    
                for raw_item in checklist_updates:
                    item_text = (raw_item.get('item') or raw_item.get('title') or '').strip()
                    if not item_text:
                        continue
                    checklist_item = None
                    item_id = raw_item.get('id')
                    if item_id:
                        checklist_item = instance.checklists.filter(id=item_id).first()
                    if checklist_item is None:
                        checklist_item = instance.checklists.filter(item__iexact=item_text).first()
                    if checklist_item is None:
                        checklist_item = MaintenanceChecklist.objects.create(
                            maintenance=instance,
                            item=item_text[:200],
                            description=raw_item.get('description') or '',
                            order=raw_item.get('order') or instance.checklists.count() + 1,
                        )
    
                    is_completed = bool(raw_item.get('is_completed', raw_item.get('completed', True)))
                    checklist_item.is_completed = is_completed
                    if is_completed:
                        checklist_item.completed_by = request.user
                        checklist_item.completed_at = timezone.now()
                    checklist_item.save(update_fields=['is_completed', 'completed_by', 'completed_at'])
    
                usage_records = consume_inventory_items(
                    user=request.user,
                    items=inventory_usage,
                    preventive_maintenance=instance,
                    source='preventive_maintenance',
                )
    
                result = PreventiveMaintenanceService.update_status(
                    maintenance=instance,
                    new_status='completed',
                    user=request.user,
                    completed_date=completed_date,
                )
    
                if update_fields:
                    result['current'].save(update_fields=update_fields)
    
                if instance.machines.exists():
                    instance.machines.update(last_maintenance_date=result['current'].completed_date or timezone.now())
    
                MaintenanceHistory.objects.create(
                    maintenance=result['current'],
                    action='completed',
                    notes=request.data.get('completion_notes') or request.data.get('notes') or '',
                    performed_by=request.user,
                )
    
            response_data = PreventiveMaintenanceDetailSerializer(
                result['current'],
                context={'request': request},
            ).data
            response_data['inventory_usage'] = InventoryUsageSerializer(
                usage_records,
                many=True,
                context={'request': request},
            ).data
    
            if result['next_schedule']:
                response_data['next_schedule_pm_id'] = result['next_schedule'].pm_id
                response_data['next_schedule_scheduled_date'] = result['next_schedule'].scheduled_date
    
            return Response(response_data)
    
        def _calculate_next_due_date(self, instance, reference_date):
            """
            Calculate the next scheduled date based on the maintenance frequency and completion date.
            Uses calendar-aware calculations for monthly/quarterly/annual frequencies.
            """
            frequency = instance.frequency
            logger.info(f"[PM Complete] Calculating next due date for PM {instance.pm_id}: frequency={frequency}, reference_date={reference_date}")
            
            if frequency == 'custom' and instance.custom_days:
                next_date = reference_date + timedelta(days=instance.custom_days)
                logger.info(f"[PM Complete] Custom frequency: {instance.custom_days} days -> next_date={next_date}")
                return next_date
            
            if frequency == 'daily':
                next_date = reference_date + timedelta(days=1)
            elif frequency == 'weekly':
                next_date = reference_date + timedelta(weeks=1)
            elif frequency == 'biweekly':
                next_date = reference_date + timedelta(weeks=2)
            elif frequency == 'monthly':
                # Add one calendar month
                month = reference_date.month + 1
                year = reference_date.year
                if month > 12:
                    month = 1
                    year += 1
                # Handle different month lengths (e.g., Jan 31 -> Feb 28/29)
                day = min(reference_date.day, monthrange(year, month)[1])
                next_date = reference_date.replace(year=year, month=month, day=day)
            elif frequency == 'quarterly':
                # Add three calendar months
                month = reference_date.month + 3
                year = reference_date.year
                if month > 12:
                    month -= 12
                    year += 1
                day = min(reference_date.day, monthrange(year, month)[1])
                next_date = reference_date.replace(year=year, month=month, day=day)
            elif frequency == 'semi_annual':
                # Add six calendar months
                month = reference_date.month + 6
                year = reference_date.year
                if month > 12:
                    month -= 12
                    year += 1
                day = min(reference_date.day, monthrange(year, month)[1])
                next_date = reference_date.replace(year=year, month=month, day=day)
            elif frequency == 'annual':
                # Add one calendar year
                next_date = reference_date.replace(year=reference_date.year + 1)
            else:
                # Default to monthly if frequency not recognized
                month = reference_date.month + 1
                year = reference_date.year
                if month > 12:
                    month = 1
                    year += 1
                day = min(reference_date.day, monthrange(year, month)[1])
                next_date = reference_date.replace(year=year, month=month, day=day)
            
            logger.info(f"[PM Complete] Calculated next scheduled date: {next_date} (from {reference_date} with frequency {frequency})")
            return next_date
    
        @action(detail=True, methods=['post'])
        def change_status(self, request, pm_id=None):
            """
            Update the status of a preventive maintenance task with validation.
            """
            instance = self.get_object()
            new_status = request.data.get('status')
            completed_date = request.data.get('completed_date')
    
            if not new_status:
                return Response(
                    {'detail': 'Status is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            parsed_completed_date = None
            if completed_date:
                from django.utils.dateparse import parse_datetime
    
                parsed_completed_date = parse_datetime(str(completed_date))
                if not parsed_completed_date:
                    return Response(
                        {'detail': 'Completed Date must be a valid datetime.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
    
            try:
                result = PreventiveMaintenanceService.update_status(
                    maintenance=instance,
                    new_status=new_status,
                    user=request.user,
                    completed_date=parsed_completed_date,
                )
            except Exception as exc:
                return Response(
                    {'detail': str(exc)},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            response_data = PreventiveMaintenanceDetailSerializer(
                result['current'],
                context={'request': request},
            ).data
    
            if result['next_schedule']:
                response_data['next_schedule_pm_id'] = result['next_schedule'].pm_id
                response_data['next_schedule_scheduled_date'] = result['next_schedule'].scheduled_date
    
            return Response(response_data)
    
        @action(detail=False, methods=['post'])
        def import_csv(self, request):
            """
            Import preventive maintenance records from a CSV file.
            """
            upload = request.FILES.get('file')
            if not upload:
                return Response(
                    {'detail': 'CSV file is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            try:
                content = upload.read().decode('utf-8-sig')
            except UnicodeDecodeError:
                return Response(
                    {'detail': 'Unable to decode CSV. Please upload a UTF-8 encoded file.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            result = PreventiveMaintenanceService.import_from_csv_content(
                content,
                default_user=request.user,
            )
    
            return Response(result, status=status.HTTP_200_OK)
    
        @action(detail=True, methods=['post'])
        def upload_images(self, request, pm_id=None):
            """
            Upload images for a preventive maintenance task
            """
            instance = self.get_object()
            updated = False
    
            if 'before_image' in request.FILES:
                instance.before_image = request.FILES['before_image']
                updated = True
    
            if 'after_image' in request.FILES:
                instance.after_image = request.FILES['after_image']
                updated = True
    
            if not updated:
                return Response(
                    {'detail': 'No images provided. Use "before_image" or "after_image" fields.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            instance.updated_by = request.user
            instance.save()
            serializer = PreventiveMaintenanceDetailSerializer(instance, context={'request': request})
            return Response(serializer.data)
    
        @action(detail=True, methods=['post'])
        def reschedule(self, request, pm_id=None):
            """
            Reschedule a maintenance task
            """
            instance = self.get_object()
            if instance.completed_date:
                return Response(
                    {'detail': 'Cannot reschedule a completed task.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            if 'scheduled_date' not in request.data:
                return Response(
                    {'detail': 'Scheduled date must be provided.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            instance.scheduled_date = request.data['scheduled_date']
            if 'reason' in request.data:
                instance.notes = (instance.notes or "") + f"\n[{timezone.now().strftime('%Y-%m-%d %H:%M')}] Rescheduled: {request.data['reason']}"
    
            instance.updated_by = request.user
            instance.save()
            serializer = PreventiveMaintenanceDetailSerializer(instance, context={'request': request})
            return Response(serializer.data)
