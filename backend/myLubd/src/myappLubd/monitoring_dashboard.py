"""
Real-time monitoring dashboard for PCMS backend
"""
import json
import time
from datetime import datetime, timedelta
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
from django.core.cache import cache
from django.db import connection
from django.conf import settings

from .monitoring import (
    performance_monitor, 
    DatabaseMonitor, 
    SystemMonitor, 
    HealthChecker,
    MetricsCollector
)


class MonitoringDashboard(View):
    """
    Main monitoring dashboard view
    """
    
    def get(self, request):
        """Get comprehensive monitoring data"""
        try:
            # Get all monitoring data
            data = {
                'timestamp': datetime.now().isoformat(),
                'performance': self._get_performance_metrics(),
                'database': self._get_database_metrics(),
                'system': self._get_system_metrics(),
                'health': self._get_health_status(),
                'cache': self._get_cache_metrics(),
                'requests': self._get_request_metrics()
            }
            
            return JsonResponse({
                'status': 'success',
                'data': data
            })
        except Exception as e:
            return JsonResponse({
                'status': 'error',
                'message': str(e)
            }, status=500)
    
    def _get_performance_metrics(self):
        """Get performance metrics"""
        metrics = performance_monitor.get_metrics()
        return {
            'request_count': metrics['request_count'],
            'average_response_time': performance_monitor.get_average_response_time(),
            'cache_hit_rate': performance_monitor.get_cache_hit_rate(),
            'slow_queries': metrics['slow_queries'],
            'database_queries': metrics['database_queries']
        }
    
    def _get_database_metrics(self):
        """Get database performance metrics"""
        queries = connection.queries
        slow_queries = DatabaseMonitor.get_slow_queries()
        
        return {
            'total_queries': len(queries),
            'slow_queries_count': len(slow_queries),
            'average_query_time': sum(float(q['time']) for q in queries) / len(queries) if queries else 0,
            'slow_queries': slow_queries[:5]  # Top 5 slow queries
        }
    
    def _get_system_metrics(self):
        """Get system resource metrics"""
        return SystemMonitor.get_system_health()
    
    def _get_health_status(self):
        """Get overall system health"""
        return HealthChecker.get_overall_health()
    
    def _get_cache_metrics(self):
        """Get cache performance metrics"""
        try:
            # Test cache performance
            test_key = f"monitoring_test_{int(time.time())}"
            test_value = {"test": True, "timestamp": time.time()}
            
            start_time = time.time()
            cache.set(test_key, test_value, 10)
            set_time = time.time() - start_time
            
            start_time = time.time()
            retrieved = cache.get(test_key)
            get_time = time.time() - start_time
            
            cache.delete(test_key)
            
            return {
                'status': 'healthy' if retrieved == test_value else 'unhealthy',
                'set_time': set_time,
                'get_time': get_time,
                'hit_rate': performance_monitor.get_cache_hit_rate()
            }
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e)
            }
    
    def _get_request_metrics(self):
        """Get request metrics"""
        # Get recent request data from cache
        recent_requests = cache.get('recent_requests', [])
        
        return {
            'recent_requests': recent_requests[-10:],  # Last 10 requests
            'total_requests': performance_monitor.metrics['request_count'],
            'average_response_time': performance_monitor.get_average_response_time()
        }


@require_http_methods(["GET"])
def health_check(request):
    """Simple health check endpoint"""
    try:
        health_data = HealthChecker.get_overall_health()
        
        # Determine overall status
        overall_status = 'healthy'
        if (health_data['database']['status'] != 'healthy' or 
            health_data['cache']['status'] != 'healthy'):
            overall_status = 'unhealthy'
        
        return JsonResponse({
            'status': overall_status,
            'timestamp': datetime.now().isoformat(),
            'services': health_data
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def performance_summary(request):
    """Get performance summary"""
    try:
        collector = MetricsCollector()
        summary = collector.get_performance_summary()
        
        return JsonResponse({
            'status': 'success',
            'data': summary
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def database_status(request):
    """Get database status and performance"""
    try:
        # Test database connection
        with connection.cursor() as cursor:
            start_time = time.time()
            cursor.execute("SELECT 1")
            response_time = time.time() - start_time
        
        # Get query statistics
        queries = connection.queries
        slow_queries = DatabaseMonitor.get_slow_queries()
        
        return JsonResponse({
            'status': 'success',
            'data': {
                'connection_status': 'healthy',
                'response_time': response_time,
                'total_queries': len(queries),
                'slow_queries': len(slow_queries),
                'slow_query_threshold': 0.1
            }
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def cache_status(request):
    """Get cache status and performance"""
    try:
        # Test cache operations
        test_key = f"status_test_{int(time.time())}"
        test_value = {"status": "test", "timestamp": time.time()}
        
        # Set test
        start_time = time.time()
        cache.set(test_key, test_value, 10)
        set_time = time.time() - start_time
        
        # Get test
        start_time = time.time()
        retrieved = cache.get(test_key)
        get_time = time.time() - start_time
        
        # Clean up
        cache.delete(test_key)
        
        return JsonResponse({
            'status': 'success',
            'data': {
                'cache_status': 'healthy' if retrieved == test_value else 'unhealthy',
                'set_time': set_time,
                'get_time': get_time,
                'hit_rate': performance_monitor.get_cache_hit_rate()
            }
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def system_resources(request):
    """Get system resource usage"""
    try:
        resources = SystemMonitor.get_system_health()
        
        return JsonResponse({
            'status': 'success',
            'data': resources
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt
def reset_metrics(request):
    """Reset performance metrics"""
    try:
        # Reset performance monitor
        performance_monitor.metrics = {
            'request_count': 0,
            'total_response_time': 0,
            'slow_queries': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'database_queries': 0,
            'memory_usage': 0
        }
        
        # Clear recent requests cache
        cache.delete('recent_requests')
        
        return JsonResponse({
            'status': 'success',
            'message': 'Metrics reset successfully'
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def monitoring_config(request):
    """Get monitoring configuration"""
    try:
        config = {
            'performance_thresholds': {
                'slow_request_threshold': 1.0,
                'high_query_count_threshold': 20,
                'cache_hit_rate_target': 0.8
            },
            'monitoring_enabled': getattr(settings, 'ENABLE_PERFORMANCE_MONITORING', True),
            'log_level': 'INFO' if not settings.DEBUG else 'DEBUG',
            'cache_backend': settings.CACHES['default']['BACKEND'],
            'database_engine': settings.DATABASES['default']['ENGINE']
        }
        
        return JsonResponse({
            'status': 'success',
            'data': config
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)
