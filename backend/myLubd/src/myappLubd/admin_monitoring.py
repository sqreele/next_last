"""Read-only, platform-superuser operational dashboards."""
from datetime import timedelta

from django.contrib import admin
from django.db.models import Count, Q
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from .models import DailySummaryRecipient, EmailDeliveryLog, ScheduledTaskRun
from .operations_monitoring import TASKS, cron_snapshot


class MonitoringReadOnlyAdmin(admin.ModelAdmin):
    actions = None
    list_per_page = 50
    empty_value_display = '—'

    def has_module_permission(self, request):
        return bool(request.user.is_superuser)

    def has_view_permission(self, request, obj=None):
        return bool(request.user.is_superuser)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]


@admin.register(ScheduledTaskRun)
class ScheduledTaskRunAdmin(MonitoringReadOnlyAdmin):
    change_list_template = 'admin/myappLubd/scheduledtaskrun/change_list.html'
    list_display = ('task_name', 'run_state', 'source', 'scope', 'started_at', 'finished_at',
                    'duration', 'attempted_count', 'sent_count', 'failed_count', 'email_history')
    list_filter = ('task_name', 'status', 'source', 'dry_run', 'started_at')
    search_fields = ('task_name', 'scope', 'error_code')
    date_hierarchy = 'started_at'

    @admin.display(description='Status')
    def run_state(self, obj):
        if obj.status == 'running' and obj.started_at < timezone.now() - timedelta(hours=1):
            return 'Running > 1 hour — check process/logs'
        return obj.get_status_display()

    @admin.display(description='Duration')
    def duration(self, obj):
        end = obj.finished_at or timezone.now()
        return f'{max(0, (end - obj.started_at).total_seconds()):.1f}s'

    @admin.display(description='Email history')
    def email_history(self, obj):
        url = reverse('admin:myappLubd_emaildeliverylog_changelist')
        return format_html('<a href="{}?run__id__exact={}">View emails</a>', url, obj.pk)

    def changelist_view(self, request, extra_context=None):
        if not self.has_view_permission(request):
            from django.core.exceptions import PermissionDenied
            raise PermissionDenied
        snapshot = cron_snapshot()
        now = timezone.now()
        tasks = []
        for name, label in TASKS.items():
            latest = ScheduledTaskRun.objects.filter(task_name=name, source='cron', dry_run=False).first()
            tasks.append({
                'name': name, 'label': label,
                'schedule': snapshot['schedules'].get(name),
                'last_cron_run': latest,
                'stale': latest is not None and latest.started_at < now - timedelta(hours=26),
            })
        counts = EmailDeliveryLog.objects.filter(started_at__gte=now - timedelta(hours=24)).aggregate(
            sent=Count('pk', filter=Q(status='sent')),
            failed=Count('pk', filter=Q(status='failed')),
            sending=Count('pk', filter=Q(status='sending')),
        )
        context = {
            **(extra_context or {}), 'cron_status': snapshot, 'monitored_tasks': tasks,
            'email_counts': counts, 'monitor_checked_at': now,
            'email_history_url': reverse('admin:myappLubd_emaildeliverylog_changelist'),
        }
        return super().changelist_view(request, extra_context=context)


@admin.register(EmailDeliveryLog)
class EmailDeliveryLogAdmin(MonitoringReadOnlyAdmin):
    list_display = ('recipient', 'subject', 'status', 'provider', 'property', 'run',
                    'started_at', 'finished_at', 'http_status', 'error_code')
    list_filter = ('status', 'provider', 'run__task_name', 'run__source', 'started_at')
    search_fields = ('recipient', 'subject', 'provider_message_id', 'property__name', 'property__property_id', 'error_code')
    list_select_related = ('run', 'property')
    date_hierarchy = 'started_at'


@admin.register(DailySummaryRecipient)
class DailySummaryRecipientAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'is_active', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('email', 'name')
    readonly_fields = ('created_at', 'updated_at')
    fields = ('email', 'name', 'is_active', 'created_at', 'updated_at')
    change_list_template = 'admin/myappLubd/dailysummaryrecipient/change_list.html'
    list_per_page = 50
    actions = None

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
