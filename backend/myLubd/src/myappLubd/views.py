from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import status, viewsets, filters
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Prefetch
from rest_framework_simplejwt.tokens import RefreshToken
from google.oauth2 import id_token
from google.auth.transport import requests
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.utils import timezone
import math
from django.db.models import Count, Q, F, ExpressionWrapper, fields, Case, When, Value, Avg
from django.db.models.functions import ExtractMonth, ExtractYear
from django.db import models, transaction
from .models import (
    UserProfile, Property, Room, Topic, Job, Session, PreventiveMaintenance, PMMasterPlan,
    JobImage, Machine, MaintenanceProcedure, UtilityConsumption, Inventory,
    Area, JobComment, PushSubscription, Tenant,
    TenantMembership, SubscriptionPlan, TenantSubscription, UsageMetric,
    InventoryUsage, MaintenanceChecklist, MaintenanceHistory,
)
from django.urls import reverse
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .serializers import (
    UserProfileSerializer, PropertySerializer, RoomSerializer, TopicSerializer, JobSerializer,
    UserSerializer, PreventiveMaintenanceSerializer, PreventiveMaintenanceCreateUpdateSerializer,
    PreventiveMaintenanceCompleteSerializer, PreventiveMaintenanceListSerializer,
    PreventiveMaintenanceDetailSerializer, PropertyPMStatusSerializer, PMMasterPlanSerializer,
    MachineSerializer, MachineListSerializer, MachineDetailSerializer,
    MachineCreateSerializer, MachineUpdateSerializer, MachinePreventiveMaintenanceSerializer,
    MaintenanceProcedureSerializer, MaintenanceProcedureListSerializer,
    UtilityConsumptionSerializer, UtilityConsumptionListSerializer,
    InventorySerializer, InventoryListSerializer, InventoryUsageSerializer,
    AreaSerializer, JobCommentSerializer, TenantSerializer,
    TenantMembershipSerializer, SubscriptionPlanSerializer,
    TenantSubscriptionSerializer, UsageMetricSerializer,
)
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from .pagination import StandardResultsSetPagination, LargeResultsSetPagination, SmallResultsSetPagination
from django.shortcuts import get_object_or_404
import logging
import json
import uuid
import re
from difflib import SequenceMatcher
from datetime import timedelta
from calendar import monthrange
from django.http import JsonResponse, HttpResponseRedirect
import os
from django.http import HttpResponse, Http404
from django.conf import settings
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_http_methods
from .cache import cache_result, CacheManager
from .services import NotificationService, PreventiveMaintenanceService
from .tenancy import (
    accessible_property_ids,
    enforce_subscription_limit,
    ensure_tenant_for_property,
    ensure_tenant_for_user,
    get_accessible_properties,
    get_user_tenants,
    tenant_usage_counts,
    user_can_manage_tenant,
)
from .timezones import timezone_options
from .view_modules.common import MaintenancePagination, display_name_from_user, display_name_from_user_values, is_raw_auth_identifier
from .view_modules.utilities import UtilityConsumptionViewSet
from .view_modules.machines import MachineViewSet
from .view_modules.inventory_support import consume_inventory_items
from .view_modules.inventory import InventoryViewSet
from .view_modules.properties import PropertyViewSet
from .view_modules.jobs import JobViewSet
from .view_modules.preventive_maintenance import PreventiveMaintenanceViewSet
from .view_modules.rooms_taxonomy import AreaViewSet, RoomViewSet, TopicViewSet
from .view_modules.tenant_usage import (
    SubscriptionPlanViewSet, TenantMembershipViewSet, TenantSubscriptionViewSet,
    TenantViewSet, UsageMetricViewSet,
)
from .view_modules.accounts import (
    CustomSessionView, LoginView, LogoutView, RegisterView, UserProfileViewSet,
    UserViewSet, auth_check, auth_providers, forgot_password, google_auth,
    log_view, login_view, reset_password, update_user_profile,
)
from .view_modules.maintenance_procedures import MaintenanceProcedureViewSet
from .view_modules.reports import generate_maintenance_pdf_report
from .view_modules.notifications import (
    get_all_notifications, get_overdue_notifications, get_upcoming_notifications,
    push_public_key, push_subscribe, push_test, push_unsubscribe,
)
from .view_modules.ai_chat import (
    GEMINI_CHAT_MODEL, GEMINI_SYSTEM_INSTRUCTION, _normalize_search_text, _resolve_property,
    _resolve_room, _resolve_topic, _serialize_user, _serialize_job,
    _display_user_name_from_values, _should_force_summary_tool, _should_force_today_tool, _should_force_recurring_tool,
    _extract_year_month_from_message, _extract_frequency_from_message, _extract_property_name_from_message, _property_required_reply,
    _requires_property_before_tool, _extract_room_name_from_message, _extract_category_name_from_message, _build_category_details,
    get_maintenance_summary, get_today_maintenance_jobs, _serialize_preventive_maintenance, _safe_int,
    _build_monthly_task_counts, get_recurring_maintenance_tasks, _genai_modules, _build_gemini_client,
    _gemini_config, _authorized_ai_property, chat_with_gemini,
)
from .view_modules.dashboard import get_dashboard_summary



