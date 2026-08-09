import os

from django.conf import settings
from django.http import Http404, HttpResponse
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
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
from .view_modules.preventive_maintenance_legacy import (
    PreventiveMaintenanceImageUploadView, get_preventive_maintenance_data,
    get_preventive_maintenance_jobs, get_preventive_maintenance_rooms,
    get_preventive_maintenance_topics, property_is_preventivemaintenance,
)
from .view_modules.public_jobs import _client_ip, public_job_request



# Health Check
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "healthy"}, status=200)




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
