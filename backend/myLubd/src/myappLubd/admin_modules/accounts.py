import csv
from datetime import timedelta
from io import BytesIO

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import format_html

from ..models import Session, UserProfile
from .filters import CreatedAtMonthFilter, ExpiresAtMonthFilter

User = get_user_model()
# Custom User Admin
class CustomUserAdmin(BaseUserAdmin):
    list_per_page = 25
    list_display = BaseUserAdmin.list_display + ('property_name', 'property_id')
    list_filter = BaseUserAdmin.list_filter + ('property_name',)
    search_fields = BaseUserAdmin.search_fields + ('property_name', 'property_id')
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Property Information', {'fields': ('property_name', 'property_id')}),
    )
    
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Property Information', {'fields': ('property_name', 'property_id')}),
    )

# Register our custom User admin (unregister first if already registered)
try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass
admin.site.register(User, CustomUserAdmin)

# Custom Date Joined Month Filter for Admin
class DateJoinedMonthFilter(admin.SimpleListFilter):
    title = 'date joined (month)'
    parameter_name = 'date_joined_month'

    def lookups(self, request, model_admin):
        # Generate lookups for the last 12 months using standard library
        from datetime import datetime
        
        lookups = []
        current_date = datetime.now()
        
        for i in range(12):
            # Calculate month offset
            year = current_date.year
            month = current_date.month - i
            while month <= 0:
                month += 12
                year -= 1
            
            month_key = f'{year}-{month:02d}'
            month_label = datetime(year, month, 1).strftime('%B %Y')
            lookups.append((month_key, month_label))
        
        return lookups

    def queryset(self, request, queryset):
        if self.value():
            year, month = self.value().split('-')
            return queryset.filter(
                date_joined__year=int(year),
                date_joined__month=int(month)
            )
        return queryset

# Custom User Admin to show Google OAuth information
class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Profile'
    fields = ['positions', 'profile_image', 'property_name', 'property_id', 'google_id', 'email_verified', 'login_provider']

