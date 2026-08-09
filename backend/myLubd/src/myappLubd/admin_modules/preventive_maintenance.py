import csv
from collections import Counter
from datetime import datetime
from io import BytesIO

from django.contrib import admin
from django.http import HttpResponse
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from ..models import (
    MaintenanceChecklist,
    MaintenanceHistory,
    MaintenanceSchedule,
    PreventiveMaintenance,
)
from .filters import (
    CompletedAtMonthFilter,
    CompletedDateMonthFilter,
    DueDateMonthFilter,
    LastOccurrenceMonthFilter,
    NextOccurrenceMonthFilter,
    ScheduledDateMonthFilter,
    TimestampMonthFilter,
)

@admin.register(PreventiveMaintenance)
class PreventiveMaintenanceAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = (
        'pm_id',
        'pmtitle',
        'get_topics_display',
        'scheduled_date',
        'completed_date',
        # 'frequency',  # Removed - defaults to monthly
        'next_due_date',
        'get_status_display',
        'get_assigned_to_display',
        'created_by_user',
        'get_machines_display',
        'get_properties_display',
        'get_inventory_items_display',
        'get_task_template_display',
    )
    list_filter = (
        # 'frequency',  # Removed - defaults to monthly
        ('completed_date', admin.EmptyFieldListFilter),
        CompletedDateMonthFilter,
        'scheduled_date',
        ScheduledDateMonthFilter,
        'next_due_date',
        DueDateMonthFilter,
        'procedure_template',
    )
    search_fields = ('pm_id', 'notes', 'pmtitle', 'topics__title')
    date_hierarchy = 'scheduled_date'
    filter_horizontal = ['topics']
    readonly_fields = ('pm_id', 'next_due_date', 'before_image_preview', 'after_image_preview', 'inventory_items_display')
    fieldsets = (
        ('Identification', {
            'fields': ('pm_id', 'pmtitle', 'created_by', 'assigned_to')
        }),
        ('Schedule', {
            'fields': ('scheduled_date', 'completed_date', 'next_due_date')
        }),
        ('Task Template', {
            'fields': ('procedure_template',),
            'description': 'Link this maintenance to a reusable task template (optional)'
        }),
        ('Advanced', {
            'classes': ('collapse',),
            'fields': ('frequency', 'custom_days'),
            'description': 'Advanced scheduling options (defaults to monthly)'
        }),
        ('Documentation & Images', {
            'fields': ('procedure', 'notes', 'before_image', 'before_image_preview', 'after_image', 'after_image_preview')
        }),
        ('Related Items', {
            'fields': ('topics',)
        }),
        ('Inventory Used', {
            'fields': ('inventory_items_display',),
            'description': 'Inventory items linked to this preventive maintenance'
        }),
    )
    actions = ['mark_completed', 'export_pm_csv', 'export_pm_chart_pdf']

    def get_topics_display(self, obj):
        return ", ".join([topic.title for topic in obj.topics.all()])
    get_topics_display.short_description = 'Topics'

    def get_properties_display(self, obj):
        properties = []
        
        # Get properties through job->rooms->properties relationship
        if obj.job and obj.job.rooms.exists():
            for room in obj.job.rooms.all():
                for prop in room.properties.all():
                    prop_display = f"{prop.property_id} - {prop.name}"
                    if prop_display not in properties:
                        properties.append(prop_display)
        
        # Get properties through machines->property relationship
        if obj.machines.exists():
            for machine in obj.machines.all():
                if machine.property:
                    prop_display = f"{machine.property.property_id} - {machine.property.name}"
                    if prop_display not in properties:
                        properties.append(prop_display)
        
        return ", ".join(properties) if properties else "No Properties"
    get_properties_display.short_description = 'Properties (ID - Name)'

    def get_status_display(self, obj):
        if obj.completed_date:
            return format_html('<span style="color: green;">Completed</span>')
        elif obj.scheduled_date and obj.scheduled_date < timezone.now():
            return format_html('<span style="color: red;">Overdue</span>')
        elif obj.next_due_date and obj.next_due_date < timezone.now():
            return format_html('<span style="color: orange;">Next Due Overdue</span>')
        return format_html('<span style="color: blue;">Scheduled</span>')
    get_status_display.short_description = 'Status'
    get_status_display.admin_order_field = 'completed_date'

    def get_assigned_to_display(self, obj):
        if obj.assigned_to:
            full_name = obj.assigned_to.get_full_name()
            if full_name:
                return format_html('<span style="color: #0284c7;">{}</span>', full_name)
            return format_html('<span style="color: #0284c7;">{}</span>', obj.assigned_to.username)
        return format_html('<span style="color: #9ca3af;">Unassigned</span>')
    get_assigned_to_display.short_description = 'Assigned To'
    get_assigned_to_display.admin_order_field = 'assigned_to'

    def created_by_user(self, obj):
        return obj.created_by.username if obj.created_by else "N/A"
    created_by_user.short_description = 'Created By'
    created_by_user.admin_order_field = 'created_by'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('created_by', 'assigned_to', 'procedure_template').prefetch_related(
            'topics', 'machines__property', 'job__rooms__properties'
        )

    def save_model(self, request, obj, form, change):
        if not obj.pk and not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def mark_completed(self, request, queryset):
        now = timezone.now()
        updated_count = 0
        for pm in queryset:
            if not pm.completed_date:
                pm.completed_date = now
                pm.calculate_next_due_date()
                pm.save()
                updated_count += 1
        self.message_user(request, f"{updated_count} preventive maintenance tasks marked as completed.")
    mark_completed.short_description = "Mark selected tasks as completed"

    def export_pm_csv(self, request, queryset):
        """Export selected/filtered preventive maintenance records to CSV"""
        import csv
        from django.utils import timezone
        
        # Prefetch related data to avoid N+1 queries
        qs = queryset.select_related(
            'created_by', 'assigned_to', 'procedure_template'
        ).prefetch_related('topics', 'machines__property').order_by('scheduled_date')
        
        # Create the HttpResponse object with CSV header
        filename = f"preventive_maintenance_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        # Add BOM for Excel UTF-8 compatibility
        response.write('\ufeff')
        
        writer = csv.writer(response)
        
        # Write header row
        writer.writerow([
            'PM ID',
            'Title',
            'Scheduled Date',
            'Completed Date',
            'Status',
            'Frequency',
            'Custom Days',
            'Next Due Date',
            'Assigned To',
            'Assigned Email',
            'Created By',
            'Creator Email',
            'Task Template',
            'Machines',
            'Properties',
            'Topics',
            'Procedure',
            'Notes',
            'Has Before Image',
            'Has After Image',
        ])
        
        # Write data rows
        for pm in qs:
            # Get status
            if pm.completed_date:
                status = 'Completed'
            elif pm.scheduled_date and pm.scheduled_date < timezone.now():
                status = 'Overdue'
            else:
                status = 'Scheduled'
            
            # Get assigned user info
            assigned_to = ''
            assigned_email = ''
            if pm.assigned_to:
                assigned_to = pm.assigned_to.get_full_name() or pm.assigned_to.username
                assigned_email = pm.assigned_to.email or ''
            
            # Get created by info
            created_by = ''
            creator_email = ''
            if pm.created_by:
                created_by = pm.created_by.get_full_name() or pm.created_by.username
                creator_email = pm.created_by.email or ''
            
            # Get topics
            topics = ", ".join([t.title for t in pm.topics.all()])
            
            # Get machines
            machines = ", ".join([f"{m.name} ({m.machine_id})" for m in pm.machines.all()])
            
            # Get properties
            properties = []
            if pm.machines.exists():
                for machine in pm.machines.all():
                    if machine.property:
                        prop_display = f"{machine.property.property_id} - {machine.property.name}"
                        if prop_display not in properties:
                            properties.append(prop_display)
            properties_str = ", ".join(properties)
            
            # Get task template
            task_template = ''
            if pm.procedure_template:
                task_template = f"{pm.procedure_template.name} (ID: {pm.procedure_template.id})"
            
            # Format dates
            scheduled_date = pm.scheduled_date.strftime('%Y-%m-%d %H:%M:%S') if pm.scheduled_date else ''
            completed_date = pm.completed_date.strftime('%Y-%m-%d %H:%M:%S') if pm.completed_date else ''
            next_due_date = pm.next_due_date.strftime('%Y-%m-%d %H:%M:%S') if pm.next_due_date else ''
            
            writer.writerow([
                pm.pm_id,
                pm.pmtitle or '',
                scheduled_date,
                completed_date,
                status,
                pm.frequency,
                pm.custom_days or '',
                next_due_date,
                assigned_to,
                assigned_email,
                created_by,
                creator_email,
                task_template,
                machines,
                properties_str,
                topics,
                pm.procedure or '',
                pm.notes or '',
                'Yes' if pm.before_image else 'No',
                'Yes' if pm.after_image else 'No',
            ])
        
        return response
    export_pm_csv.short_description = "Export selected/filtered PM records to CSV"

    def export_pm_chart_pdf(self, request, queryset):
        """Export dashboard-style charts for selected preventive maintenance to PDF."""
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics.charts.piecharts import Pie
        from reportlab.graphics.charts.barcharts import VerticalBarChart

        qs = queryset.select_related(
            'created_by', 'assigned_to', 'procedure_template'
        ).prefetch_related('topics', 'machines__property', 'job__rooms__properties').order_by('scheduled_date')
        total_records = qs.count()
        now = timezone.now()

        status_counts = Counter()
        for pm in qs:
            if pm.completed_date:
                status_counts['completed'] += 1
            elif pm.scheduled_date and pm.scheduled_date < now:
                status_counts['overdue'] += 1
            elif pm.next_due_date and pm.next_due_date < now:
                status_counts['next_due_overdue'] += 1
            else:
                status_counts['scheduled'] += 1

        status_labels = [
            ('completed', 'Completed', colors.green),
            ('overdue', 'Overdue', colors.red),
            ('next_due_overdue', 'Next Due Overdue', colors.orange),
            ('scheduled', 'Scheduled', colors.blue),
        ]
        status_data = []
        status_names = []
        status_colors = []
        for key, label, color in status_labels:
            count = status_counts.get(key, 0)
            if count:
                status_data.append(count)
                status_names.append(f"{label} ({count})")
                status_colors.append(color)

        month_counts = Counter()
        for pm in qs:
            if pm.scheduled_date:
                month_key = timezone.localtime(pm.scheduled_date).strftime('%Y-%m')
                month_counts[month_key] += 1
        month_keys = sorted(month_counts.keys())
        month_labels = [datetime.strptime(m, '%Y-%m').strftime('%b %Y') for m in month_keys]
        month_values = [month_counts[m] for m in month_keys]

        topic_counts = Counter()
        machine_counts = Counter()
        property_counts = Counter()
        for pm in qs:
            for topic in pm.topics.all():
                topic_counts[topic.title] += 1
            for machine in pm.machines.all():
                machine_counts[machine.name] += 1
                if machine.property:
                    property_label = f"{machine.property.property_id} - {machine.property.name}"
                    property_counts[property_label] += 1

            if pm.job and pm.job.rooms.exists():
                for room in pm.job.rooms.all():
                    for prop in room.properties.all():
                        property_label = f"{prop.property_id} - {prop.name}"
                        property_counts[property_label] += 1

        top_topics = topic_counts.most_common(10)
        top_machines = machine_counts.most_common(10)
        top_properties = property_counts.most_common(10)

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=36, rightMargin=36, topMargin=48, bottomMargin=36)
        styles = getSampleStyleSheet()
        story = []

        title = Paragraph("Preventive Maintenance Analytics", styles['Title'])
        story.append(title)
        story.append(Paragraph(f"Total records: {total_records}", styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

        if status_data:
            story.append(Paragraph("Status Breakdown", styles['Heading2']))
            drawing = Drawing(400, 220)
            pie = Pie()
            pie.x = 150
            pie.y = 20
            pie.width = 200
            pie.height = 200
            pie.data = status_data
            pie.labels = status_names
            pie.simpleLabels = 1
            for index, color in enumerate(status_colors):
                pie.slices[index].fillColor = color
            drawing.add(pie)
            story.append(drawing)
            story.append(Spacer(1, 0.2 * inch))
        else:
            story.append(Paragraph("No status data available for the selected records.", styles['Normal']))
            story.append(Spacer(1, 0.2 * inch))

        if month_values:
            story.append(Paragraph("Scheduled by Month", styles['Heading2']))
            chart_width = 430
            chart_height = 200
            drawing = Drawing(chart_width, chart_height)
            bar_chart = VerticalBarChart()
            bar_chart.x = 40
            bar_chart.y = 30
            bar_chart.height = 150
            bar_chart.width = 360
            bar_chart.data = [month_values]
            bar_chart.valueAxis.valueMin = 0
            bar_chart.valueAxis.valueMax = max(month_values) + 1
            bar_chart.valueAxis.valueStep = max(1, int((bar_chart.valueAxis.valueMax) / 5))
            bar_chart.categoryAxis.categoryNames = month_labels
            bar_chart.categoryAxis.labels.boxAnchor = 'ne'
            bar_chart.categoryAxis.labels.angle = 45
            bar_chart.bars[0].fillColor = colors.HexColor('#16a34a')
            drawing.add(bar_chart)
            story.append(drawing)
            story.append(Spacer(1, 0.2 * inch))
        else:
            story.append(Paragraph("No monthly data available for the selected records.", styles['Normal']))
            story.append(Spacer(1, 0.2 * inch))

        story.append(PageBreak())
        story.append(Paragraph("Top Topics, Machines & Properties", styles['Heading2']))

        topics_table_data = [['Topic', 'Count']]
        for name, count in top_topics:
            topics_table_data.append([name, str(count)])
        if len(topics_table_data) == 1:
            topics_table_data.append(['No topics available', '0'])

        machines_table_data = [['Machine', 'Count']]
        for name, count in top_machines:
            machines_table_data.append([name, str(count)])
        if len(machines_table_data) == 1:
            machines_table_data.append(['No machines available', '0'])

        properties_table_data = [['Property', 'Count']]
        for name, count in top_properties:
            properties_table_data.append([name, str(count)])
        if len(properties_table_data) == 1:
            properties_table_data.append(['No properties available', '0'])

        table_style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ])

        topics_table = Table(topics_table_data, colWidths=[3.5 * inch, 1 * inch])
        topics_table.setStyle(table_style)
        machines_table = Table(machines_table_data, colWidths=[3.5 * inch, 1 * inch])
        machines_table.setStyle(table_style)
        properties_table = Table(properties_table_data, colWidths=[3.5 * inch, 1 * inch])
        properties_table.setStyle(table_style)

        story.append(Paragraph("Top Topics", styles['Heading3']))
        story.append(topics_table)
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("Top Machines", styles['Heading3']))
        story.append(machines_table)
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("Top Properties", styles['Heading3']))
        story.append(properties_table)

        doc.build(story)
        buffer.seek(0)
        filename = f"preventive_maintenance_dashboard_{timezone.now().strftime('%Y_%m_%d')}.pdf"
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    export_pm_chart_pdf.short_description = "Export selected/filtered preventive maintenance charts to PDF"

    def before_image_preview(self, obj):
        if obj.before_image and hasattr(obj.before_image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px;" />', obj.before_image.url)
        return "No Before Image"
    before_image_preview.short_description = 'Before Image Preview'

    def after_image_preview(self, obj):
        if obj.after_image and hasattr(obj.after_image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px;" />', obj.after_image.url)
        return "No After Image"
    after_image_preview.short_description = 'After Image Preview'
    def get_machines_display(self, obj):
        return ", ".join([machine.name for machine in obj.machines.all()])
    get_machines_display.short_description = 'Machines'

    def get_task_template_display(self, obj):
        if obj.procedure_template:
            return f"{obj.procedure_template.name} (ID: {obj.procedure_template.id})"
        return "No template"
    get_task_template_display.short_description = 'Task Template'
    get_task_template_display.admin_order_field = 'procedure_template'
    
    def get_inventory_items_display(self, obj):
        """Display inventory items used in this PM"""
        inventory_items = obj.inventory_items.all()
        if not inventory_items.exists():
            return format_html('<span style="color: #999;">No inventory items</span>')
        
        items_list = []
        for item in inventory_items:
            link = reverse("admin:myappLubd_inventory_change", args=[item.id])
            items_list.append(
                format_html(
                    '<a href="{}">{} - {} (Qty: {})</a>',
                    link,
                    item.item_id,
                    item.name,
                    item.quantity
                )
            )
        return format_html('<br>'.join(items_list))
    get_inventory_items_display.short_description = 'Inventory Used'
    
    def inventory_items_display(self, obj):
        """Display inventory items in detail view"""
        return self.get_inventory_items_display(obj)
    inventory_items_display.short_description = 'Inventory Items Used'

@admin.register(MaintenanceChecklist)
class MaintenanceChecklistAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['maintenance', 'item', 'is_completed', 'completed_by', 'completed_at', 'order']
    list_filter = ['is_completed', 'completed_at', CompletedAtMonthFilter, 'order']
    search_fields = ['item', 'maintenance__pm_id', 'maintenance__pmtitle']
    readonly_fields = ['completed_at']
    
    fieldsets = (
        ('Checklist Item', {
            'fields': ('maintenance', 'item', 'description', 'order')
        }),
        ('Completion', {
            'fields': ('is_completed', 'completed_by', 'completed_at')
        }),
    )
    
    actions = ['export_maintenance_checklists_csv']
    
    def export_maintenance_checklists_csv(self, request, queryset):
        """Export selected/filtered maintenance checklists to CSV"""
        qs = queryset.select_related('maintenance', 'completed_by').order_by('order')
        
        filename = f"maintenance_checklists_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Maintenance PM ID',
            'Maintenance Title',
            'Item',
            'Description',
            'Order',
            'Is Completed',
            'Completed By',
            'Completed By Email',
            'Completed At',
        ])
        
        for checklist in qs:
            writer.writerow([
                checklist.id,
                checklist.maintenance.pm_id if checklist.maintenance else '',
                checklist.maintenance.pmtitle if checklist.maintenance else '',
                checklist.item or '',
                checklist.description or '',
                checklist.order or 0,
                'Yes' if checklist.is_completed else 'No',
                checklist.completed_by.username if checklist.completed_by else '',
                checklist.completed_by.email if checklist.completed_by else '',
                checklist.completed_at.strftime('%Y-%m-%d %H:%M:%S') if checklist.completed_at else '',
            ])
        
        return response
    export_maintenance_checklists_csv.short_description = "Export selected/filtered maintenance checklists to CSV"


