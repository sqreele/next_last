"""Admin policies for property-owned templates and operational records."""
from django.contrib import admin

from ..pm_access import canonical_pm_queryset
from ..tenancy import get_accessible_properties, get_accessible_machines, get_accessible_jobs


def operational_queryset(model, user):
    """Return authorized rows for operational relationships used by admin forms."""
    from django.db.models import Count
    from .. import models
    if model is models.Property:
        return get_accessible_properties(user)
    if model is models.Machine:
        return get_accessible_machines(user)
    if model is models.Job:
        return get_accessible_jobs(user)
    if model is models.DeletedJob:
        return get_accessible_jobs(user, queryset=model.objects.all())
    if model is models.PreventiveMaintenance:
        return canonical_pm_queryset(user)
    if model is models.PMMasterPlan:
        return models.PMMasterPlan.objects.annotate(
            scope_property_count=Count('machines__property_id', distinct=True),
        ).filter(scope_property_count=1, machines__property__in=get_accessible_properties(user)).distinct()
    if model in (models.Room, models.Area, models.Inventory, models.InventoryUsage,
                 models.UtilityConsumption, models.WorkspaceReport, models.MaintenanceProcedure):
        return model.objects.filter(property__in=get_accessible_properties(user))
    if model in (models.JobImage, models.JobComment, models.JobDocument):
        return model.objects.filter(job__in=get_accessible_jobs(user))
    if model in (models.MaintenanceChecklist, models.MaintenanceHistory, models.MaintenanceSchedule):
        return model.objects.filter(maintenance__in=canonical_pm_queryset(user))
    if model is models.MaintenanceTaskImage:
        return model.objects.filter(task__property__in=get_accessible_properties(user))
    return None


class OperationalPropertyAdminMixin:
    """Apply property scope to lists, exports, object lookup and relationship inputs."""

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        if request.user.is_superuser:
            return queryset
        accessible = operational_queryset(self.model, request.user)
        if accessible is None:
            raise ValueError(f'Missing admin property scope for {self.model.__name__}')
        return queryset.filter(pk__in=accessible.values('pk'))

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if not request.user.is_superuser:
            queryset = operational_queryset(db_field.remote_field.model, request.user)
            if queryset is not None:
                kwargs['queryset'] = kwargs['queryset'].filter(pk__in=queryset.values('pk')) if 'queryset' in kwargs else queryset
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        if not request.user.is_superuser:
            queryset = operational_queryset(db_field.remote_field.model, request.user)
            if queryset is not None:
                kwargs['queryset'] = kwargs['queryset'].filter(pk__in=queryset.values('pk')) if 'queryset' in kwargs else queryset
        return super().formfield_for_manytomany(db_field, request, **kwargs)

    def get_list_filter(self, request):
        filters = super().get_list_filter(request)
        if request.user.is_superuser:
            return filters
        scoped = []
        for entry in filters:
            if isinstance(entry, str) and '__' not in entry and self.model._meta.get_field(entry).is_relation:
                entry = (entry, admin.RelatedOnlyFieldListFilter)
            scoped.append(entry)
        return scoped


class MaintenanceChildAdminMixin(OperationalPropertyAdminMixin):
    """Scope PM child rows and their selectable maintenance relationship."""
