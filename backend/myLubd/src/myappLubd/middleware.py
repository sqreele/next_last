"""Custom middleware for debugging and handling HTTP_HOST issues."""
import logging
from django.conf import settings
from django.http import HttpResponse

logger = logging.getLogger(__name__)


class DebugHostMiddleware:
    """Middleware to debug HTTP_HOST header issues."""
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Log the incoming HTTP_HOST header
        http_host = request.META.get('HTTP_HOST', 'No HTTP_HOST header')
        logger.debug(f"Incoming request - HTTP_HOST: {http_host}")
        logger.debug(f"Request path: {request.path}")
        logger.debug(f"Request method: {request.method}")
        
        # If in DEBUG mode and getting host validation errors, log more info
        if settings.DEBUG and http_host not in settings.ALLOWED_HOSTS:
            logger.warning(f"HTTP_HOST '{http_host}' not in ALLOWED_HOSTS: {settings.ALLOWED_HOSTS}")
        
        response = self.get_response(request)
        return response


class HealthCheckMiddleware:
    """Middleware to handle health check requests without host validation."""
    
    def __init__(self, get_response):
        self.get_response = get_response
        self.health_check_paths = ['/health/', '/api/health/', '/healthz/']
    
    def __call__(self, request):
        # Allow health checks from any host
        if request.path in self.health_check_paths:
            # For health checks, bypass host validation by setting a valid host
            if 'HTTP_HOST' in request.META:
                original_host = request.META['HTTP_HOST']
                # Use the first allowed host for health checks
                if settings.ALLOWED_HOSTS:
                    request.META['HTTP_HOST'] = settings.ALLOWED_HOSTS[0]
                    logger.debug(f"Health check from {original_host}, using {request.META['HTTP_HOST']}")
        
        response = self.get_response(request)
        return response