@admin.register(MaintenanceHistory)
class MaintenanceHistoryAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['maintenance', 'action', 'performed_by', 'timestamp']
    list_filter = ['action', 'timestamp', TimestampMonthFilter, 'performed_by']
    search_fields = ['maintenance__pm_id', 'action', 'notes', 'performed_by__username']
    readonly_fields = ['timestamp']
    
    fieldsets = (
        ('History Record', {
            'fields': ('maintenance', 'action', 'notes')
        }),
        ('Performer', {
            'fields': ('performed_by', 'timestamp')
        }),
    )
    
    actions = ['export_maintenance_history_csv']
    
    def export_maintenance_history_csv(self, request, queryset):
        """Export selected/filtered maintenance history to CSV"""
        qs = queryset.select_related('maintenance', 'performed_by').order_by('-timestamp')
        
        filename = f"maintenance_history_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Maintenance PM ID',
            'Maintenance Title',
            'Action',
            'Notes',
            'Performed By',
            'Performed By Email',
            'Timestamp',
        ])
        
        for history in qs:
            writer.writerow([
                history.id,
                history.maintenance.pm_id if history.maintenance else '',
                history.maintenance.pmtitle if history.maintenance else '',
                history.action or '',
                history.notes or '',
                history.performed_by.username if history.performed_by else '',
                history.performed_by.email if history.performed_by else '',
                history.timestamp.strftime('%Y-%m-%d %H:%M:%S') if history.timestamp else '',
            ])
        
        return response
    export_maintenance_history_csv.short_description = "Export selected/filtered maintenance history to CSV"