class UserAdmin(BaseUserAdmin):
    list_per_page = 25
    inlines = (UserProfileInline,)
    list_display = ['username', 'email', 'first_name', 'last_name', 'property_name', 'get_property_id_display', 'get_google_info', 'is_staff', 'is_active', 'jobs_this_month', 'date_joined']
    list_filter = ['is_staff', 'is_superuser', 'is_active', 'groups', 'date_joined', DateJoinedMonthFilter, 'property_name']
    search_fields = ['username', 'first_name', 'last_name', 'email', 'property_name', 'property_id']
    actions = ['export_users_csv', 'export_users_pdf']
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Property Information', {'fields': ('property_name', 'property_id')}),
    )
    
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Property Information', {'fields': ('property_name', 'property_id')}),
    )
    
    def get_google_info(self, obj):
        try:
            profile = obj.userprofile
            if profile.google_id:
                return f"Google OAuth ({profile.login_provider or 'Google'})"
            return "Local User"
        except UserProfile.DoesNotExist:
            return "No Profile"
    get_google_info.short_description = 'Auth Type'
    get_google_info.admin_order_field = 'userprofile__google_id'

    def get_property_id_display(self, obj):
        """Display the property_id from the User model, or from related Property if available"""
        if obj.property_id:
            return obj.property_id
        
        # If User.property_id is empty, try to get it from the related Property
        if obj.accessible_properties.exists():
            property_obj = obj.accessible_properties.first()
            return property_obj.property_id if property_obj else "-"
        
        return "-"
    get_property_id_display.short_description = 'Property ID'
    get_property_id_display.admin_order_field = 'property_id'

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        # Current month date range
        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Add enough days to guarantee moving to next month, then reset to day 1
        start_of_next_month = (start_of_month + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return queryset.annotate(
            jobs_this_month_count=Count(
                'maintenance_jobs',
                filter=Q(
                    maintenance_jobs__created_at__gte=start_of_month,
                    maintenance_jobs__created_at__lt=start_of_next_month
                )
            )
        )

    def jobs_this_month(self, obj):
        return getattr(obj, 'jobs_this_month_count', 0)
    jobs_this_month.short_description = 'Jobs (this month)'
    jobs_this_month.admin_order_field = 'jobs_this_month_count'

    def export_users_csv(self, request, queryset):
        # Prepare date range for current month
        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_of_next_month = (start_of_month + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        annotated_qs = queryset.annotate(
            jobs_this_month_count=Count(
                'maintenance_jobs',
                filter=Q(
                    maintenance_jobs__created_at__gte=start_of_month,
                    maintenance_jobs__created_at__lt=start_of_next_month
                )
            )
        ).order_by('username')

        year_month = start_of_month.strftime('%Y_%m')
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="users_jobs_{year_month}.csv"'

        writer = csv.writer(response)
        writer.writerow(['Username', 'Email', 'First name', 'Last name', 'Jobs (this month)'])
        for user in annotated_qs:
            writer.writerow([
                user.username,
                user.email,
                user.first_name,
                user.last_name,
                getattr(user, 'jobs_this_month_count', 0)
            ])
        return response
    export_users_csv.short_description = 'Export selected users to CSV (with jobs this month)'

    def export_users_pdf(self, request, queryset):
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas
            from reportlab.lib.units import inch
        except Exception:
            self.message_user(request, 'ReportLab is required for PDF export. Install with: pip install reportlab', level='error')
            return None

        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_of_next_month = (start_of_month + timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        annotated_qs = queryset.annotate(
            jobs_this_month_count=Count(
                'maintenance_jobs',
                filter=Q(
                    maintenance_jobs__created_at__gte=start_of_month,
                    maintenance_jobs__created_at__lt=start_of_next_month
                )
            )
        ).order_by('username')

        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4

        title_text = f"Users - Jobs This Month ({start_of_month.strftime('%Y-%m')})"
        p.setFont('Helvetica-Bold', 14)
        p.drawString(72, height - 72, title_text)

        y = height - 100
        line_height = 16

        p.setFont('Helvetica', 10)
        header = ['Username', 'Email', 'First name', 'Last name', 'Jobs (this month)']
        p.drawString(72, y, ' | '.join(header))
        y -= line_height
        p.line(72, y + 4, width - 72, y + 4)
        y -= line_height

        for user in annotated_qs:
            row = [
                user.username,
                user.email or '',
                user.first_name or '',
                user.last_name or '',
                str(getattr(user, 'jobs_this_month_count', 0))
            ]
            row_text = ' | '.join(row)

            # wrap simple long lines if needed
            if len(row_text) > 110:
                # naive wrapping at 110 chars
                while len(row_text) > 110:
                    p.drawString(72, y, row_text[:110])
                    row_text = row_text[110:]
                    y -= line_height
                    if y < 72:
                        p.showPage()
                        p.setFont('Helvetica', 10)
                        y = height - 72
                if row_text:
                    p.drawString(72, y, row_text)
            else:
                p.drawString(72, y, row_text)

            y -= line_height
            if y < 72:
                p.showPage()
                p.setFont('Helvetica', 10)
                y = height - 72

        p.showPage()
        p.save()

        buffer.seek(0)
        year_month = start_of_month.strftime('%Y_%m')
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="users_jobs_{year_month}.pdf"'
        return response
    export_users_pdf.short_description = 'Export selected users to PDF (with jobs this month)'

# Re-register User admin
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ['user_link', 'positions', 'user_property_name', 'user_property_id', 'get_properties_display', 'email_notifications_enabled', 'profile_image_preview']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'positions', 'properties__name', 'properties__property_id']
    list_filter = ['email_notifications_enabled', 'properties']
    filter_horizontal = ['properties']
    raw_id_fields = ['user']
    readonly_fields = [
        'profile_image_preview', 'google_id', 'email_verified', 
        'access_token', 'refresh_token', 'login_provider'
    ]
    fieldsets = (
        (None, {'fields': ('user', 'positions', 'profile_image', 'profile_image_preview')}),
        ('Email Settings', {'fields': ('email_notifications_enabled',)}),
        ('Accessible Properties', {'fields': ('properties',)}),
        ('Google Authentication Details', {
            'classes': ('collapse',),
            'fields': ('google_id', 'email_verified', 'access_token', 'refresh_token', 'login_provider'),
        }),
    )

    def user_link(self, obj):
        return obj.user.username
    user_link.short_description = 'User'

    def profile_image_preview(self, obj):
        if obj.profile_image and hasattr(obj.profile_image, 'url'):
            return format_html('<img src="{}" style="max-width: 100px; max-height: 100px; border-radius: 50%;" />', obj.profile_image.url)
        return "No Image"
    profile_image_preview.short_description = 'Profile Image'
    
    def user_property_name(self, obj):
        return obj.user.property_name if obj.user.property_name else "-"
    user_property_name.short_description = 'Property Name'
    
    def user_property_id(self, obj):
        """Display the property_id from the User model, or from related Property if available"""
        if obj.user.property_id:
            return obj.user.property_id
        
        # If User.property_id is empty, try to get it from the related Property
        if obj.user.accessible_properties.exists():
            property_obj = obj.user.accessible_properties.first()
            return property_obj.property_id if property_obj else "-"
        
        return "-"
    user_property_id.short_description = 'User Property ID'
    
    def profile_property_name(self, obj):
        return obj.property_name if obj.property_name else "-"
    profile_property_name.short_description = 'Profile Property Name'
    
    def profile_property_id(self, obj):
        """Display the property_id from the UserProfile model, or from related Property if available"""
        if obj.property_id:
            return obj.property_id
        
        # If UserProfile.property_id is empty, try to get it from the related Property
        if obj.properties.exists():
            property_obj = obj.properties.first()
            return property_obj.property_id if property_obj else "-"
        
        return "-"
    profile_property_id.short_description = 'Profile Property ID'

    def get_properties_display(self, obj):
        """Display properties from the ManyToManyField relationship"""
        if obj.properties.exists():
            return ", ".join([f"{prop.property_id} - {prop.name}" for prop in obj.properties.all()])
        return "No Properties"
    get_properties_display.short_description = 'Properties (ID - Name)'
    
    actions = ['export_userprofiles_csv']
    
    def export_userprofiles_csv(self, request, queryset):
        """Export selected/filtered user profiles to CSV"""
        qs = queryset.select_related('user').prefetch_related('properties').order_by('user__username')
        
        filename = f"user_profiles_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'User',
            'Username',
            'Email',
            'Positions',
            'User Property Name',
            'User Property ID',
            'Properties',
            'Google ID',
            'Email Verified',
            'Login Provider',
        ])
        
        for profile in qs:
            properties = ", ".join([f"{p.property_id} - {p.name}" for p in profile.properties.all()])
            writer.writerow([
                profile.user.username if profile.user else '',
                profile.user.username if profile.user else '',
                profile.user.email if profile.user else '',
                profile.positions or '',
                profile.user.property_name if profile.user else '',
                profile.user.property_id if profile.user else '',
                properties,
                profile.google_id or '',
                'Yes' if profile.email_verified else 'No',
                profile.login_provider or '',
            ])
        
        return response
    export_userprofiles_csv.short_description = "Export selected/filtered user profiles to CSV"

