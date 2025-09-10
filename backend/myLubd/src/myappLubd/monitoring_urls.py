"""
URL configuration for monitoring endpoints
"""
from django.urls import path
from . import monitoring_dashboard, monitoring_views

app_name = 'monitoring'

urlpatterns = [
    # Web interface
    path('', monitoring_views.monitoring_dashboard_view, name='dashboard_view'),
    path('dashboard/', monitoring_views.monitoring_dashboard_view, name='dashboard_view'),
    
    # API endpoints
    path('api/dashboard/', monitoring_dashboard.MonitoringDashboard.as_view(), name='dashboard'),
    path('api/data/', monitoring_views.monitoring_data_api, name='data'),
    path('api/export/', monitoring_views.monitoring_export, name='export'),
    path('api/alerts/', monitoring_views.monitoring_alerts, name='alerts'),
    path('api/history/', monitoring_views.monitoring_history, name='history'),
    path('api/clear-history/', monitoring_views.monitoring_clear_history, name='clear_history'),
    
    # Health checks
    path('health/', monitoring_dashboard.health_check, name='health'),
    path('health/database/', monitoring_dashboard.database_status, name='database_health'),
    path('health/cache/', monitoring_dashboard.cache_status, name='cache_health'),
    
    # Performance monitoring
    path('performance/', monitoring_dashboard.performance_summary, name='performance'),
    path('performance/reset/', monitoring_dashboard.reset_metrics, name='reset_metrics'),
    
    # System monitoring
    path('system/', monitoring_dashboard.system_resources, name='system_resources'),
    
    # Configuration
    path('config/', monitoring_dashboard.monitoring_config, name='config'),
]
