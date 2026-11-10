"""Stable public imports for domain implementations."""

from rest_framework import serializers

from .demo_documents import validate_documents

from .demo_categories import MACHINE_CATEGORIES, machine_category_flags

import uuid

from rest_framework.exceptions import PermissionDenied

from .models import (
    Room, Topic, JobImage, PendingJobImage, Job, JobDocument, Property, UserProfile, Session,
    PreventiveMaintenance, PMMasterPlan, Machine, MaintenanceProcedure,
    MaintenanceTaskImage,
    UtilityConsumption, Inventory, InventoryCategory, Area, JobComment, Tenant,
    TenantMembership, SubscriptionPlan, TenantSubscription, UsageMetric,
    InventoryUsage,
)

from django.contrib.auth import get_user_model

import logging

from django.contrib.auth.password_validation import validate_password

from django.core.exceptions import ValidationError, FieldDoesNotExist

from django.db import transaction

from django.db.models import Q

from django.db.utils import ProgrammingError

from django.utils import timezone

from django.core.validators import FileExtensionValidator

from django.core.files.storage import default_storage

from django.conf import settings

from datetime import timedelta

from pathlib import Path

import math

import json

from .timezones import is_valid_timezone, object_timezone

from .tenancy import (
    user_can_edit_property,
    require_work_creation_permission,
    TENANT_WIDE_PROPERTY_ROLES,
    get_accessible_properties,
    get_job_reassignable_properties,
    get_operable_properties,
    get_user_tenant_memberships,
    user_can_access_billing,
)

from .platform_authorization import (
    get_platform_capabilities,
    get_platform_roles,
    is_platform_user,
)

from .job_property import (
    resolve_external_property_reference,
    resolve_job_property,
    resolve_property_reference,
)

from .room_property import resolve_room_property

User = get_user_model()

logger = logging.getLogger(__name__)

from .serializer_modules.shared import (
    RAW_AUTH_PREFIXES,
    _validate_request_property_access,
    _validate_room_belongs_to_property,
    InventoryCategoryCodeField,
    _resolve_inventory_category,
    _validate_machine_ids_in_request_scope,
    is_raw_auth_identifier,
    get_user_display_name,
    get_user_public_username,
)

from .serializer_modules.users import (
    UserReadSerializer,
    UserSummarySerializer,
    JobAssignmentCandidateSerializer,
    UserProfileSerializer,
    CurrentUserProfileSerializer,
    CurrentUserProfileUpdateSerializer,
    UserRegistrationSerializer,
    UserWriteSerializer,
    UserSerializer,
    LoginSerializer,
    SessionSerializer,
)

from .serializer_modules.tenancy import (
    SubscriptionPlanSerializer,
    TenantSubscriptionSerializer,
    TenantMembershipSerializer,
    UsageMetricSerializer,
    TenantSerializer,
)

from .serializer_modules.locations import (
    RoomPropertiesCompatibilityField,
    RoomSerializer,
    RoomSummarySerializer,
    PropertyPMStatusSerializer,
    PropertySerializer,
    TopicSerializer,
    AreaSerializer,
    AreaSummarySerializer,
)

from .serializer_modules.job_images import (
    _build_media_absolute_uri,
    JobImageSerializer,
)

from .serializer_modules.jobs import (
    JobCommentSerializer,
    JobDashboardImageSerializer,
    JobMachineSerializer,
    JobDashboardSerializer,
    JobSerializer,
)

from .serializer_modules.machines import (
    MachineSerializer,
    MachineDateListSerializer,
    MachineListSerializer,
    MachineCreateSerializer,
    MachineUpdateSerializer,
)

from .serializer_modules.pm_list import (
    get_pm_property_external_id,
    get_pm_property,
    PreventiveMaintenanceListSerializer,
)

from .serializer_modules.machine_details import (
    MachineDetailSerializer,
    MachinePreventiveMaintenanceSerializer,
)

from .serializer_modules.pm_master import (
    PMMasterPlanSerializer,
)

from .serializer_modules.pm_images import (
    PM_IMAGE_LIMIT,
    _pm_image_url,
    serialize_pm_images,
    get_pm_image_counts,
    validate_and_optimize_legacy_pm_images,
    user_can_operate_pm,
)

from .serializer_modules.pm_detail import (
    PreventiveMaintenanceDetailSerializer,
)

from .serializer_modules.pm_write import (
    PreventiveMaintenanceCreateUpdateSerializer,
)

from .serializer_modules.pm_complete import (
    PreventiveMaintenanceCompleteSerializer,
)

from .serializer_modules.pm_compat import (
    PreventiveMaintenanceSerializer,
)

from .serializer_modules.procedures import (
    MaintenanceStepSerializer,
    MaintenanceProcedureSerializer,
    MaintenanceProcedureListSerializer,
    MaintenanceTaskImageSerializer,
    MaintenanceTaskImageListSerializer,
)

from .serializer_modules.utilities import (
    _UTILITY_DECIMAL_KWARGS,
    UtilityConsumptionSerializer,
    UtilityConsumptionListSerializer,
)

from .serializer_modules.inventory import (
    InventoryUsageSerializer,
    InventorySerializer,
    InventoryListSerializer,
)
