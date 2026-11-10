"""Stable public imports for domain implementations."""

from .room_names import floor_from_room_name

import os

import re

from django.contrib import admin, messages

from django.utils.html import format_html, format_html_join

from django.utils import timezone

from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from django.contrib.auth import get_user_model

from django.db import transaction

from django import forms

from django.core.exceptions import PermissionDenied, ValidationError

from django.db.models import Count, F, Q

from collections import Counter

from .timezones import timezone_choices

from django.db import models, transaction

from datetime import timedelta, datetime

from django.http import HttpResponse, HttpResponseRedirect

from django.template.response import TemplateResponse

from django.urls import reverse, path

from django.conf import settings

import csv

from io import BytesIO

import qrcode

import base64

from .models import (
    AuthIdentity,
    Property,
    Room,
    Topic,
    Job,
    DeletedJob,
    JobImage,
    UserProfile,
    PreventiveMaintenance,
    PMMasterPlan,
    Session,
    Machine,
    MaintenanceProcedure,
    MaintenanceTaskImage,
    MaintenanceChecklist,
    MaintenanceHistory,
    MaintenanceSchedule,
    UtilityConsumption,
    Inventory,
    InventoryCategory,
    WorkspaceReport,
    Area,
    JobComment,
    Tenant,
    TenantMembership,
    PlatformMembership,
    SubscriptionPlan,
    TenantSubscription,
    TenantInvitation,
    LineGroupPairing,
    BillingWebhookEvent,
    BillingIssuerSettings,
    UsageMetric,
    InventoryUsage,
)

from .tenancy import (
    SubscriptionUserLimitReached,
    enforce_tenant_user_limit,
    get_accessible_properties,
    get_billing_tenants,
    get_property_summary_recipients,
    get_tenant_user_capacity,
    get_user_tenants,
    lock_tenants_for_membership_change,
    user_can_access_billing,
)

from .notifications.line_webhook import (
    generate_pairing_code,
    masked_destination,
    pairing_ttl,
)

from .admin_job_summary import build_missing_rooms_summary

from .admin_modules.shared import (
    _absolute_file_url,
    _spreadsheet_image_formula,
    _image_export_note,
    UnsupportedExcelImagePreview,
    _excel_image_for_export,
)

from .admin_modules.shared import (
    create_month_filter,
    CreatedAtMonthFilter,
    UpdatedAtMonthFilter,
    UploadedAtMonthFilter,
    ScheduledDateMonthFilter,
    CompletedDateMonthFilter,
    DueDateMonthFilter,
    LastRestockedMonthFilter,
    ExpiryDateMonthFilter,
    InstallationDateMonthFilter,
    LastMaintenanceDateMonthFilter,
    CompletedAtMonthFilter,
    TimestampMonthFilter,
    NextOccurrenceMonthFilter,
    LastOccurrenceMonthFilter,
    ExpiresAtMonthFilter,
    CreatedAtBeforeYearFilter,
    DatalistTextInput,
)

from .admin_modules.machines import (
    MachineAdminForm,
    MachineAdmin,
)

from .admin_modules.jobs import (
    JobAdminForm,
    JobImageInline,
    PropertyFilter,
    AreaFilter,
    FloorFilter,
    RoomFilter,
    TopicFilter,
    IsDefectFilter,
    JobSortFilter,
    JobImagePropertyFilter,
    JobImageRoomFilter,
    JobImageTopicFilter,
    JobAdmin,
    DeletedJobAdmin,
    JobImageAdmin,
)

from .admin_modules.inventory import (
    LowStockFilter,
    InventoryCategoryAdminForm,
    InventoryAdminForm,
    InventoryCategoryAdmin,
    InventoryAdmin,
    InventoryUsageAdmin,
)

from .admin_modules.reports import (
    ReportDateMonthFilter,
    DueDateMonthFilter,
    CompletedDateMonthFilter,
    WorkspaceReportAdmin,
)

from . import admin_monitoring

User = get_user_model()

admin.site.site_header = 'StayMaint Administration'

admin.site.site_title = 'StayMaint Admin'

admin.site.index_title = 'Operations overview'

from .admin_modules.users import (
    CustomUserAdmin,
    DateJoinedMonthFilter,
    UserProfileInline,
    UserAdmin,
    UserProfileAdmin,
    SessionAdmin,
)

from .admin_modules.locations import (
    PropertyAdmin,
    HasPreventiveMaintenanceFilter,
    RoomAdminForm,
    RoomAdmin,
    TopicAdmin,
    AreaAdmin,
    JobCommentAdmin,
)

from .admin_modules.preventive_maintenance import (
    PreventiveMaintenanceAdmin,
    PMMasterPlanAdmin,
)

from .admin_modules.procedures import (
    MaintenanceProcedureAdmin,
    MaintenanceTaskImageAdmin,
    MaintenanceChecklistAdmin,
    MaintenanceHistoryAdmin,
    MaintenanceScheduleAdmin,
)

from .admin_modules.utilities import (
    UtilityConsumptionAdmin,
)

from .admin_modules.tenancy import (
    TenantAdmin,
    AuthIdentityAdmin,
    TenantMembershipAdminForm,
    TenantMembershipAdmin,
    PlatformMembershipAdmin,
    SubscriptionPlanAdmin,
    TenantSubscriptionAdmin,
    InvitationStatusFilter,
    TenantInvitationAdmin,
    LineGroupPairingAdmin,
    BillingWebhookEventAdmin,
    UsageMetricAdmin,
    BillingIssuerSettingsAdmin,
)
