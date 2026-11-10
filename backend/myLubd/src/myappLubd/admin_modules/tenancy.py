"""Tenancy definitions."""
from django.contrib import admin
from django.utils import timezone
from django.db import transaction
from django import forms
from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from ..timezones import timezone_choices
from django.conf import settings
from ..models import AuthIdentity, Tenant, TenantMembership, PlatformMembership, SubscriptionPlan, TenantSubscription, TenantInvitation, LineGroupPairing, BillingWebhookEvent, BillingIssuerSettings, UsageMetric
from ..tenancy import SubscriptionUserLimitReached, enforce_tenant_user_limit, get_billing_tenants, get_tenant_user_capacity, get_user_tenants, lock_tenants_for_membership_change, user_can_access_billing
from .locations import PropertyAdmin


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    def has_delete_permission(self, request, obj=None):
        return False
    class TenantAdminForm(forms.ModelForm):
        timezone = forms.ChoiceField(choices=timezone_choices)

        class Meta:
            model = Tenant
            fields = '__all__'

    form = TenantAdminForm
    list_per_page = 25
    list_display = ['name', 'status', 'timezone', 'owner', 'billing_email', 'created_at']
    list_filter = ['status', 'timezone', 'created_at']
    search_fields = ['tenant_id', 'name', 'slug', 'billing_email', 'owner__username', 'owner__email']
    readonly_fields = ['tenant_id', 'created_at', 'updated_at']
    autocomplete_fields = ['owner']
    list_select_related = ['owner']

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        if request.user.is_superuser:
            return queryset
        return queryset.filter(pk__in=get_user_tenants(request.user))

    def get_list_display(self, request):
        fields = list(super().get_list_display(request))
        if not user_can_access_billing(request.user):
            fields = [field for field in fields if field not in {'status', 'billing_email'}]
        return fields

    def get_list_filter(self, request):
        fields = list(super().get_list_filter(request))
        if not user_can_access_billing(request.user):
            fields = [field for field in fields if field != 'status']
        return fields

    def get_search_fields(self, request):
        fields = list(super().get_search_fields(request))
        if not user_can_access_billing(request.user):
            fields = [field for field in fields if field != 'billing_email']
        return fields

    def get_exclude(self, request, obj=None):
        fields = list(super().get_exclude(request, obj) or [])
        if not user_can_access_billing(request.user):
            fields.extend(['status', 'billing_email'])
        return fields