@admin.register(MaintenanceSchedule)
class MaintenanceScheduleAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['maintenance', 'is_recurring', 'next_occurrence', 'last_occurrence', 'total_occurrences', 'is_active']
    list_filter = ['is_recurring', 'is_active', 'next_occurrence', NextOccurrenceMonthFilter, 'last_occurrence', LastOccurrenceMonthFilter]
    search_fields = ['maintenance__pm_id', 'maintenance__pmtitle']
    readonly_fields = ['total_occurrences']
    
    fieldsets = (
        ('Schedule Information', {
            'fields': ('maintenance', 'is_recurring', 'next_occurrence', 'last_occurrence')
        }),
        ('Recurrence Pattern', {
            'fields': ('recurrence_pattern', 'is_active')
        }),
        ('Statistics', {
            'classes': ('collapse',),
            'fields': ('total_occurrences',)
        }),
    )
    
    actions = ['export_maintenance_schedules_csv']
    
    def export_maintenance_schedules_csv(self, request, queryset):
        """Export selected/filtered maintenance schedules to CSV"""
        qs = queryset.select_related('maintenance').order_by('next_occurrence')
        
        filename = f"maintenance_schedules_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Maintenance PM ID',
            'Maintenance Title',
            'Is Recurring',
            'Next Occurrence',
            'Last Occurrence',
            'Recurrence Pattern',
            'Is Active',
            'Total Occurrences',
        ])
        
        for schedule in qs:
            writer.writerow([
                schedule.id,
                schedule.maintenance.pm_id if schedule.maintenance else '',
                schedule.maintenance.pmtitle if schedule.maintenance else '',
                'Yes' if schedule.is_recurring else 'No',
                schedule.next_occurrence.strftime('%Y-%m-%d %H:%M:%S') if schedule.next_occurrence else '',
                schedule.last_occurrence.strftime('%Y-%m-%d %H:%M:%S') if schedule.last_occurrence else '',
                schedule.recurrence_pattern or '',
                'Yes' if schedule.is_active else 'No',
                schedule.total_occurrences or 0,
            ])
        
        return response
    export_maintenance_schedules_csv.short_description = "Export selected/filtered maintenance schedules to CSV"

