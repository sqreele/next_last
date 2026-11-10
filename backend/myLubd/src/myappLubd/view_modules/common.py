"""Common definitions."""
from django.contrib.auth import get_user_model
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Count, Q, Exists, OuterRef
from django.db import transaction
from ..models import Property, PreventiveMaintenance, Machine, Inventory, InventoryUsage
from rest_framework.pagination import PageNumberPagination
import logging
from ..tenancy import restrict_pm_for_company_technicians, accessible_property_ids, get_job_reassignable_properties, get_operable_properties, TENANT_OPERATOR_ROLES, TENANT_WIDE_PROPERTY_ROLES, user_can_consume_inventory

User = get_user_model()

logger = logging.getLogger('myappLubd.views')


class IsPlatformSuperuser(BasePermission):
    """Restrict mutations of globally shared resources to break-glass users."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


RAW_AUTH_PREFIXES = ('google-oauth2_', 'auth0_', 'auth0|')


def is_raw_auth_identifier(value):
    if value is None:
        return False
    text = str(value).strip()
    return (
        text.startswith(RAW_AUTH_PREFIXES)
        or text.lower() in {'null', 'undefined', '[object object]'}
    )


def display_name_from_user_values(first_name='', last_name='', email='', username='', fallback='Unknown Technician'):
    full_name = f"{first_name or ''} {last_name or ''}".strip()
    for candidate in (full_name, email, username):
        value = str(candidate or '').strip()
        if value and not is_raw_auth_identifier(value):
            return value
    return fallback


def display_name_from_user(user, fallback='Unknown Technician'):
    if not user:
        return fallback

    profile = getattr(user, 'userprofile', None)
    profile_full_name = getattr(profile, 'full_name', None)
    full_name = user.get_full_name().strip() if hasattr(user, 'get_full_name') else ''
    for candidate in (
        profile_full_name,
        full_name,
        getattr(user, 'email', None),
        getattr(user, 'username', None),
    ):
        value = str(candidate or '').strip()
        if value and not is_raw_auth_identifier(value):
            return value
    return fallback


def _job_property_ids(job):
    return {job.property_id} if job is not None and job.property_id else set()


def _pm_property_ids(pm):
    property_q = Q(machines__preventive_maintenances=pm)
    if pm.job_id:
        property_q |= Q(jobs=pm.job)
    return set(Property.objects.filter(property_q).values_list('id', flat=True))


def _ensure_user_can_use_property(user, property_obj):
    if user.is_superuser:
        return
    if not get_operable_properties(user).filter(id=property_obj.id).exists():
        raise PermissionDenied("Your role cannot modify data for this property.")


def _ensure_user_can_operate_property(user, property_obj):
    """Canonical write gate for Property-owned operational resources."""
    if property_obj is None:
        raise ValidationError({'property': 'Property must be provided.'})
    if user.is_superuser:
        return
    if not get_operable_properties(user).filter(pk=property_obj.pk).exists():
        raise PermissionDenied("Your role cannot modify data for this property.")


def _ensure_user_can_reassign_job(user, job):
    """Enforce the narrower role and canonical Property scope for reassignment."""
    property_obj = getattr(job, 'property', None)
    if property_obj is None:
        raise ValidationError({'property': 'Job must have a canonical Property.'})
    if user.is_superuser:
        return
    if not get_job_reassignable_properties(user).filter(pk=property_obj.pk).exists():
        raise PermissionDenied("Your role cannot reassign jobs for this property.")


def _job_assignment_candidates(property_obj):
    """Active users whose canonical membership can operate one Property."""
    if property_obj is None or property_obj.tenant_id is None:
        return User.objects.none()

    operator_roles = TENANT_OPERATOR_ROLES
    tenant_wide_operator_roles = TENANT_WIDE_PROPERTY_ROLES & operator_roles
    return User.objects.filter(
        Q(
            tenant_memberships__tenant_id=property_obj.tenant_id,
            tenant_memberships__is_active=True,
            tenant_memberships__role__in=tenant_wide_operator_roles,
        )
        | Q(
            tenant_memberships__tenant_id=property_obj.tenant_id,
            tenant_memberships__is_active=True,
            tenant_memberships__role__in=operator_roles,
            tenant_memberships__properties=property_obj,
        ),
        is_active=True,
    ).distinct().order_by('first_name', 'last_name', 'username', 'pk')


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
            if not user_can_consume_inventory(user, inventory.property):
                raise PermissionDenied('Your role cannot consume inventory for this property.')
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


class MaintenancePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    page_query_param = 'page'  # Explicitly set page query param name
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page.paginator.per_page
        logger.info(f"[Pagination] Page: {self.page.number}, Page Size: {page_size}, Total: {self.page.paginator.count}, Total Pages: {self.page.paginator.num_pages}")
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': page_size,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        })


def canonical_pm_queryset(user, property_filter=None):
    """Return PM rows with one canonical property and TenantMembership scope."""
    job_machine_conflict = Machine.objects.filter(
        preventive_maintenances=OuterRef('pk')
    ).exclude(property_id=OuterRef('job__property_id'))

    queryset = PreventiveMaintenance.objects.select_related(
        'job__property',
        'created_by',
        'completed_by',
        'verified_by',
        'assigned_to',
        'procedure_template',
    ).prefetch_related(
        'topics',
        'machines',
        'machines__property',
        'job__rooms',
        'images__uploaded_by',
    ).annotate(
        machine_property_count=Count('machines__property_id', distinct=True),
        has_job_machine_conflict=Exists(job_machine_conflict),
    ).filter(
        machine_property_count__lte=1,
    ).filter(
        Q(job__isnull=True) | Q(has_job_machine_conflict=False),
    ).filter(
        Q(job__property__isnull=False) | Q(machine_property_count=1),
    )

    if not user.is_superuser:
        property_ids = accessible_property_ids(user)
        inaccessible_machines = Machine.objects.filter(
            preventive_maintenances=OuterRef('pk')
        ).exclude(property_id__in=property_ids)
        queryset = queryset.annotate(
            has_inaccessible_machine=Exists(inaccessible_machines)
        ).filter(
            has_inaccessible_machine=False,
        ).filter(
            Q(job__isnull=True) | Q(job__property_id__in=property_ids)
        ).filter(
            Q(job__property_id__in=property_ids) | Q(machines__property_id__in=property_ids)
        )

    if property_filter:
        machines_outside_property = Machine.objects.filter(
            preventive_maintenances=OuterRef('pk')
        ).exclude(property__property_id=property_filter)
        queryset = queryset.annotate(
            has_machine_outside_property=Exists(machines_outside_property)
        ).filter(
            has_machine_outside_property=False,
        ).filter(
            Q(job__isnull=True) | Q(job__property__property_id=property_filter)
        ).filter(
            Q(job__property__property_id=property_filter)
            | Q(machines__property__property_id=property_filter)
        )

    return restrict_pm_for_company_technicians(queryset, user)