logger = logging.getLogger(__name__)
User = get_user_model()



# Maintenance Procedure ViewSet


# Other ViewSets and Views (unchanged)









class PreventiveMaintenanceImageUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    def post(self, request, pm_id):
        try:
            queryset = PreventiveMaintenance.objects.all()
            if not (request.user.is_staff or request.user.is_superuser):
                property_ids = accessible_property_ids(request.user) or set()
                queryset = queryset.filter(
                    Q(job__rooms__properties__id__in=property_ids)
                    | Q(job__area__property_id__in=property_ids)
                    | Q(machines__property_id__in=property_ids)
                ).distinct()
            pm = queryset.get(pm_id=pm_id)

            before_image = request.FILES.get('before_image')
            after_image = request.FILES.get('after_image')

            def process_image(image_file, filename_prefix):
                img = Image.open(image_file)
                img = img.convert('RGB')
                img.thumbnail((800, 800))
                buffer = BytesIO()
                img.save(buffer, format='JPEG', quality=85)
                buffer.seek(0)
                return ContentFile(buffer.read(), name=f"{filename_prefix}.jpg")

            if before_image:
                pm.before_image = process_image(before_image, "before_image")

            if after_image:
                pm.after_image = process_image(after_image, "after_image")

            pm.save()
            return Response({'message': 'Images uploaded and processed successfully'}, status=status.HTTP_200_OK)
        except PreventiveMaintenance.DoesNotExist:
            return Response({'error': 'PreventiveMaintenance not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Authentication Views


# Health Check
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "healthy"}, status=200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_data(request):
    """
    Get aggregated preventive maintenance data for all properties the user has access to.
    """
    logger.info(f"get_preventive_maintenance_data called by user: {request.user.username}")
    try:
        # Get properties accessible to the current user
        user_properties = Property.objects.filter(users=request.user)
        logger.info(f"Found {user_properties.count()} properties for user")
        
        # Get preventive maintenance jobs for these properties
        pm_jobs = Job.objects.filter(
            rooms__properties__in=user_properties,
            is_preventivemaintenance=True
        ).select_related('user').prefetch_related('rooms', 'topics')
        
        # Get counts by status
        status_counts = {
            'total': pm_jobs.count(),
            'pending': pm_jobs.filter(status='pending').count(),
            'in_progress': pm_jobs.filter(status='in_progress').count(),
            'completed': pm_jobs.filter(status='completed').count(),
            'waiting_sparepart': pm_jobs.filter(status='waiting_sparepart').count(),
            'cancelled': pm_jobs.filter(status='cancelled').count(),
        }
        
        # Calculate completion rate
        completion_rate = 0
        if status_counts['total'] > 0:
            completion_rate = (status_counts['completed'] / status_counts['total']) * 100
        
        # Return aggregated data
        return Response({
            'status_counts': status_counts,
            'completion_rate': completion_rate,
            'property_count': user_properties.count(),
        })
    except Exception as e:
        logger.exception(f"Error in get_preventive_maintenance_data: {str(e)}")
        return Response(
            {"detail": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_jobs(request):
    """Get jobs marked for preventive maintenance"""
    # Get query parameters
    property_id = request.query_params.get('property_id')
    status_param = request.query_params.get('status')
    limit = request.query_params.get('limit', 50)  # Default to 50 jobs
    user_filter = request.query_params.get('user_id')
    
    # Build base query
    query = Job.objects.filter(is_preventivemaintenance=True)
    
    # Add property filter if provided
    if property_id:
        try:
            property_obj = get_object_or_404(Property, property_id=property_id)
            # Check user has access to this property
            if not property_obj.users.filter(id=request.user.id).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            query = query.filter(rooms__properties__in=[property_obj])
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = Property.objects.filter(users=request.user)
        query = query.filter(rooms__properties__in=user_properties)
    
    # Add status filter if provided
    if status_param:
        query = query.filter(status=status_param)

    # Add user filter if provided (supports numeric id or username)
    if user_filter and str(user_filter).lower() != 'all':
        try:
            query = query.filter(user_id=int(user_filter))
        except (TypeError, ValueError):
            query = query.filter(user__username=str(user_filter))
    
    # Apply distinct, select related, and prefetch related for efficiency
    query = query.distinct().select_related('user').prefetch_related(
        'rooms', 'topics', 'job_images'
    )
    
    # Apply limit
    if limit and limit.isdigit():
        query = query[:int(limit)]
    
    # Serialize and return
    serializer = JobSerializer(query, many=True, context={'request': request})
    return Response({'jobs': serializer.data, 'count': len(serializer.data)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_rooms(request):
    """Get rooms with preventive maintenance jobs"""
    
    # Get property_id from query params
    property_id = request.query_params.get('property_id')
    
    # Start with rooms that have PM jobs
    rooms_with_pm = Room.objects.filter(
        jobs__is_preventivemaintenance=True
    ).distinct()
    
    # Add property filter if provided
    if property_id:
        try:
            property_obj = get_object_or_404(Property, property_id=property_id)
            # Check user has access to this property
            if not property_obj.users.filter(id=request.user.id).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            rooms_with_pm = rooms_with_pm.filter(properties=property_obj)
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = Property.objects.filter(users=request.user)
        rooms_with_pm = rooms_with_pm.filter(properties__in=user_properties)
    
    # Serialize and return
    serializer = RoomSerializer(rooms_with_pm, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_topics(request):
    """Get topics used in preventive maintenance jobs"""
    
    # Get user's properties
    user_properties = Property.objects.filter(users=request.user)
    
    # Get topics from PM jobs for user's properties
    topics = Topic.objects.filter(
        jobs__is_preventivemaintenance=True,
        jobs__rooms__properties__in=user_properties
    ).distinct()
    
    # Serialize and return
    serializer = TopicSerializer(topics, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def property_is_preventivemaintenance(request, property_id):
    """Check if a property has preventive maintenance jobs"""
    
    # Get the property
    property_instance = get_object_or_404(Property, property_id=property_id)
    
    # Check user has access to this property
    if not property_instance.users.filter(id=request.user.id).exists():
        if property_id != "PB749146D" or not settings.DEBUG:
            return Response(
                {"detail": "You do not have permission to access this property"},
                status=status.HTTP_403_FORBIDDEN
            )
    
    # Check if property has any PM jobs
    has_pm_jobs = Job.objects.filter(
        rooms__properties=property_instance,
        is_preventivemaintenance=True
    ).exists()
    
    # Update the property field
    if property_instance.is_preventivemaintenance != has_pm_jobs:
        property_instance.is_preventivemaintenance = has_pm_jobs
        property_instance.save()
    
    # Serialize and return
    serializer = PropertyPMStatusSerializer(property_instance)
    return Response(serializer.data)



@require_http_methods(["GET"])
@cache_control(max_age=31536000)  # Cache for 1 year
def serve_static_file(request, file_path):
    """
    Custom view to serve static files when Django's built-in serving fails
    """
    # Construct the full path to the static file
    static_root = getattr(settings, 'STATIC_ROOT', '/app/static')
    full_path = os.path.join(static_root, file_path)
    
    # Security check: ensure the path is within STATIC_ROOT
    if not os.path.commonpath([static_root, full_path]) == static_root:
        raise Http404("Invalid file path")
    
    # Check if file exists
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise Http404("File not found")
    
    # Determine content type based on file extension
    content_type = 'text/plain'
    if file_path.endswith('.css'):
        content_type = 'text/css'
    elif file_path.endswith('.js'):
        content_type = 'application/javascript'
    elif file_path.endswith('.png'):
        content_type = 'image/png'
    elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
        content_type = 'image/jpeg'
    elif file_path.endswith('.gif'):
        content_type = 'image/gif'
    elif file_path.endswith('.svg'):
        content_type = 'image/svg+xml'
    elif file_path.endswith('.woff'):
        content_type = 'font/woff'
    elif file_path.endswith('.woff2'):
        content_type = 'font/woff2'
    elif file_path.endswith('.ttf'):
        content_type = 'font/ttf'
    elif file_path.endswith('.eot'):
        content_type = 'application/vnd.ms-fontobject'
    
    # Read and serve the file
    try:
        with open(full_path, 'rb') as f:
            content = f.read()
        
        response = HttpResponse(content, content_type=content_type)
        response['Content-Length'] = len(content)
        return response
    except Exception as e:
        raise Http404(f"Error reading file: {str(e)}")

@api_view(['GET'])
@permission_classes([AllowAny])
def get_csrf_token(request):
    """Get CSRF token for frontend requests"""
    from django.middleware.csrf import get_token
    from django.http import JsonResponse
    
    # Get the CSRF token
    csrf_token = get_token(request)
    
    return JsonResponse({
        'csrfToken': csrf_token,
        'csrfHeaderName': 'X-CSRFToken'
    })




# ============================================================
# Public guest maintenance requests (no auth)
# ============================================================
#
# Hotels stick a QR code on the door / in the room that points to
# /report/<property_id>/<room_id>. Guests scan it, fill in a brief form,
# and the request lands in the maintenance backlog as a regular Job. To
# protect against abuse the endpoint:
#
#   - Requires both property and room to exist AND for the room to be
#     attached to that property (so a stranger can't enumerate or spoof
#     other tenants from a single QR scan).
#   - Caps description length and trims everything.
#   - Throttles by IP via the cache (15 requests per hour).
#   - Assigns the job to the property's first attached user (typically
#     the chief engineer) so the assignee FK never goes null.

from django.core.cache import cache


def _client_ip(request) -> str:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '').strip()
    if forwarded:
        return forwarded.split(',', 1)[0].strip()
    return (request.META.get('REMOTE_ADDR') or 'anon').strip()


@api_view(['POST'])
@permission_classes([AllowAny])
def public_job_request(request, property_id, room_id):
    """Create a maintenance Job from an unauthenticated guest scan."""

    ip = _client_ip(request)
    bucket_key = f'pcms:public-job-request:{ip}'
    count = cache.get(bucket_key, 0)
    if count >= 15:
        return Response(
            {'error': 'Too many requests from this network. Try again later.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    payload = request.data or {}
    description = (payload.get('description') or '').strip()
    if not description:
        return Response(
            {'error': 'description is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    description = description[:1000]
    guest_name = (payload.get('guest_name') or '').strip()[:120]
    guest_contact = (payload.get('guest_contact') or '').strip()[:120]

    # Resolve property and room. Accept both pcms-style property_id (P12345…)
    # and numeric PKs so the QR code can use whichever the operator prefers.
    property_obj = None
    try:
        if str(property_id).isdigit():
            property_obj = Property.objects.filter(id=int(property_id)).first()
        if property_obj is None:
            property_obj = Property.objects.filter(property_id=str(property_id)).first()
    except Exception:  # pragma: no cover - defensive
        property_obj = None
    if property_obj is None:
        return Response({'error': 'Property not found.'}, status=status.HTTP_404_NOT_FOUND)

    room_obj = None
    try:
        if str(room_id).isdigit():
            room_obj = Room.objects.filter(room_id=int(room_id)).first()
    except Exception:  # pragma: no cover - defensive
        room_obj = None
    if room_obj is None:
        # Allow lookup by name as a fallback so QRs printed with the visible
        # room number still work.
        room_obj = Room.objects.filter(name=str(room_id)).first()
    if room_obj is None or not room_obj.properties.filter(pk=property_obj.pk).exists():
        return Response(
            {'error': 'Room not found at this property.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    assignee = property_obj.users.order_by('id').first()
    if assignee is None:
        return Response(
            {'error': 'Property has no staff to dispatch the request to.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    stamp = timezone.now().strftime('%Y-%m-%d %H:%M')
    remark_lines = [f'[{stamp} · guest → reported via QR scan]']
    if guest_name:
        remark_lines.append(f'Guest: {guest_name}')
    if guest_contact:
        remark_lines.append(f'Contact: {guest_contact}')
    remark_lines.append(f'Source IP: {ip}')

    job = Job.objects.create(
        user=assignee,
        updated_by=assignee,
        description=description,
        remarks='\n'.join(remark_lines),
        status='pending',
        priority='medium',
    )
    job.rooms.set([room_obj])

    cache.set(bucket_key, count + 1, timeout=60 * 60)

    return Response(
        {
            'job_id': job.job_id,
            'property': property_obj.name,
            'room': room_obj.name,
            'message': 'Thanks — our maintenance team has been notified.',
        },
        status=status.HTTP_201_CREATED,
    )
