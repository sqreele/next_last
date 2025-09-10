"""
Database query optimizations and performance improvements
"""
from django.db import models
from django.db.models import Prefetch, Q, F, Count, Case, When, Value
from django.db.models.functions import Coalesce
from django.core.cache import cache
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


class QueryOptimizer:
    """
    Utility class for optimizing database queries
    """
    
    @staticmethod
    def get_optimized_job_queryset():
        """
        Get optimized queryset for Job model with proper select_related and prefetch_related
        """
        return Job.objects.select_related(
            'user',
            'updated_by'
        ).prefetch_related(
            'rooms__properties',
            'topics',
            'job_images__uploaded_by'
        ).annotate(
            # Add computed fields to reduce database hits
            rooms_count=Count('rooms', distinct=True),
            topics_count=Count('topics', distinct=True),
            images_count=Count('job_images', distinct=True)
        )
    
    @staticmethod
    def get_optimized_preventive_maintenance_queryset():
        """
        Get optimized queryset for PreventiveMaintenance model
        """
        return PreventiveMaintenance.objects.select_related(
            'job',
            'created_by'
        ).prefetch_related(
            'topics',
            'machines__property',
            'job__rooms__properties'
        ).annotate(
            # Add computed fields
            topics_count=Count('topics', distinct=True),
            machines_count=Count('machines', distinct=True),
            is_overdue=Case(
                When(
                    completed_date__isnull=True,
                    scheduled_date__lt=models.functions.Now(),
                    then=Value(True)
                ),
                default=Value(False),
                output_field=models.BooleanField()
            )
        )
    
    @staticmethod
    def get_optimized_property_queryset():
        """
        Get optimized queryset for Property model
        """
        return Property.objects.prefetch_related(
            'rooms',
            'users',
            'machines'
        ).annotate(
            rooms_count=Count('rooms', distinct=True),
            users_count=Count('users', distinct=True),
            machines_count=Count('machines', distinct=True)
        )


class CacheOptimizer:
    """
    Utility class for cache optimization
    """
    
    @staticmethod
    def get_cached_user_properties(user_id: int, timeout: int = 300) -> List[Dict]:
        """
        Get user properties with caching
        """
        cache_key = f"user_properties:{user_id}"
        cached_data = cache.get(cache_key)
        
        if cached_data is not None:
            logger.debug(f"Cache hit for user properties: {user_id}")
            return cached_data
        
        # Fetch from database
        from .models import Property
        properties = Property.objects.filter(users__id=user_id).values(
            'id', 'property_id', 'name', 'description'
        )
        
        data = list(properties)
        cache.set(cache_key, data, timeout)
        logger.debug(f"Cached user properties for user: {user_id}")
        
        return data
    
    @staticmethod
    def invalidate_user_cache(user_id: int):
        """
        Invalidate user-related cache entries
        """
        cache_patterns = [
            f"user_properties:{user_id}",
            f"user_jobs:{user_id}",
            f"user_stats:{user_id}"
        ]
        
        for pattern in cache_patterns:
            cache.delete(pattern)
            logger.debug(f"Invalidated cache: {pattern}")


class PerformanceMonitor:
    """
    Performance monitoring utilities
    """
    
    @staticmethod
    def log_slow_query(query, execution_time: float, threshold: float = 0.1):
        """
        Log slow queries for monitoring
        """
        if execution_time > threshold:
            logger.warning(
                f"Slow query detected: {execution_time:.3f}s - {query}"
            )
    
    @staticmethod
    def get_query_count():
        """
        Get current query count (for debugging)
        """
        from django.db import connection
        return len(connection.queries)


class SerializerOptimizer:
    """
    Optimize serializer performance
    """
    
    @staticmethod
    def optimize_job_serializer_data(jobs, request):
        """
        Optimize job serializer data to reduce database hits
        """
        # Pre-fetch related data in bulk
        job_ids = [job.id for job in jobs]
        
        # Get all related data in single queries
        from .models import JobImage, Topic, Room
        
        job_images = JobImage.objects.filter(job_id__in=job_ids).select_related('uploaded_by')
        topics = Topic.objects.filter(jobs__id__in=job_ids).distinct()
        rooms = Room.objects.filter(jobs__id__in=job_ids).prefetch_related('properties')
        
        # Create lookup dictionaries
        images_by_job = {}
        for image in job_images:
            if image.job_id not in images_by_job:
                images_by_job[image.job_id] = []
            images_by_job[image.job_id].append(image)
        
        topics_by_job = {}
        for job in jobs:
            job_topics = topics.filter(jobs=job)
            topics_by_job[job.id] = list(job_topics)
        
        rooms_by_job = {}
        for job in jobs:
            job_rooms = rooms.filter(jobs=job)
            rooms_by_job[job.id] = list(job_rooms)
        
        return {
            'images_by_job': images_by_job,
            'topics_by_job': topics_by_job,
            'rooms_by_job': rooms_by_job
        }


class DatabaseIndexOptimizer:
    """
    Suggest and create database indexes for better performance
    """
    
    @staticmethod
    def get_recommended_indexes():
        """
        Get recommended database indexes
        """
        return {
            'Job': [
                'status',
                'created_at',
                'is_preventivemaintenance',
                'user_id',
                'updated_at'
            ],
            'PreventiveMaintenance': [
                'scheduled_date',
                'completed_date',
                'frequency',
                'status',
                'created_by_id'
            ],
            'Property': [
                'name',
                'is_preventivemaintenance'
            ],
            'Room': [
                'room_type',
                'is_active',
                'name'
            ],
            'Machine': [
                'status',
                'property_id',
                'last_maintenance_date'
            ]
        }
    
    @staticmethod
    def create_performance_indexes():
        """
        Create performance indexes (run as migration)
        """
        from django.db import connection
        
        indexes = [
            # Job indexes
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_status_created ON myappLubd_job (status, created_at);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_user_status ON myappLubd_job (user_id, status);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_pm_created ON myappLubd_job (is_preventivemaintenance, created_at);",
            
            # PreventiveMaintenance indexes
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_scheduled ON myappLubd_preventivemaintenance (scheduled_date);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_completed ON myappLubd_preventivemaintenance (completed_date);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_frequency ON myappLubd_preventivemaintenance (frequency);",
            
            # Property indexes
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_pm ON myappLubd_property (is_preventivemaintenance);",
            
            # Room indexes
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_type_active ON myappLubd_room (room_type, is_active);",
            
            # Machine indexes
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machine_status ON myappLubd_machine (status);",
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machine_property ON myappLubd_machine (property_id);",
        ]
        
        with connection.cursor() as cursor:
            for index_sql in indexes:
                try:
                    cursor.execute(index_sql)
                    logger.info(f"Created index: {index_sql}")
                except Exception as e:
                    logger.error(f"Failed to create index: {e}")


class MemoryOptimizer:
    """
    Memory usage optimization utilities
    """
    
    @staticmethod
    def optimize_image_processing():
        """
        Optimize image processing to reduce memory usage
        """
        return {
            'max_size': (800, 800),
            'quality': 85,
            'format': 'JPEG',
            'optimize': True
        }
    
    @staticmethod
    def get_pagination_settings():
        """
        Get optimized pagination settings
        """
        return {
            'default_page_size': 25,
            'max_page_size': 100,
            'large_page_size': 50,
            'small_page_size': 10
        }
