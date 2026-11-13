"""A persistent property selection shared by all registered admin models."""
from django.contrib.admin import AdminSite, ModelAdmin
from django.core.exceptions import FieldDoesNotExist
from django.http import HttpResponseBadRequest, HttpResponseRedirect
from django.urls import Resolver404, path, resolve, reverse
from django.views.decorators.http import require_POST

from .tenancy import get_accessible_properties


SESSION_KEY = 'admin_property_pk'


def selected_property(request):
    if not hasattr(request, 'session'):
        return None
    if not hasattr(request, '_admin_selected_property'):
        value = request.session.get(SESSION_KEY)
        # Session values can outlive a user's property grants or the property.
        request._admin_selected_property = (
            get_accessible_properties(request.user).filter(pk=value).first()
            if value else None
        )
        if value and request._admin_selected_property is None:
            request.session.pop(SESSION_KEY, None)
    return request._admin_selected_property


def property_lookup(model):
    """Use ownership relationships, never legacy text property identifiers."""
    if model._meta.label_lower.lower() == 'myapplubd.property':
        return 'pk'
    indirect = {
        'preventivemaintenance': 'job__property',
        'preventivemaintenanceimage': 'preventive_maintenance__job__property',
        'pmmasterplan': 'machines__property',
        'jobimage': 'job__property',
        'jobcomment': 'job__property',
        'jobdocument': 'job__property',
        'maintenancetaskimage': 'task__property',
        'maintenancechecklist': 'maintenance__job__property',
        'maintenancehistory': 'maintenance__job__property',
        'maintenanceschedule': 'maintenance__job__property',
    }
    if model._meta.app_label == 'myappLubd' and model._meta.model_name in indirect:
        return indirect[model._meta.model_name]
    for name in ('property', 'properties'):
        try:
            field = model._meta.get_field(name)
        except FieldDoesNotExist:
            continue
        if field.is_relation and field.related_model._meta.label_lower.lower() == 'myapplubd.property':
            return name
    # Shared configuration and platform records have no property owner.
    return None


def filter_selected_property(queryset, request):
    lookup = property_lookup(queryset.model)
    if lookup:
        property_obj = selected_property(request)
        if property_obj is not None:
            pm_relationships = {
                'preventivemaintenance': 'pk',
                'preventivemaintenanceimage': 'preventive_maintenance',
                'maintenancechecklist': 'maintenance',
                'maintenancehistory': 'maintenance',
                'maintenanceschedule': 'maintenance',
            }
            pm_lookup = pm_relationships.get(queryset.model._meta.model_name)
            if queryset.model._meta.app_label == 'myappLubd' and pm_lookup:
                from .pm_access import canonical_pm_queryset
                maintenance = canonical_pm_queryset(request.user, property_obj.property_id)
                return queryset.filter(**{f'{pm_lookup}__in': maintenance.values('pk')})
            return queryset.filter(**{lookup: property_obj.pk}).distinct()
    return queryset


class SelectedPropertyAdminMixin:
    def get_queryset(self, request):
        return filter_selected_property(super().get_queryset(request), request)

    def get_form(self, request, obj=None, **kwargs):
        base_form = super().get_form(request, obj, **kwargs)

        class PropertySelectedForm(base_form):
            def __init__(self, *args, **form_kwargs):
                super().__init__(*args, **form_kwargs)
                # Domain forms may replace relation choices during initialization.
                for field in self.fields.values():
                    if getattr(field, 'queryset', None) is not None:
                        field.queryset = filter_selected_property(field.queryset, request)

        return PropertySelectedForm

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        field = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if field is not None and field.queryset is not None:
            field.queryset = filter_selected_property(field.queryset, request)
        return field

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        field = super().formfield_for_manytomany(db_field, request, **kwargs)
        if field is not None and field.queryset is not None:
            field.queryset = filter_selected_property(field.queryset, request)
        return field

    def get_changeform_initial_data(self, request):
        initial = super().get_changeform_initial_data(request)
        if property_lookup(self.model) == 'property':
            property_obj = selected_property(request)
            if property_obj is not None:
                initial['property'] = property_obj.pk
        return initial


class PropertyAdminSite(AdminSite):
    def register(self, model_or_iterable, admin_class=None, **options):
        admin_class = admin_class or ModelAdmin
        scoped_class = type(
            admin_class.__name__, (SelectedPropertyAdminMixin, admin_class),
            {'__module__': admin_class.__module__},
        )
        return super().register(model_or_iterable, scoped_class, **options)

    def get_urls(self):
        return [
            path('select-property/', self.admin_view(require_POST(self.select_property)),
                 name='select_property'),
        ] + super().get_urls()

    def each_context(self, request):
        context = super().each_context(request)
        if self.has_permission(request):
            context.update(
                available_admin_properties=get_accessible_properties(request.user).order_by('name', 'pk'),
                selected_admin_property=selected_property(request),
            )
        return context

    def select_property(self, request):
        value = request.POST.get('property', '')
        if value:
            # Validate against the same authorization source as the rest of admin.
            try:
                property_obj = get_accessible_properties(request.user).filter(pk=value).first()
            except (ValueError, TypeError):
                property_obj = None
            if property_obj is None:
                return HttpResponseBadRequest('Choose an available property.')
            request.session[SESSION_KEY] = property_obj.pk
        else:
            request.session.pop(SESSION_KEY, None)
        destination = reverse('admin:index', current_app=self.name)
        candidate = request.POST.get('next', '')
        # Switching from an object page returns home; list pages keep their model.
        if candidate.startswith('/') and not candidate.startswith('//'):
            try:
                match = resolve(candidate)
                if match.namespace == self.name and match.url_name.endswith('_changelist'):
                    destination = candidate
            except Resolver404:
                pass
        return HttpResponseRedirect(destination)
