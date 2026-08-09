from django.contrib import admin

def create_month_filter(date_field, filter_title=None, param_name=None):
    """
    Factory function to create a month filter for any date field.
    Usage: CreatedAtMonthFilter = create_month_filter('created_at', 'Created Month', 'created_month')
    """
    class MonthFilter(admin.SimpleListFilter):
        title = filter_title or f'{date_field.replace("_", " ").title()} Month'
        parameter_name = param_name or f'{date_field}_month'

        def lookups(self, request, model_admin):
            # Get distinct year-month combinations from the database
            from django.db.models.functions import TruncMonth
            from django.db.models import Count
            
            try:
                # Get all distinct months from the date field
                queryset = model_admin.get_queryset(request)
                dates = (
                    queryset
                    .exclude(**{f'{date_field}__isnull': True})
                    .annotate(month=TruncMonth(date_field))
                    .values('month')
                    .annotate(count=Count('id'))
                    .order_by('-month')
                )
                
                months = []
                for entry in dates:
                    if entry['month']:
                        month_str = entry['month'].strftime('%Y-%m')
                        month_display = entry['month'].strftime('%B %Y')
                        months.append((month_str, f"{month_display} ({entry['count']})"))
                
                return months
            except Exception:
                return []

        def queryset(self, request, queryset):
            if self.value():
                try:
                    year, month = self.value().split('-')
                    return queryset.filter(**{
                        f'{date_field}__year': int(year),
                        f'{date_field}__month': int(month)
                    })
                except (ValueError, TypeError):
                    pass
            return queryset
    
    return MonthFilter


# Pre-defined month filters for common date fields
CreatedAtMonthFilter = create_month_filter('created_at', 'Created Month', 'created_month')
UpdatedAtMonthFilter = create_month_filter('updated_at', 'Updated Month', 'updated_month')
UploadedAtMonthFilter = create_month_filter('uploaded_at', 'Uploaded Month', 'uploaded_month')
ScheduledDateMonthFilter = create_month_filter('scheduled_date', 'Scheduled Month', 'scheduled_month')
CompletedDateMonthFilter = create_month_filter('completed_date', 'Completed Month', 'completed_month')
DueDateMonthFilter = create_month_filter('next_due_date', 'Due Date Month', 'due_month')
LastRestockedMonthFilter = create_month_filter('last_restocked', 'Restocked Month', 'restocked_month')
ExpiryDateMonthFilter = create_month_filter('expiry_date', 'Expiry Month', 'expiry_month')
InstallationDateMonthFilter = create_month_filter('installation_date', 'Installation Month', 'installation_month')
LastMaintenanceDateMonthFilter = create_month_filter('last_maintenance_date', 'Last Maintenance Month', 'last_maintenance_month')
CompletedAtMonthFilter = create_month_filter('completed_at', 'Completed Month', 'completed_month')
TimestampMonthFilter = create_month_filter('timestamp', 'Timestamp Month', 'timestamp_month')
NextOccurrenceMonthFilter = create_month_filter('next_occurrence', 'Next Occurrence Month', 'next_occurrence_month')
LastOccurrenceMonthFilter = create_month_filter('last_occurrence', 'Last Occurrence Month', 'last_occurrence_month')
ExpiresAtMonthFilter = create_month_filter('expires_at', 'Expires Month', 'expires_month')

