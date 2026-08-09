from django.db import transaction
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError

from ..models import Inventory, InventoryUsage, Property
from ..tenancy import get_accessible_properties

def _job_property_ids(job):
    return set(
        Property.objects.filter(
            Q(rooms__jobs=job) | Q(areas__jobs=job)
        ).values_list('id', flat=True)
    )


def _pm_property_ids(pm):
    property_q = Q(machines__preventive_maintenances=pm)
    if pm.job_id:
        property_q |= Q(rooms__jobs=pm.job)
    return set(Property.objects.filter(property_q).values_list('id', flat=True))


def _ensure_user_can_use_property(user, property_obj):
    if user.is_staff or user.is_superuser:
        return
    if not get_accessible_properties(user).filter(id=property_obj.id).exists():
        raise PermissionDenied("You do not have access to this property's inventory.")


def consume_inventory_items(*, user, items, job=None, preventive_maintenance=None, source='manual'):
    """Consume inventory in a transaction and return usage ledger rows."""
    if not items:
        return []
    if job is not None and preventive_maintenance is not None:
        raise ValidationError("Inventory usage can be linked to a job or PM, not both.")

    usage_records = []
    with transaction.atomic():
        for raw_item in items:
            item_id = raw_item.get('item_id') or raw_item.get('inventory') or raw_item.get('inventory_item_id')
            quantity = int(raw_item.get('quantity') or 0)
            if not item_id:
                raise ValidationError({'inventory_usage': 'item_id is required for each consumed inventory item.'})
            if quantity <= 0:
                raise ValidationError({'inventory_usage': 'quantity must be greater than zero.'})

            inventory = (
                Inventory.objects.select_for_update()
                .filter(Q(item_id__iexact=str(item_id)) | Q(id=item_id if str(item_id).isdigit() else None))
                .first()
            )
            if inventory is None:
                raise ValidationError({'inventory_usage': f'Inventory item not found: {item_id}'})
            if inventory.property is None:
                raise ValidationError({'inventory_usage': f'Inventory item {inventory.item_id} is not assigned to a property.'})

            _ensure_user_can_use_property(user, inventory.property)
            job_property_ids = _job_property_ids(job) if job is not None else set()
            pm_property_ids = _pm_property_ids(preventive_maintenance) if preventive_maintenance is not None else set()

            if job is not None and job_property_ids and inventory.property_id not in job_property_ids:
                raise ValidationError({'inventory_usage': f'{inventory.item_id} does not belong to the job property.'})
            if preventive_maintenance is not None and pm_property_ids and inventory.property_id not in pm_property_ids:
                raise ValidationError({'inventory_usage': f'{inventory.item_id} does not belong to the PM property.'})
            if inventory.quantity < quantity:
                raise ValidationError({
                    'inventory_usage': f'Insufficient stock for {inventory.item_id}: {inventory.quantity} available, {quantity} requested.'
                })

            inventory.quantity -= quantity
            inventory.save(update_fields=['quantity', 'status', 'updated_at'])
            if job is not None:
                inventory.jobs.add(job)
            if preventive_maintenance is not None:
                inventory.preventive_maintenances.add(preventive_maintenance)

            usage_records.append(InventoryUsage.objects.create(
                inventory=inventory,
                job=job,
                preventive_maintenance=preventive_maintenance,
                property=inventory.property,
                quantity=quantity,
                unit_cost=raw_item.get('unit_cost') if raw_item.get('unit_cost') not in ('', None) else inventory.unit_price,
                source=source,
                notes=raw_item.get('notes') or '',
                consumed_by=user,
            ))
    return usage_records