@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_per_page = 25
    list_display = ('user', 'session_token_short', 'expires_at', 'created_at', 'is_expired_status')
    search_fields = ('user__username', 'session_token')
    list_filter = ('expires_at', ExpiresAtMonthFilter, 'created_at', CreatedAtMonthFilter)
    readonly_fields = ('user', 'session_token', 'access_token', 'refresh_token', 'expires_at', 'created_at')
    raw_id_fields = ('user',)

    fieldsets = (
        ('Session Info', {'fields': ('user', 'session_token', 'expires_at', 'created_at')}),
        ('Tokens (Read-Only)', {'classes': ('collapse',), 'fields': ('access_token', 'refresh_token')}),
    )

    def session_token_short(self, obj):
        return f"{obj.session_token[:20]}..." if obj.session_token else "N/A"
    session_token_short.short_description = 'Session Token (Short)'

    def is_expired_status(self, obj):
        return obj.is_expired()
    is_expired_status.boolean = True
    is_expired_status.short_description = 'Is Expired'
    
    actions = ['export_sessions_csv']
    
    def export_sessions_csv(self, request, queryset):
        """Export selected/filtered sessions to CSV"""
        qs = queryset.select_related('user').order_by('-created_at')
        
        filename = f"sessions_{timezone.now().strftime('%Y_%m_%d_%H%M')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'User',
            'Username',
            'Email',
            'Session Token (First 20 chars)',
            'Expires At',
            'Is Expired',
            'Created At',
        ])
        
        for session in qs:
            writer.writerow([
                session.id,
                session.user.username if session.user else '',
                session.user.username if session.user else '',
                session.user.email if session.user else '',
                session.session_token[:20] + '...' if session.session_token else '',
                session.expires_at.strftime('%Y-%m-%d %H:%M:%S') if session.expires_at else '',
                'Yes' if session.is_expired() else 'No',
                session.created_at.strftime('%Y-%m-%d %H:%M:%S') if session.created_at else '',
            ])
        
        return response
    export_sessions_csv.short_description = "Export selected/filtered sessions to CSV"

