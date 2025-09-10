"""
Enhanced caching system with Redis support and advanced cache management
"""
import json
import hashlib
import time
from typing import Any, Optional, Callable, Dict, List
from django.core.cache import cache
from django.conf import settings
from django.core.cache.backends.redis import RedisCache
from functools import wraps
import logging

logger = logging.getLogger(__name__)


class RedisCacheManager:
    """
    Enhanced Redis cache manager with advanced features
    """
    
    def __init__(self):
        self.default_timeout = getattr(settings, 'CACHE_DEFAULT_TIMEOUT', 300)
        self.use_redis = hasattr(settings, 'CACHES') and 'redis' in settings.CACHES.get('default', {}).get('BACKEND', '')
    
    def get_or_set(self, key: str, callable: Callable, timeout: Optional[int] = None) -> Any:
        """
        Get value from cache or set it using the callable
        """
        timeout = timeout or self.default_timeout
        value = cache.get(key)
        
        if value is None:
            value = callable()
            cache.set(key, value, timeout)
            logger.debug(f"Cached value for key: {key}")
        else:
            logger.debug(f"Cache hit for key: {key}")
        
        return value
    
    def get_or_set_with_tags(self, key: str, callable: Callable, tags: List[str], timeout: Optional[int] = None) -> Any:
        """
        Get value from cache with tags for easier invalidation
        """
        timeout = timeout or self.default_timeout
        value = cache.get(key)
        
        if value is None:
            value = callable()
            cache.set(key, value, timeout)
            
            # Store tags for this key
            for tag in tags:
                tag_key = f"tag:{tag}:{key}"
                cache.set(tag_key, True, timeout)
            
            logger.debug(f"Cached value with tags {tags} for key: {key}")
        else:
            logger.debug(f"Cache hit for key: {key}")
        
        return value
    
    def invalidate_by_tags(self, tags: List[str]):
        """
        Invalidate cache entries by tags
        """
        if not self.use_redis:
            logger.warning("Tag-based invalidation requires Redis backend")
            return
        
        for tag in tags:
            pattern = f"tag:{tag}:*"
            try:
                # This requires Redis backend with delete_pattern support
                cache.delete_pattern(pattern)
                logger.info(f"Invalidated cache entries with tag: {tag}")
            except AttributeError:
                logger.warning("Cache backend doesn't support pattern deletion")
    
    def invalidate_pattern(self, pattern: str):
        """
        Invalidate cache entries matching a pattern
        """
        if not self.use_redis:
            logger.warning("Pattern invalidation requires Redis backend")
            return
        
        try:
            cache.delete_pattern(pattern)
            logger.info(f"Invalidated cache entries matching pattern: {pattern}")
        except AttributeError:
            logger.warning("Cache backend doesn't support pattern deletion")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics
        """
        if not self.use_redis:
            return {"backend": "local", "redis_available": False}
        
        try:
            # This would require Redis connection
            return {
                "backend": "redis",
                "redis_available": True,
                "info": "Redis stats would be available here"
            }
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {"backend": "redis", "redis_available": False, "error": str(e)}


class CacheDecorator:
    """
    Advanced cache decorators
    """
    
    @staticmethod
    def cache_result(key_prefix: str, timeout: int = 300, tags: Optional[List[str]] = None):
        """
        Decorator to cache function results with tags
        """
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            def wrapper(*args, **kwargs) -> Any:
                # Skip caching if disabled
                if not getattr(settings, 'USE_CACHE', True):
                    return func(*args, **kwargs)
                
                # Generate cache key
                cache_key = f"{key_prefix}:{hashlib.md5(str(args).encode() + str(kwargs).encode()).hexdigest()}"
                
                # Try to get from cache
                cached_result = cache.get(cache_key)
                if cached_result is not None:
                    logger.debug(f"Cache hit for key: {cache_key}")
                    return cached_result
                
                # Execute function and cache result
                result = func(*args, **kwargs)
                cache.set(cache_key, result, timeout)
                
                # Store tags if provided
                if tags:
                    for tag in tags:
                        tag_key = f"tag:{tag}:{cache_key}"
                        cache.set(tag_key, True, timeout)
                
                logger.debug(f"Cached result for key: {cache_key}")
                return result
            
            return wrapper
        return decorator
    
    @staticmethod
    def cache_with_version(key_prefix: str, version: str, timeout: int = 300):
        """
        Decorator to cache with version support
        """
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            def wrapper(*args, **kwargs) -> Any:
                if not getattr(settings, 'USE_CACHE', True):
                    return func(*args, **kwargs)
                
                cache_key = f"{key_prefix}:v{version}:{hashlib.md5(str(args).encode() + str(kwargs).encode()).hexdigest()}"
                
                cached_result = cache.get(cache_key)
                if cached_result is not None:
                    return cached_result
                
                result = func(*args, **kwargs)
                cache.set(cache_key, result, timeout)
                return result
            
            return wrapper
        return decorator


class CacheInvalidation:
    """
    Smart cache invalidation strategies
    """
    
    @staticmethod
    def invalidate_user_related_cache(user_id: int):
        """
        Invalidate all cache entries related to a user
        """
        patterns = [
            f"user:{user_id}:*",
            f"user_properties:{user_id}",
            f"user_jobs:{user_id}",
            f"user_stats:{user_id}",
            f"user_profile:{user_id}"
        ]
        
        for pattern in patterns:
            try:
                cache.delete_pattern(pattern)
                logger.info(f"Invalidated cache pattern: {pattern}")
            except AttributeError:
                cache.delete(pattern)
                logger.debug(f"Deleted cache key: {pattern}")
    
    @staticmethod
    def invalidate_property_related_cache(property_id: str):
        """
        Invalidate all cache entries related to a property
        """
        patterns = [
            f"property:{property_id}:*",
            f"property_rooms:{property_id}",
            f"property_jobs:{property_id}",
            f"property_stats:{property_id}"
        ]
        
        for pattern in patterns:
            try:
                cache.delete_pattern(pattern)
                logger.info(f"Invalidated cache pattern: {pattern}")
            except AttributeError:
                cache.delete(pattern)
                logger.debug(f"Deleted cache key: {pattern}")
    
    @staticmethod
    def invalidate_job_related_cache(job_id: str = None, user_id: int = None):
        """
        Invalidate job-related cache entries
        """
        patterns = ['jobs:', 'job_stats:']
        
        if job_id:
            patterns.extend([f'job:{job_id}:*'])
        
        if user_id:
            patterns.extend([f'user:{user_id}:jobs', f'user:{user_id}:stats'])
        
        for pattern in patterns:
            try:
                cache.delete_pattern(pattern)
                logger.info(f"Invalidated cache pattern: {pattern}")
            except AttributeError:
                cache.delete(pattern)
                logger.debug(f"Deleted cache key: {pattern}")


class CacheWarming:
    """
    Cache warming strategies
    """
    
    @staticmethod
    def warm_user_cache(user_id: int):
        """
        Warm cache for a specific user
        """
        from .models import User, Property, Job
        
        try:
            # Warm user properties cache
            user = User.objects.get(id=user_id)
            properties = Property.objects.filter(users=user).values('id', 'property_id', 'name')
            cache.set(f"user_properties:{user_id}", list(properties), 300)
            
            # Warm user jobs count
            jobs_count = Job.objects.filter(user=user).count()
            cache.set(f"user_jobs_count:{user_id}", jobs_count, 300)
            
            logger.info(f"Warmed cache for user: {user_id}")
        except Exception as e:
            logger.error(f"Failed to warm cache for user {user_id}: {e}")
    
    @staticmethod
    def warm_property_cache(property_id: str):
        """
        Warm cache for a specific property
        """
        from .models import Property, Room, Job
        
        try:
            property_obj = Property.objects.get(property_id=property_id)
            
            # Warm property rooms
            rooms = Room.objects.filter(properties=property_obj).values('id', 'name', 'room_type')
            cache.set(f"property_rooms:{property_id}", list(rooms), 300)
            
            # Warm property jobs count
            jobs_count = Job.objects.filter(rooms__properties=property_obj).count()
            cache.set(f"property_jobs_count:{property_id}", jobs_count, 300)
            
            logger.info(f"Warmed cache for property: {property_id}")
        except Exception as e:
            logger.error(f"Failed to warm cache for property {property_id}: {e}")


class CacheMetrics:
    """
    Cache performance metrics
    """
    
    def __init__(self):
        self.hit_count = 0
        self.miss_count = 0
        self.total_requests = 0
    
    def record_hit(self):
        """Record a cache hit"""
        self.hit_count += 1
        self.total_requests += 1
    
    def record_miss(self):
        """Record a cache miss"""
        self.miss_count += 1
        self.total_requests += 1
    
    def get_hit_rate(self) -> float:
        """Get cache hit rate"""
        if self.total_requests == 0:
            return 0.0
        return self.hit_count / self.total_requests
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            'hit_count': self.hit_count,
            'miss_count': self.miss_count,
            'total_requests': self.total_requests,
            'hit_rate': self.get_hit_rate()
        }


# Global cache manager instance
cache_manager = RedisCacheManager()
cache_invalidation = CacheInvalidation()
cache_warming = CacheWarming()
cache_metrics = CacheMetrics()
