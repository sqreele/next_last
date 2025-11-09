"""
Custom middleware for performance monitoring and security
"""
import time
import logging
from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from django.core.cache import cache
from django.conf import settings
from django.utils import timezone
from django.db import connection

from .security import RateLimiter, LoginSecurity, SecurityHeaders, AuditLogger

logger = logging.getLogger(__name__)


class PerformanceMiddleware(MiddlewareMixin):
    """
    Middleware for performance monitoring
    """
    
    def process_request(self, request):
        """Record request start time"""
        request._start_time = time.time()
        request._start_queries = len(connection.queries)
    
    def process_response(self, request, response):
        """Record request performance metrics"""
        if hasattr(request, '_start_time'):
            response_time = time.time() - request._start_time
            query_count = len(connection.queries) - getattr(request, '_start_queries', 0)
            
            # Add performance headers
            response['X-Response-Time'] = f"{response_time:.3f}s"
            response['X-Query-Count'] = str(query_count)
            
            # Log slow requests
            if response_time > 1.0:
                logger.warning(f"Slow request: {request.method} {request.path} took {response_time:.3f}s with {query_count} queries")
        
        return response
    
    def process_exception(self, request, exception):
        """Log exceptions with performance data"""
        if hasattr(request, '_start_time'):
            response_time = time.time() - request._start_time
            logger.error(f"Exception in {request.path} after {response_time:.3f}s: {str(exception)}", exc_info=True)
        
        return None


class SecurityMiddleware(MiddlewareMixin):
    """
    Middleware for security enhancements
    """
    
    def process_request(self, request):
        """Process security checks"""
        # Rate limiting
        if getattr(settings, 'RATE_LIMIT_ENABLED', True):
            if RateLimiter.is_rate_limited(request):
                return JsonResponse({
                    'error': 'Rate limit exceeded',
                    'message': 'Too many requests. Please try again later.'
                }, status=429)
        
        # Add security headers
        return None
    
    def process_response(self, request, response):
        """Add security headers to response"""
        # Add security headers
        SecurityHeaders.add_security_headers(response)
        
        # Add rate limiting headers
        if getattr(settings, 'RATE_LIMIT_ENABLED', True):
            remaining = RateLimiter.get_remaining_requests(request)
            response['X-RateLimit-Remaining'] = str(remaining)
            response['X-RateLimit-Limit'] = str(getattr(settings, 'RATE_LIMIT_REQUESTS', 100))
        
        return response


class DatabaseQueryMiddleware(MiddlewareMixin):
    """
    Middleware for database query monitoring
    """
    
    def process_request(self, request):
        """Reset query count"""
        request._query_count = len(connection.queries)
    
    def process_response(self, request, response):
        """Log database query performance"""
        if hasattr(request, '_query_count'):
            query_count = len(connection.queries) - request._query_count
            
            if query_count > 20:  # High query count threshold
                logger.warning(f"High query count: {query_count} queries for {request.path}")
            
            # Add query count header
            response['X-Query-Count'] = str(query_count)
        
        return response


class CacheMiddleware(MiddlewareMixin):
    """
    Middleware for cache management
    """
    
    def process_request(self, request):
        """Handle cache-related request processing"""
        # Check for cache bypass headers
        if request.META.get('HTTP_CACHE_BYPASS'):
            # Disable caching for this request
            request._cache_bypass = True
        
        return None
    
    def process_response(self, request, response):
        """Add cache headers"""
        if not getattr(request, '_cache_bypass', False):
            # Add cache control headers for appropriate responses
            if request.method == 'GET' and response.status_code == 200:
                # Cache for 5 minutes by default
                response['Cache-Control'] = 'public, max-age=300'
                response['Vary'] = 'Accept-Encoding'
        
        return response


class LoggingMiddleware(MiddlewareMixin):
    """
    Enhanced logging middleware
    """
    
    def process_request(self, request):
        """Log request details"""
        if settings.DEBUG:
            logger.debug(f"Request: {request.method} {request.path} from {request.META.get('REMOTE_ADDR')}")
    
    def process_response(self, request, response):
        """Log response details"""
        if settings.DEBUG:
            logger.debug(f"Response: {response.status_code} for {request.method} {request.path}")
        
        return response


class ErrorHandlingMiddleware(MiddlewareMixin):
    """
    Enhanced error handling middleware
    """
    
    def process_exception(self, request, exception):
        """Handle exceptions with proper logging and response"""
        # Log the exception
        logger.error(f"Exception in {request.path}: {str(exception)}", exc_info=True)
        
        # Audit log for security events
        if hasattr(exception, 'status_code') and exception.status_code == 403:
            AuditLogger.log_security_event(
                'access_denied',
                getattr(request, 'user', None),
                {'path': request.path, 'exception': str(exception)}
            )
        
        # Return appropriate error response
        if request.path.startswith('/api/'):
            return JsonResponse({
                'error': 'Internal server error',
                'message': 'An unexpected error occurred. Please try again later.'
            }, status=500)
        
        return None


class AuthenticationMiddleware(MiddlewareMixin):
    """
    Enhanced authentication middleware
    """
    
    def process_request(self, request):
        """Process authentication-related security"""
        # Check for suspicious authentication patterns
        if hasattr(request, 'user') and request.user.is_authenticated:
            # Log successful authentication
            if not hasattr(request, '_auth_logged'):
                logger.info(f"Authenticated user {request.user.username} accessing {request.path}")
                request._auth_logged = True
        
        return None