@admin.register(AuthIdentity)
class AuthIdentityAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['user_display', 'email_display', 'issuer', 'created_at', 'last_seen_at']
    list_filter = ['issuer', 'created_at', 'last_seen_at']
    search_fields = ['user__username', 'user__email', 'email_at_link', 'issuer', 'subject']
    readonly_fields = ['user', 'issuer', 'subject', 'email_at_link', 'created_at', 'last_seen_at']
    ordering = ['-last_seen_at']
    list_select_related = ['user']
    fieldsets = (
        ('Linked user', {'fields': ('user', 'email_at_link')}),
        ('Provider identity', {
            'classes': ('collapse',),
            'fields': ('issuer', 'subject'),
        }),
        ('Activity', {'fields': ('created_at', 'last_seen_at')}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')

    @admin.display(description='User', ordering='user__email')
    def user_display(self, obj):
        return obj.user.get_human_display_name() or obj.subject

    @admin.display(description='Email', ordering='user__email')
    def email_display(self, obj):
        return obj.user.email or '—'

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class TenantMembershipAdminForm(forms.ModelForm):
    class Meta:
        model = TenantMembership
        fields = '__all__'

    def clean(self):
        cleaned = super().clean()
        tenant = cleaned.get('tenant')
        is_active = cleaned.get('is_active')
        properties = cleaned.get('properties') or []
        if tenant is not None and any(
            prop.tenant_id != tenant.pk for prop in properties
        ):
            self.add_error(
                'properties',
                'Every property grant must belong to the membership tenant.',
            )
        if tenant is None or not is_active:
            return cleaned
        existing = None
        if self.instance.pk:
            existing = TenantMembership.objects.filter(pk=self.instance.pk).values(
                'tenant_id', 'is_active',
            ).first()
        increases_active_count = existing is None or (
            not existing['is_active'] or existing['tenant_id'] != tenant.pk
        )
        if increases_active_count:
            capacity = get_tenant_user_capacity(tenant)
            if not capacity.can_add:
                self.add_error(
                    'is_active',
                    f'Your current plan allows up to {capacity.limit} users.',
                )
        return cleaned


@admin.register(TenantMembership)
class TenantMembershipAdmin(admin.ModelAdmin):
    form = TenantMembershipAdminForm
    list_per_page = 25
    list_display = ['user', 'email_display', 'tenant', 'role', 'properties_display', 'is_active', 'created_at', 'updated_at']
    list_filter = ['tenant', 'role', 'is_active', ('properties', admin.RelatedOnlyFieldListFilter)]
    search_fields = ['tenant__name', 'user__username', 'user__email']
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['tenant', 'user', 'properties', 'invited_by']
    list_select_related = ['user', 'tenant']
    fieldsets = (
        ('Membership', {'fields': ('user', 'tenant', 'role', 'is_active')}),
        ('Property access', {
            'fields': ('properties',),
            'description': 'Optional property-level grants within this tenant.',
        }),
        ('Invitation', {'fields': ('invited_by',)}),
        ('Timestamps', {
            'classes': ('collapse',),
            'fields': ('created_at', 'updated_at'),
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'tenant').prefetch_related('properties')

    @admin.display(description='Email', ordering='user__email')
    def email_display(self, obj):
        return obj.user.email or '—'

    @admin.display(description='Properties')
    def properties_display(self, obj):
        names = [property_obj.name for property_obj in obj.properties.all()]
        return ', '.join(names) or 'No property grants'

    def save_model(self, request, obj, form, change):
        existing_snapshot = None
        if change:
            existing_snapshot = TenantMembership.objects.filter(pk=obj.pk).values(
                'tenant_id', 'is_active',
            ).first()
        with transaction.atomic():
            source_tenant_id = (
                existing_snapshot['tenant_id'] if existing_snapshot is not None else None
            )
            locked_tenants = lock_tenants_for_membership_change(
                source_tenant_id,
                obj.tenant_id,
            )
            locked_tenant = locked_tenants[obj.tenant_id]
            existing = None
            if change:
                existing = TenantMembership.objects.select_for_update().filter(
                    pk=obj.pk,
                ).values('tenant_id', 'is_active').first()
                if existing is None or existing['tenant_id'] != source_tenant_id:
                    raise ValidationError(
                        'Membership tenant changed concurrently; retry the change.'
                    )
            increases_active_count = obj.is_active and (
                existing is None
                or not existing['is_active']
                or existing['tenant_id'] != locked_tenant.pk
            )
            if increases_active_count:
                try:
                    enforce_tenant_user_limit(locked_tenant)
                except SubscriptionUserLimitReached as exc:
                    raise ValidationError(str(exc.detail['detail'])) from exc
            obj.tenant = locked_tenant
            super().save_model(request, obj, form, change)


@admin.register(PlatformMembership)
class PlatformMembershipAdmin(admin.ModelAdmin):
    """Break-glass-only role management until a dedicated platform UI exists."""

    list_per_page = 25
    list_display = ['user', 'role', 'is_active', 'granted_by', 'created_at', 'updated_at']
    list_filter = ['role', 'is_active']
    search_fields = ['user__username', 'user__email', 'granted_by__username']
    list_select_related = ['user', 'granted_by']
    autocomplete_fields = ['user']
    readonly_fields = ['granted_by', 'created_at', 'updated_at']

    def has_module_permission(self, request):
        return bool(request.user.is_superuser)

    def has_view_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def has_add_permission(self, request):
        return bool(request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def save_model(self, request, obj, form, change):
        if not change and obj.granted_by_id is None:
            obj.granted_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['code', 'name', 'monthly_price', 'max_properties', 'max_users', 'is_active', 'sort_order']
    list_filter = ['is_active', 'billing_interval', 'allow_offline_mode', 'allow_advanced_analytics']
    search_fields = ['code', 'name', 'description']

    def has_module_permission(self, request):
        return super().has_module_permission(request) and user_can_access_billing(request.user)

    def has_view_permission(self, request, obj=None):
        return super().has_view_permission(request, obj) and user_can_access_billing(request.user)

    def has_add_permission(self, request):
        return super().has_add_permission(request) and request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return super().has_change_permission(request, obj) and request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return super().has_delete_permission(request, obj) and request.user.is_superuser


@admin.register(TenantSubscription)
class TenantSubscriptionAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = [
        'tenant', 'plan', 'status', 'user_usage', 'property_usage',
        'trial_ends_at', 'grace_period_ends_at', 'cancel_at_period_end',
    ]
    list_filter = ['status', 'plan', 'cancel_at_period_end']
    search_fields = ['tenant__name', 'tenant__tenant_id', 'external_customer_id', 'external_subscription_id']
    platform_authority_fields = [
        'tenant', 'plan', 'status', 'current_period_start',
        'current_period_end', 'trial_ends_at', 'grace_period_ends_at',
        'external_customer_id', 'external_subscription_id',
        'cancel_at_period_end',
    ]
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['tenant', 'plan']
    list_select_related = ['tenant', 'plan']
    fieldsets = (
        ('Subscription', {'fields': ('tenant', 'plan', 'status', 'cancel_at_period_end')}),
        ('Billing period', {
            'fields': ('current_period_start', 'current_period_end', 'trial_ends_at', 'grace_period_ends_at'),
        }),
        ('Provider references', {
            'classes': ('collapse',),
            'fields': ('external_customer_id', 'external_subscription_id'),
        }),
        ('Timestamps', {
            'classes': ('collapse',),
            'fields': ('created_at', 'updated_at'),
        }),
    )

    def has_module_permission(self, request):
        return super().has_module_permission(request) and user_can_access_billing(request.user)

    def has_view_permission(self, request, obj=None):
        tenant = getattr(obj, 'tenant', None) if obj is not None else None
        return super().has_view_permission(request, obj) and user_can_access_billing(
            request.user, tenant
        )

    def get_queryset(self, request):
        queryset = super().get_queryset(request).select_related('tenant', 'plan')
        if not request.user.is_superuser:
            queryset = queryset.filter(tenant__in=get_billing_tenants(request.user))
        return queryset.annotate(
            active_user_count=Count(
                'tenant__memberships',
                filter=Q(tenant__memberships__is_active=True),
                distinct=True,
            ),
            tenant_property_count=Count('tenant__properties', distinct=True),
        )

    @admin.display(description='User usage', ordering='active_user_count')
    def user_usage(self, obj):
        return f'{obj.active_user_count} / {obj.plan.max_users} users'

    @admin.display(description='Property usage', ordering='tenant_property_count')
    def property_usage(self, obj):
        return f'{obj.tenant_property_count} / {obj.plan.max_properties} properties'

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.tenant.billing_model == 'property_quantity_v1':
            return [field.name for field in obj._meta.fields]
        if request.user.is_superuser:
            return self.readonly_fields
        return [*self.readonly_fields, *self.platform_authority_fields]

    def has_add_permission(self, request):
        return bool(request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return False


class InvitationStatusFilter(admin.SimpleListFilter):
    title = 'status'
    parameter_name = 'invitation_status'

    def lookups(self, request, model_admin):
        return (
            ('pending', 'Pending'),
            ('accepted', 'Accepted'),
            ('revoked', 'Revoked'),
            ('expired', 'Expired'),
        )

    def queryset(self, request, queryset):
        unresolved = Q(accepted_at__isnull=True, revoked_at__isnull=True)
        if self.value() == 'pending':
            return queryset.filter(unresolved, expires_at__gt=timezone.now())
        if self.value() == 'accepted':
            return queryset.filter(accepted_at__isnull=False)
        if self.value() == 'revoked':
            return queryset.filter(revoked_at__isnull=False)
        if self.value() == 'expired':
            return queryset.filter(unresolved, expires_at__lte=timezone.now())
        return queryset


@admin.register(TenantInvitation)
class TenantInvitationAdmin(admin.ModelAdmin):
    list_per_page = 25
    empty_value_display = '—'
    list_display = [
        'email', 'tenant', 'role', 'property_count', 'status_display',
        'expires_at', 'invited_by',
    ]
    list_filter = ['tenant', 'role', InvitationStatusFilter, 'created_at']
    search_fields = ['email', 'tenant__name', 'invited_by__email', 'invited_by__username']
    ordering = ['-created_at']
    readonly_fields = [
        'tenant', 'email', 'role', 'invited_by', 'accepted_by', 'properties',
        'expires_at', 'accepted_at', 'revoked_at', 'created_at', 'updated_at',
    ]
    exclude = ['token_hash']
    list_select_related = ['tenant', 'invited_by']
    fieldsets = (
        ('Invitation', {'fields': ('email', 'tenant', 'role', 'properties')}),
        ('Status', {'fields': ('expires_at', 'accepted_at', 'accepted_by', 'revoked_at')}),
        ('Audit', {
            'classes': ('collapse',),
            'fields': ('invited_by', 'created_at', 'updated_at'),
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'tenant', 'invited_by', 'accepted_by',
        ).prefetch_related('properties').annotate(admin_property_count=Count('properties'))

    @admin.display(description='Properties', ordering='admin_property_count')
    def property_count(self, obj):
        return obj.admin_property_count

    @admin.display(description='Status')
    def status_display(self, obj):
        return obj.status.title()

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(LineGroupPairing)
class LineGroupPairingAdmin(admin.ModelAdmin):
    list_per_page = 50
    list_display = [
        'property', 'created_by', 'created_at', 'expires_at', 'used_at',
        'revoked_at', 'safe_destination', 'status_display',
    ]
    list_filter = ['created_at', 'expires_at', 'used_at', 'revoked_at']
    search_fields = ['property__property_id', 'property__name']
    readonly_fields = [
        'property', 'created_by', 'created_at', 'expires_at', 'used_at',
        'revoked_at', 'bound_destination_suffix',
    ]
    exclude = ['token_hash']
    list_select_related = ['property', 'created_by']

    @admin.display(description='Status')
    def status_display(self, obj):
        return 'Active pairing' if obj.status == 'pending' else obj.status.title()

    @admin.display(description='Destination')
    def safe_destination(self, obj):
        return f'***{obj.bound_destination_suffix}' if obj.bound_destination_suffix else '—'

    def get_queryset(self, request):
        queryset = super().get_queryset(request).select_related('property', 'created_by')
        if request.user.is_superuser:
            return queryset
        return queryset.filter(
            property__tenant__memberships__user=request.user,
            property__tenant__memberships__is_active=True,
            property__tenant__memberships__role__in=('owner', 'admin', 'manager'),
        ).distinct()

    def has_module_permission(self, request):
        return bool(
            super().has_module_permission(request)
            and (
                request.user.is_superuser
                or TenantMembership.objects.filter(
                    user=request.user,
                    is_active=True,
                    role__in=('owner', 'admin', 'manager'),
                ).exists()
            )
        )

    def has_view_permission(self, request, obj=None):
        allowed = super().has_view_permission(request, obj)
        if not allowed or request.user.is_superuser:
            return allowed
        if obj is None:
            return TenantMembership.objects.filter(
                user=request.user,
                is_active=True,
                role__in=('owner', 'admin', 'manager'),
            ).exists()
        return PropertyAdmin._can_manage_line(request.user, obj.property)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BillingWebhookEvent)
class BillingWebhookEventAdmin(admin.ModelAdmin):
    list_per_page = 50
    empty_value_display = '—'
    list_display = ['provider', 'event_type', 'status', 'received_at', 'processed_at', 'error_code']
    list_filter = ['provider', 'status', 'event_type', 'received_at']
    search_fields = ['event_id', 'event_type', 'error_code']
    ordering = ['-received_at']
    readonly_fields = [
        'provider', 'event_id', 'event_type', 'status', 'error_code',
        'received_at', 'processed_at',
    ]
    fieldsets = (
        ('Event', {'fields': ('provider', 'event_type', 'event_id')}),
        ('Processing', {'fields': ('status', 'error_code', 'received_at', 'processed_at')}),
    )

    def has_add_permission(self, request):
        return False

    def has_module_permission(self, request):
        return super().has_module_permission(request) and request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return super().has_view_permission(request, obj) and request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(UsageMetric)
class UsageMetricAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['tenant', 'period_start', 'period_end', 'property_count', 'active_user_count', 'work_order_count']
    list_filter = ['period_start', 'period_end']
    search_fields = ['tenant__name', 'tenant__tenant_id']
    readonly_fields = [field.name for field in UsageMetric._meta.fields]
    autocomplete_fields = ['tenant']

    def has_module_permission(self, request):
        return super().has_module_permission(request) and user_can_access_billing(request.user)

    def has_view_permission(self, request, obj=None):
        tenant = getattr(obj, 'tenant', None) if obj is not None else None
        return super().has_view_permission(request, obj) and user_can_access_billing(
            request.user, tenant
        )

    def get_queryset(self, request):
        queryset = super().get_queryset(request).select_related('tenant')
        if request.user.is_superuser:
            return queryset
        return queryset.filter(tenant__in=get_billing_tenants(request.user))

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BillingIssuerSettings)
class BillingIssuerSettingsAdmin(admin.ModelAdmin):
    list_display = ['legal_name', 'email', 'updated_at', 'updated_by']
    readonly_fields = ['updated_at', 'updated_by']
    actions = None
    save_on_top = True
    fieldsets = [
        ('ข้อมูลผู้ออกบิล / Billing issuer', {
            'fields': ['legal_name', 'address', 'tax_id', 'email'],
            'description': (
                'ข้อมูลของผู้ให้บริการ StayMaint สำหรับบิลใหม่ มีผลทันทีหลังบันทึก '
                'บิลและใบเสร็จที่ออกแล้วคงข้อมูลเดิม ผู้ให้บริการไม่ได้จด VAT '
                '/ Applies immediately to new invoices. Existing documents remain unchanged. '
                'The provider is not VAT registered.'
            ),
        }),
        ('ประวัติการแก้ไข / Last update', {'fields': ['updated_at', 'updated_by']}),
    ]

    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        return request.user.is_superuser and not BillingIssuerSettings.objects.exists()

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return False

    def get_changeform_initial_data(self, request):
        initial = super().get_changeform_initial_data(request)
        issuer = getattr(settings, 'BILLING_ISSUER', {}) or {}
        for key in ('legal_name', 'address', 'tax_id', 'email'):
            initial.setdefault(key, issuer.get(key, ''))
        return initial

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)
