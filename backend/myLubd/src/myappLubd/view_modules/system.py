"""System definitions."""
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.http import JsonResponse
import os
from django.http import HttpResponse, Http404
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_http_methods


@api_view(['GET', 'POST', 'OPTIONS'])
@permission_classes([AllowAny])
def log_view(request):
    """Endpoint to accept NextAuth/client logs without requiring auth"""
    if request.method == 'POST':
        # Accept log payloads and return no content
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({"message": "ok"}, status=status.HTTP_200_OK)


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
