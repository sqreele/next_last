import csv

from django.contrib import admin
from django.http import HttpResponse
from django.utils import timezone

from ..models import UtilityConsumption
from .filters import CreatedAtMonthFilter

@admin.register(UtilityConsumption)
class UtilityConsumptionAdmin(admin.ModelAdmin):
    list_per_page = 25
    ordering = ['year', 'month', 'property']
    list_display = [
        'id',
        'property',
        'month',
        'year',
        'totalkwh',
        'onpeakkwh',
        'offpeakkwh',
        'totalelectricity',
        'electricity_cost_budget',
        'water',
        'nightsale',
        'created_by',
        'created_at',
        'updated_at'
    ]
    list_filter = ['year', 'month', 'property', 'created_at', CreatedAtMonthFilter]
    search_fields = ['property__name', 'property__property_id', 'created_by__username']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['property', 'created_by']
    
    fieldsets = (
        ('Property', {
            'fields': ('property',)
        }),
        ('Period', {
            'fields': ('month', 'year')
        }),
        ('Electricity Consumption', {
            'fields': ('totalkwh', 'onpeakkwh', 'offpeakkwh', 'totalelectricity', 'electricity_cost_budget')
        }),
        ('Other Utilities', {
            'fields': ('water', 'nightsale')
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at')
        }),
    )
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('property', 'created_by')
    
    actions = ['export_utility_consumption_csv']
    
    def export_utility_consumption_csv(self, request, queryset):
        """Export selected/filtered utility consumption records to CSV"""
        qs = queryset.select_related('property', 'created_by').order_by('-year', '-month')
        
        filename = f"utility_consumption_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Property',
            'Property ID',
            'Month',
            'Year',
            'Total kWh',
            'On Peak kWh',
            'Off Peak kWh',
            'Total Electricity',
            'Electricity Cost Budget',
            'Water',
            'Night Sale',
            'Created By',
            'Created By Email',
            'Created At',
            'Updated At',
        ])
        
        for consumption in qs:
            writer.writerow([
                consumption.id,
                consumption.property.name if consumption.property else '',
                consumption.property.property_id if consumption.property else '',
                consumption.get_month_display() if hasattr(consumption, 'get_month_display') else consumption.month,
                consumption.year or '',
                consumption.totalkwh or 0,
                consumption.onpeakkwh or 0,
                consumption.offpeakkwh or 0,
                consumption.totalelectricity or 0,
                consumption.electricity_cost_budget or 0,
                consumption.water or 0,
                consumption.nightsale or 0,
                consumption.created_by.username if consumption.created_by else '',
                consumption.created_by.email if consumption.created_by else '',
                consumption.created_at.strftime('%Y-%m-%d %H:%M:%S') if consumption.created_at else '',
                consumption.updated_at.strftime('%Y-%m-%d %H:%M:%S') if consumption.updated_at else '',
            ])
        
        return response
    export_utility_consumption_csv.short_description = "Export selected/filtered utility consumption to CSV"

