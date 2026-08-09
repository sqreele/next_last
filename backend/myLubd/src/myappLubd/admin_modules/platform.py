from django import forms
from django.contrib import admin

from ..models import (
    Area,
    JobComment,
    SubscriptionPlan,
    Tenant,
    TenantMembership,
    TenantSubscription,
    UsageMetric,
)
from ..timezones import timezone_choices


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['id', 'name', 'property', 'is_active', 'created_at', 'updated_at']
    list_filter = ['is_active', 'property', 'created_at']
    search_fields = ['name', 'description', 'property__name', 'property__property_id']
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['property']
    actions = ['activate_areas', 'deactivate_areas']

    def activate_areas(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"{updated} areas activated.")
    activate_areas.short_description = "Activate selected areas"

    def deactivate_areas(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f"{updated} areas deactivated.")
    deactivate_areas.short_description = "Deactivate selected areas"


@admin.register(JobComment)
class JobCommentAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['id', 'job', 'author', 'short_comment', 'created_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['comment', 'job__job_id', 'author__username']
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['job', 'author']

    def short_comment(self, obj):
        text = (obj.comment or '').strip()
        return (text[:60] + '…') if len(text) > 60 else text
    short_comment.short_description = 'Comment'


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    class TenantAdminForm(forms.ModelForm):
        timezone = forms.ChoiceField(choices=timezone_choices)

        class Meta:
            model = Tenant
            fields = '__all__'

    form = TenantAdminForm
    list_per_page = 25
    list_display = ['tenant_id', 'name', 'status', 'timezone', 'owner', 'billing_email', 'created_at']
    list_filter = ['status', 'timezone', 'created_at']
    search_fields = ['tenant_id', 'name', 'slug', 'billing_email', 'owner__username', 'owner__email']
    readonly_fields = ['tenant_id', 'created_at', 'updated_at']
    autocomplete_fields = ['owner']


@admin.register(TenantMembership)
class TenantMembershipAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['tenant', 'user', 'role', 'is_active', 'created_at']
    list_filter = ['role', 'is_active', 'tenant']
    search_fields = ['tenant__name', 'user__username', 'user__email']
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['tenant', 'user', 'properties', 'invited_by']


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['code', 'name', 'monthly_price', 'max_properties', 'max_users', 'is_active', 'sort_order']
    list_filter = ['is_active', 'billing_interval', 'allow_offline_mode', 'allow_advanced_analytics']
    search_fields = ['code', 'name', 'description']


@admin.register(TenantSubscription)
class TenantSubscriptionAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['tenant', 'plan', 'status', 'current_period_end', 'cancel_at_period_end']
    list_filter = ['status', 'plan', 'cancel_at_period_end']
    search_fields = ['tenant__name', 'tenant__tenant_id', 'external_customer_id', 'external_subscription_id']
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['tenant', 'plan']


@admin.register(UsageMetric)
class UsageMetricAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['tenant', 'period_start', 'period_end', 'property_count', 'active_user_count', 'work_order_count']
    list_filter = ['period_start', 'period_end']
    search_fields = ['tenant__name', 'tenant__tenant_id']
    readonly_fields = ['calculated_at']
    autocomplete_fields = ['tenant']
