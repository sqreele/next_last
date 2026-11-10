"""Stable public imports for domain implementations."""

from .room_views import RoomViewSet

from django.contrib.auth import get_user_model

from django.contrib.admin.models import ADDITION, CHANGE, DELETION

from django.conf import settings

from rest_framework import status, viewsets, filters

from rest_framework.decorators import api_view, permission_classes, action

from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated

from rest_framework.response import Response

from rest_framework.views import APIView

from rest_framework.exceptions import PermissionDenied, ValidationError

from django.db.models import Prefetch

from rest_framework_simplejwt.tokens import RefreshToken

from google.oauth2 import id_token

from google.auth.transport import requests

from rest_framework.permissions import AllowAny, IsAuthenticated

from django.utils import timezone

from django.utils.dateparse import parse_date

import math

import csv

from django.db.models import Count, Q, F, ExpressionWrapper, fields, Case, When, Value, Avg, Exists, OuterRef, Min, IntegerField

from django.db.models.functions import ExtractMonth, ExtractYear

from django.db import models, transaction

from .models import (
    UserProfile, Property, Room, Topic, Job, Session, PreventiveMaintenance,
    PreventiveMaintenanceImage, PMMasterPlan, JobImage, PendingJobImage, Machine,
    MaintenanceProcedure, UtilityConsumption, Inventory, InventoryCategory,
    Area, JobComment, PushSubscription, Tenant,
    TenantMembership, LineGroupPairing, SubscriptionPlan, TenantSubscription, UsageMetric,
    InventoryUsage, MaintenanceChecklist, MaintenanceHistory,
)

from django.urls import reverse

from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .serializers import (
    CurrentUserProfileSerializer, CurrentUserProfileUpdateSerializer,
    UserProfileSerializer, PropertySerializer, RoomSerializer, TopicSerializer, JobSerializer,
    JobDashboardSerializer,
    UserWriteSerializer, PreventiveMaintenanceSerializer, PreventiveMaintenanceCreateUpdateSerializer,
    PreventiveMaintenanceCompleteSerializer, PreventiveMaintenanceListSerializer,
    PreventiveMaintenanceDetailSerializer, PropertyPMStatusSerializer, PMMasterPlanSerializer,
    MachineSerializer, MachineListSerializer, MachineDetailSerializer,
    MachineCreateSerializer, MachineUpdateSerializer, MachinePreventiveMaintenanceSerializer,
    MaintenanceProcedureSerializer, MaintenanceProcedureListSerializer,
    UtilityConsumptionSerializer, UtilityConsumptionListSerializer,
    InventorySerializer, InventoryListSerializer, InventoryUsageSerializer,
    AreaSerializer, JobCommentSerializer, TenantSerializer, JobAssignmentCandidateSerializer,
    TenantMembershipSerializer, SubscriptionPlanSerializer,
    TenantSubscriptionSerializer, UsageMetricSerializer,
)

from .job_property import resolve_external_property_reference, resolve_job_property

from .job_history import log_job_action

from django.core.files.base import ContentFile

from django.core.exceptions import ValidationError as DjangoValidationError

from django_filters.rest_framework import DjangoFilterBackend

from rest_framework.pagination import PageNumberPagination

from .pagination import StandardResultsSetPagination, LargeResultsSetPagination, SmallResultsSetPagination

from django.shortcuts import get_object_or_404

import logging

import json

import uuid

import re

from difflib import SequenceMatcher

from datetime import datetime, time, timedelta

from calendar import monthrange

from contextvars import ContextVar

from django.http import JsonResponse, HttpResponseRedirect, StreamingHttpResponse

import os

from django.http import HttpResponse, Http404, FileResponse

from django.conf import settings

from django.views.decorators.cache import cache_control

from django.views.decorators.http import require_http_methods

from .cache import cache_result, CacheManager

from .services import NotificationService, PreventiveMaintenanceService

from .tenancy import (
    user_can_edit_property,
    can_manage_membership_property_grants,
    user_can_access_billing,
    get_accessible_jobs,
    get_accessible_machines,
    restrict_pm_for_company_technicians,
    require_work_creation_permission,
    SubscriptionUserLimitReached,
    accessible_property_ids,
    enforce_subscription_limit,
    enforce_storage_limit,
    enforce_tenant_user_limit,
    ensure_tenant_for_property,
    ensure_tenant_for_user,
    get_accessible_properties,
    get_billing_tenants,
    lock_tenants_for_membership_change,
    get_active_membership,
    get_job_reassignable_properties,
    get_operable_properties,
    get_property_summary_recipients,
    get_user_tenants,
    TENANT_OPERATOR_ROLES,
    TENANT_WIDE_PROPERTY_ROLES,
    tenant_usage_counts,
    tenant_limit_snapshot,
    user_can_consume_inventory,
    user_can_manage_inventory_stock,
    user_can_manage_pm_master,
    user_can_manage_tenant,
)

