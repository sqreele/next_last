"""
Cache utilities for the PCMS API
"""
from django.core.cache import cache
from django.conf import settings
import hashlib
import json
from functools import wraps
from typing import Any, Optional, Callable
import logging

logger = logging.getLogger(__name__)


def make_cache_key(prefix: str, *args, **kwargs) -> str:
    """
    Generate a cache key from prefix and arguments
    """
    key_parts = [prefix]
    
    # Add positional arguments
    for arg in args:
        if isinstance(arg, (list, dict)):
            key_parts.append(hashlib.md5(json.dumps(arg, sort_keys=True).encode()).hexdigest())
        else:
            key_parts.append(str(arg))
    
    # Add keyword arguments
    if kwargs:
        sorted_kwargs = sorted(kwargs.items())
        kwargs_str = json.dumps(sorted_kwargs)
        key_parts.append(hashlib.md5(kwargs_str.encode()).hexdigest())
    
    return ':'.join(key_parts)


def cache_result(cache_key_prefix: str, timeout: int = 300):
    """
    Decorator to cache function results
    
    Args:
        cache_key_prefix: Prefix for the cache key
        timeout: Cache timeout in seconds (default: 5 minutes)
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Skip caching if disabled
            if not getattr(settings, 'USE_CACHE', True):
                return func(*args, **kwargs)
            
            # Generate cache key
            cache_key = make_cache_key(cache_key_prefix, *args, **kwargs)
            
            # Try to get from cache
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                logger.debug(f"Cache hit for key: {cache_key}")
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            cache.set(cache_key, result, timeout)
            logger.debug(f"Cached result for key: {cache_key}")
            
            return result
        
        return wrapper
    return decorator


def invalidate_cache(pattern: str) -> None:
    """
    Invalidate cache entries matching a pattern
    
    Args:
        pattern: Cache key pattern to match
    """
    if hasattr(cache, 'delete_pattern'):
        # Redis backend supports pattern deletion
        cache.delete_pattern(f"*{pattern}*")
    else:
        # Fallback for other cache backends
        logger.warning("Cache backend doesn't support pattern deletion")


class CacheManager:
    """
    Manager class for handling cache operations
    """
    
    @staticmethod
    def get_or_set(key: str, callable: Callable, timeout: int = 300) -> Any:
        """
        Get value from cache or set it using the callable
        """
        value = cache.get(key)
        if value is None:
            value = callable()
            cache.set(key, value, timeout)
        return value
    
    @staticmethod
    def invalidate_job_cache(user_id: Optional[int] = None, property_id: Optional[str] = None):
        """
        Invalidate job-related cache entries
        """
        patterns = ['jobs:', 'job_stats:']
        
        if user_id:
            patterns.extend([f'user:{user_id}:jobs', f'user:{user_id}:stats'])
        
        if property_id:
            patterns.extend([f'property:{property_id}:jobs', f'property:{property_id}:stats'])
        
        for pattern in patterns:
            invalidate_cache(pattern)
    
    @staticmethod
    def invalidate_property_cache():
        """
        Invalidate property-related cache entries
        """
        invalidate_cache('properties:')
    
    @staticmethod
    def invalidate_pm_cache(pm_id: Optional[str] = None):
        """
        Invalidate preventive maintenance cache entries
        """
        if pm_id:
            invalidate_cache(f'pm:{pm_id}')
        invalidate_cache('pm:stats')
        invalidate_cache('pm:list')