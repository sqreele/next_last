import os
import re
from django.contrib import admin
from django.utils.html import format_html, format_html_join
from django.utils import timezone
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()

admin.site.site_header = 'HotelCare Pro Administration'
admin.site.site_title = 'HotelCare Pro Admin'
admin.site.index_title = 'Operations overview'

from .admin_modules.accounts import (  # noqa: E402,F401
    CustomUserAdmin,
    DateJoinedMonthFilter,
    SessionAdmin,
    UserAdmin,
    UserProfileAdmin,
    UserProfileInline,
)

from django import forms
from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from collections import Counter

from .timezones import timezone_choices
from django.db import models
from datetime import timedelta, datetime
from django.http import HttpResponse
from django.urls import reverse, path
from django.conf import settings
import csv
from io import BytesIO
import qrcode
import base64
from .models import (
    Property,
    Room,
    Topic,
    Job,
    JobImage,
    UserProfile,
    PreventiveMaintenance,
    Session,
    Machine,
    MaintenanceProcedure,
    MaintenanceTaskImage,
    MaintenanceChecklist,
    MaintenanceHistory,
    MaintenanceSchedule,
    UtilityConsumption,
    Inventory,
    WorkspaceReport,
    Area,
    JobComment,
    Tenant,
    TenantMembership,
    SubscriptionPlan,
    TenantSubscription,
    UsageMetric,
    InventoryUsage,
)



from .admin_modules.job_exports import (  # noqa: E402,F401
    JobExportMixin,
    JobImageExportMixin,
    UnsupportedExcelImagePreview,
    _absolute_file_url,
    _excel_image_for_export,
    _image_export_note,
    _spreadsheet_image_formula,
)


# ========================================
# Month Filters - Filter by month for date fields
# ========================================
# Note: Moved here to ensure filters are defined before ModelAdmin classes that use them

from .admin_modules.filters import (  # noqa: E402,F401
    CompletedAtMonthFilter,
    CompletedDateMonthFilter,
    CreatedAtMonthFilter,
    DueDateMonthFilter,
    ExpiresAtMonthFilter,
    ExpiryDateMonthFilter,
    InstallationDateMonthFilter,
    LastMaintenanceDateMonthFilter,
    LastOccurrenceMonthFilter,
    LastRestockedMonthFilter,
    NextOccurrenceMonthFilter,
    ScheduledDateMonthFilter,
    TimestampMonthFilter,
    UpdatedAtMonthFilter,
    UploadedAtMonthFilter,
    create_month_filter,
)


from .admin_modules.machine import MachineAdmin  # noqa: E402,F401


from .admin_modules.jobs import (  # noqa: E402,F401
    AreaFilter,
    CreatedAtBeforeYearFilter,
    FloorFilter,
    IsDefectFilter,
    JobAdmin,
    JobAdminForm,
    JobImageAdmin,
    JobImageInline,
    JobImagePropertyFilter,
    JobImageRoomFilter,
    JobImageTopicFilter,
    PropertyFilter,
    RoomFilter,
    TopicFilter,
)


from .admin_modules.properties import (  # noqa: E402,F401
    HasPreventiveMaintenanceFilter,
    PropertyAdmin,
    RoomAdmin,
    TopicAdmin,
)


from .admin_modules.preventive_maintenance import (  # noqa: E402,F401
    MaintenanceChecklistAdmin,
    MaintenanceHistoryAdmin,
    MaintenanceScheduleAdmin,
    PreventiveMaintenanceAdmin,
)



from .admin_modules.maintenance_procedure import (  # noqa: E402,F401
    MaintenanceProcedureAdmin,
    MaintenanceTaskImageAdmin,
)




from .admin_modules.utility import UtilityConsumptionAdmin  # noqa: E402,F401


from .admin_modules.inventory import (  # noqa: E402,F401
    InventoryAdmin,
    InventoryUsageAdmin,
)


# ========================================
# Workspace Report Admin
# ========================================

# Create month filters for WorkspaceReport


from .admin_modules.workspace_report import (  # noqa: E402,F401
    CompletedDateMonthFilter,
    DueDateMonthFilter,
    ReportDateMonthFilter,
    WorkspaceReportAdmin,
)


# Import low-risk platform registrations during Django admin autodiscovery and
# preserve their historical public names on ``myappLubd.admin``.
from .admin_modules.platform import (  # noqa: E402,F401
    AreaAdmin,
    JobCommentAdmin,
    SubscriptionPlanAdmin,
    TenantAdmin,
    TenantMembershipAdmin,
    TenantSubscriptionAdmin,
    UsageMetricAdmin,
)