from .billing.permissions import HasBillingAccess

from .timezones import object_timezone, property_timezone, timezone_options

from .entitlements import get_tenant_entitlement

from .plan_capabilities import (
    get_plan_capabilities,
    require_plan_feature,
    require_request_feature,
)

from .subscription_permissions import (
    get_subscription_enforcement_mode,
    require_subscription_write,
    resolve_tenant_from_target,
)

from .notifications.line_webhook import generate_pairing_code, pairing_ttl

from django.core.cache import cache

User = get_user_model()

logger = logging.getLogger('myappLubd.views')

from .view_modules.ai import (
    GEMINI_CHAT_MODEL,
    _ai_accessible_properties,
    GEMINI_SYSTEM_INSTRUCTION,
    _normalize_search_text,
    _resolve_property,
    _ai_scoped_properties,
    _resolve_explicit_ai_property,
    _resolve_room,
    _resolve_topic,
    _serialize_user,
    _serialize_job,
    _display_user_name_from_values,
    _should_force_summary_tool,
    _should_force_today_tool,
    _should_force_recurring_tool,
    _extract_year_month_from_message,
    _extract_frequency_from_message,
    _extract_property_name_from_message,
    _property_required_reply,
    _requires_property_before_tool,
    _extract_room_name_from_message,
    _extract_category_name_from_message,
    _build_category_details,
    get_maintenance_summary,
    get_today_maintenance_jobs,
    _serialize_preventive_maintenance,
    _safe_int,
    _build_monthly_task_counts,
    get_recurring_maintenance_tasks,
    _genai_modules,
    _build_gemini_client,
    _gemini_config,
    chat_with_gemini,
)

from .view_modules.common import (
    IsPlatformSuperuser,
    RAW_AUTH_PREFIXES,
    is_raw_auth_identifier,
    display_name_from_user_values,
    display_name_from_user,
    _job_property_ids,
    _pm_property_ids,
    _ensure_user_can_use_property,
    _ensure_user_can_operate_property,
    _ensure_user_can_reassign_job,
    _job_assignment_candidates,
    consume_inventory_items,
    MaintenancePagination,
    canonical_pm_queryset,
)

from .view_modules.preventive_maintenance import (
    PreventiveMaintenanceViewSet,
)

from .view_modules.machines import (
    MachineViewSet,
)

from .view_modules.procedures import (
    MaintenanceProcedureViewSet,
)

from .view_modules.locations import (
    TopicViewSet,
    AreaViewSet,
)

from .view_modules.jobs import (
    JobViewSet,
)

from .view_modules.tenancy import (
    TenantViewSet,
    SubscriptionPlanViewSet,
    TenantMembershipViewSet,
    TenantSubscriptionViewSet,
    UsageMetricViewSet,
)

from .view_modules.users import (
    UserProfileViewSet,
    UserViewSet,
    update_user_profile,
)

from .view_modules.properties import (
    PropertyViewSet,
)

from .view_modules.pm_images import (
    PreventiveMaintenanceImageUploadView,
    PreventiveMaintenanceImageDeleteView,
)

from .view_modules.authentication import (
    LegacyApplicationAuthEnabled,
    LoginView,
    RegisterView,
    LogoutView,
    CustomSessionView,
    auth_check,
    auth_providers,
    login_view,
    forgot_password,
    reset_password,
    google_auth,
)

from .view_modules.system import (
    log_view,
    health_check,
    serve_static_file,
    get_csrf_token,
)

from .view_modules.pm_reports import (
    get_preventive_maintenance_data,
    get_preventive_maintenance_jobs,
    get_preventive_maintenance_rooms,
    get_preventive_maintenance_topics,
    property_is_preventivemaintenance,
    generate_maintenance_pdf_report,
)

from .view_modules.dashboard import (
    get_dashboard_summary,
)

from .view_modules.utilities import (
    UtilityConsumptionViewSet,
)

from .view_modules.inventory import (
    InventoryOrderingFilter,
    InventoryViewSet,
)

from .view_modules.notifications import (
    get_overdue_notifications,
    get_upcoming_notifications,
    get_all_notifications,
)

from .view_modules.push import (
    push_subscribe,
    push_unsubscribe,
    push_public_key,
    push_test,
)

from .view_modules.public_requests import (
    _client_ip,
    public_job_request,
)
