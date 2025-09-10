"""
Performance monitoring and enhanced logging
"""
import time
import logging
import json
from typing import Dict, Any, Optional, Callable
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from functools import wraps
import os

logger = logging.getLogger(__name__)

# Try to import psutil, but handle gracefully if not available
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    logger.warning("psutil not available. System monitoring will be limited.")


class PerformanceMonitor:
    """
    Performance monitoring utilities
    """
    
    def __init__(self):
        self.metrics = {
            'request_count': 0,
            'total_response_time': 0,
            'slow_queries': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'database_queries': 0,
            'memory_usage': 0
        }
    
    def record_request(self, response_time: float, query_count: int = 0):
        """
        Record request metrics
        """
        self.metrics['request_count'] += 1
        self.metrics['total_response_time'] += response_time
        self.metrics['database_queries'] += query_count
        
        if response_time > 1.0:  # Slow request threshold
            logger.warning(f"Slow request detected: {response_time:.3f}s")
        
        if query_count > 20:  # Too many queries threshold
            logger.warning(f"High query count: {query_count} queries")
    
    def record_cache_event(self, hit: bool):
        """
        Record cache hit/miss
        """
        if hit:
            self.metrics['cache_hits'] += 1
        else:
            self.metrics['cache_misses'] += 1
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get current metrics
        """
        return self.metrics.copy()
    
    def get_average_response_time(self) -> float:
        """
        Get average response time
        """
        if self.metrics['request_count'] == 0:
            return 0.0
        return self.metrics['total_response_time'] / self.metrics['request_count']
    
    def get_cache_hit_rate(self) -> float:
        """
        Get cache hit rate
        """
        total_cache_requests = self.metrics['cache_hits'] + self.metrics['cache_misses']
        if total_cache_requests == 0:
            return 0.0
        return self.metrics['cache_hits'] / total_cache_requests


class DatabaseMonitor:
    """
    Database performance monitoring
    """
    
    @staticmethod
    def get_query_count() -> int:
        """
        Get current query count
        """
        return len(connection.queries)
    
    @staticmethod
    def get_slow_queries(threshold: float = 0.1) -> list:
        """
        Get slow queries
        """
        slow_queries = []
        for query in connection.queries:
            if float(query['time']) > threshold:
                slow_queries.append({
                    'sql': query['sql'],
                    'time': query['time']
                })
        return slow_queries
    
    @staticmethod
    def log_query_performance():
        """
        Log query performance
        """
        queries = connection.queries
        if queries:
            total_time = sum(float(q['time']) for q in queries)
            slow_queries = DatabaseMonitor.get_slow_queries()
            
            logger.info(f"Database queries: {len(queries)} total, {total_time:.3f}s total time")
            
            if slow_queries:
                logger.warning(f"Slow queries detected: {len(slow_queries)}")
                for query in slow_queries[:3]:  # Log first 3 slow queries
                    logger.warning(f"Slow query ({query['time']}s): {query['sql'][:200]}...")


class SystemMonitor:
    """
    System resource monitoring
    """
    
    @staticmethod
    def get_memory_usage() -> Dict[str, Any]:
        """
        Get memory usage statistics
        """
        if not PSUTIL_AVAILABLE:
            return {
                'rss': 0,
                'vms': 0,
                'percent': 0,
                'available': 0,
                'total': 0,
                'error': 'psutil not available'
            }
        
        try:
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            
            return {
                'rss': memory_info.rss,  # Resident Set Size
                'vms': memory_info.vms,  # Virtual Memory Size
                'percent': process.memory_percent(),
                'available': psutil.virtual_memory().available,
                'total': psutil.virtual_memory().total
            }
        except Exception as e:
            logger.error(f"Error getting memory usage: {e}")
            return {
                'rss': 0,
                'vms': 0,
                'percent': 0,
                'available': 0,
                'total': 0,
                'error': str(e)
            }
    
    @staticmethod
    def get_cpu_usage() -> float:
        """
        Get CPU usage percentage
        """
        if not PSUTIL_AVAILABLE:
            return 0.0
        
        try:
            return psutil.cpu_percent()
        except Exception as e:
            logger.error(f"Error getting CPU usage: {e}")
            return 0.0
    
    @staticmethod
    def get_disk_usage() -> Dict[str, Any]:
        """
        Get disk usage statistics
        """
        if not PSUTIL_AVAILABLE:
            return {
                'total': 0,
                'used': 0,
                'free': 0,
                'percent': 0,
                'error': 'psutil not available'
            }
        
        try:
            disk_usage = psutil.disk_usage('/')
            return {
                'total': disk_usage.total,
                'used': disk_usage.used,
                'free': disk_usage.free,
                'percent': (disk_usage.used / disk_usage.total) * 100
            }
        except Exception as e:
            logger.error(f"Error getting disk usage: {e}")
            return {
                'total': 0,
                'used': 0,
                'free': 0,
                'percent': 0,
                'error': str(e)
            }
    
    @staticmethod
    def get_system_health() -> Dict[str, Any]:
        """
        Get overall system health
        """
        if not PSUTIL_AVAILABLE:
            return {
                'memory': {
                    'rss': 0,
                    'vms': 0,
                    'percent': 0,
                    'available': 0,
                    'total': 0,
                    'error': 'psutil not available'
                },
                'cpu': 0.0,
                'disk': {
                    'total': 0,
                    'used': 0,
                    'free': 0,
                    'percent': 0,
                    'error': 'psutil not available'
                },
                'timestamp': timezone.now().isoformat()
            }
        
        return {
            'memory': SystemMonitor.get_memory_usage(),
            'cpu': SystemMonitor.get_cpu_usage(),
            'disk': SystemMonitor.get_disk_usage(),
            'timestamp': timezone.now().isoformat()
        }


class RequestLogger:
    """
    Enhanced request logging
    """
    
    @staticmethod
    def log_request(request, response, response_time: float):
        """
        Log request details
        """
        log_data = {
            'method': request.method,
            'path': request.path,
            'status_code': response.status_code,
            'response_time': response_time,
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            'ip_address': request.META.get('REMOTE_ADDR', ''),
            'user': getattr(request, 'user', None).username if hasattr(request, 'user') and request.user.is_authenticated else None,
            'timestamp': timezone.now().isoformat()
        }
        
        # Log based on response time
        if response_time > 2.0:
            logger.warning(f"Slow request: {log_data}")
        elif response_time > 1.0:
            logger.info(f"Request: {log_data}")
        else:
            logger.debug(f"Request: {log_data}")
    
    @staticmethod
    def log_error(request, exception, response_time: float = 0):
        """
        Log error details
        """
        log_data = {
            'method': request.method,
            'path': request.path,
            'error': str(exception),
            'error_type': type(exception).__name__,
            'response_time': response_time,
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            'ip_address': request.META.get('REMOTE_ADDR', ''),
            'user': getattr(request, 'user', None).username if hasattr(request, 'user') and request.user.is_authenticated else None,
            'timestamp': timezone.now().isoformat()
        }
        
        logger.error(f"Request error: {log_data}")


class PerformanceDecorator:
    """
    Performance monitoring decorators
    """
    
    @staticmethod
    def monitor_performance(func_name: str = None):
        """
        Decorator to monitor function performance
        """
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            def wrapper(*args, **kwargs) -> Any:
                start_time = time.time()
                start_queries = len(connection.queries)
                
                try:
                    result = func(*args, **kwargs)
                    return result
                finally:
                    end_time = time.time()
                    end_queries = len(connection.queries)
                    
                    execution_time = end_time - start_time
                    query_count = end_queries - start_queries
                    
                    name = func_name or func.__name__
                    logger.info(f"Performance: {name} took {execution_time:.3f}s, {query_count} queries")
                    
                    # Log slow functions
                    if execution_time > 0.5:
                        logger.warning(f"Slow function: {name} took {execution_time:.3f}s")
            
            return wrapper
        return decorator
    
    @staticmethod
    def monitor_database_queries(func_name: str = None):
        """
        Decorator to monitor database query performance
        """
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            def wrapper(*args, **kwargs) -> Any:
                start_queries = len(connection.queries)
                
                try:
                    result = func(*args, **kwargs)
                    return result
                finally:
                    end_queries = len(connection.queries)
                    query_count = end_queries - start_queries
                    
                    name = func_name or func.__name__
                    
                    if query_count > 10:
                        logger.warning(f"High query count in {name}: {query_count} queries")
                    else:
                        logger.debug(f"Query count in {name}: {query_count} queries")
            
            return wrapper
        return decorator


class HealthChecker:
    """
    System health checking
    """
    
    @staticmethod
    def check_database_health() -> Dict[str, Any]:
        """
        Check database connectivity and performance
        """
        try:
            start_time = time.time()
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
            
            response_time = time.time() - start_time
            
            return {
                'status': 'healthy',
                'response_time': response_time,
                'error': None
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'response_time': None,
                'error': str(e)
            }
    
    @staticmethod
    def check_cache_health() -> Dict[str, Any]:
        """
        Check cache connectivity
        """
        try:
            start_time = time.time()
            test_key = 'health_check'
            test_value = 'test'
            
            cache.set(test_key, test_value, 10)
            retrieved_value = cache.get(test_key)
            cache.delete(test_key)
            
            response_time = time.time() - start_time
            
            if retrieved_value == test_value:
                return {
                    'status': 'healthy',
                    'response_time': response_time,
                    'error': None
                }
            else:
                return {
                    'status': 'unhealthy',
                    'response_time': response_time,
                    'error': 'Cache read/write test failed'
                }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'response_time': None,
                'error': str(e)
            }
    
    @staticmethod
    def get_overall_health() -> Dict[str, Any]:
        """
        Get overall system health
        """
        return {
            'database': HealthChecker.check_database_health(),
            'cache': HealthChecker.check_cache_health(),
            'system': SystemMonitor.get_system_health(),
            'timestamp': timezone.now().isoformat()
        }


class MetricsCollector:
    """
    Metrics collection and reporting
    """
    
    def __init__(self):
        self.performance_monitor = PerformanceMonitor()
    
    def collect_metrics(self) -> Dict[str, Any]:
        """
        Collect all metrics
        """
        return {
            'performance': self.performance_monitor.get_metrics(),
            'database': {
                'query_count': DatabaseMonitor.get_query_count(),
                'slow_queries': len(DatabaseMonitor.get_slow_queries())
            },
            'system': SystemMonitor.get_system_health(),
            'health': HealthChecker.get_overall_health()
        }
    
    def log_metrics(self):
        """
        Log collected metrics
        """
        metrics = self.collect_metrics()
        logger.info(f"System metrics: {json.dumps(metrics, indent=2)}")
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """
        Get performance summary
        """
        return {
            'average_response_time': self.performance_monitor.get_average_response_time(),
            'cache_hit_rate': self.performance_monitor.get_cache_hit_rate(),
            'total_requests': self.performance_monitor.metrics['request_count'],
            'memory_usage': SystemMonitor.get_memory_usage()['percent'],
            'cpu_usage': SystemMonitor.get_cpu_usage()
        }


# Global instances
performance_monitor = PerformanceMonitor()
metrics_collector = MetricsCollector()
