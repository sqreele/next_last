from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views
from .views import (
    RoomViewSet, TopicViewSet, JobViewSet, PropertyViewSet,
    UserProfileViewSet, UserViewSet, MachineViewSet,
    PreventiveMaintenanceImageUploadView, PreventiveMaintenanceViewSet,
    MaintenanceProcedureViewSet, UtilityConsumptionViewSet, InventoryViewSet,
    RosterLeaveViewSet
)

# Set the app name
app_name = 'myappLubd'

# Create a router and register viewsets
router = DefaultRouter()
# Register ViewSets with the router
router.register(r'properties', PropertyViewSet, basename='property')
router.register(r'rooms', RoomViewSet, basename='room')
router.register(r'topics', TopicViewSet, basename='topic')
router.register(r'jobs', JobViewSet, basename='job')
router.register(r'preventive-maintenance', PreventiveMaintenanceViewSet, basename='preventive-maintenance')
router.register(r'maintenance-procedures', MaintenanceProcedureViewSet, basename='maintenance-procedures')
router.register(r'machines', MachineViewSet, basename='machine')
router.register(r'users', UserViewSet, basename='user')
router.register(r'user-profiles', UserProfileViewSet, basename='user-profile')
router.register(r'utility-consumption', UtilityConsumptionViewSet, basename='utility-consumption')
router.register(r'inventory', InventoryViewSet, basename='inventory')
router.register(r'roster-leaves', RosterLeaveViewSet, basename='roster-leaves')


# Define the URL patterns
urlpatterns = [
    # Static file serving (fallback when Django's built-in serving fails)
    path('static/<path:file_path>', views.serve_static_file, name='serve_static_file'),
    
    # Preventive maintenance endpoints (MUST come before router to avoid conflicts)
    path('api/v1/preventive-maintenance/jobs/', views.get_preventive_maintenance_jobs, name='preventive_maintenance_jobs'),
    path('api/v1/preventive-maintenance/rooms/', views.get_preventive_maintenance_rooms, name='preventive_maintenance_rooms'),
    path('api/v1/preventive-maintenance/topics/', views.get_preventive_maintenance_topics, name='preventive_maintenance_topics'),
    path('api/v1/preventive-maintenance/<str:pm_id>/upload-images/', PreventiveMaintenanceImageUploadView.as_view(), name='upload_pm_images'),
    
    # API routes under 'api/v1/' (router must come after specific paths)
    path('api/v1/', include(router.urls)),
    
    # Authentication endpoints
    path('api/v1/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/auth/session/', views.CustomSessionView.as_view(), name='auth_session'),
    path('api/v1/auth/_log', views.log_view, name='log_view'),
    path('api/v1/auth/check/', views.auth_check, name='auth_check'),
    path('api/v1/auth/is-backend-admin/', views.is_backend_admin, name='is_backend_admin'),
    path('api/v1/auth/login/', views.login_view, name='login'),
    path('api/v1/auth/register/', views.RegisterView.as_view(), name='register'),
    path('api/v1/auth/google/', views.google_auth, name='google_auth'),
    path('api/v1/auth/providers/', views.auth_providers, name='auth_providers'),
    path('api/v1/auth/password/forgot/', views.forgot_password, name='forgot_password'),
    path('api/v1/auth/password/reset/', views.reset_password, name='reset_password'),
    path('api/v1/auth/profile/update/', views.update_user_profile, name='update_user_profile'),
    
    # Health check
    path('api/v1/health/', views.health_check, name='health_check'),

    # Dashboard summary
    path('api/v1/dashboard/summary/', views.get_dashboard_summary, name='dashboard_summary'),
    
    # CSRF token endpoint
    path('api/v1/csrf-token/', views.get_csrf_token, name='get_csrf_token'),
    
    # PDF Report Generation
    path('api/v1/maintenance/report/pdf/', views.generate_maintenance_pdf_report, name='maintenance_pdf_report'),
    
    # Property preventive maintenance
    path('api/v1/properties/<str:property_id>/is-preventivemaintenance/', views.property_is_preventivemaintenance, name='property_is_preventivemaintenance'),
    
    # Notification endpoints
    path('api/v1/notifications/overdue/', views.get_overdue_notifications, name='get_overdue_notifications'),
    path('api/v1/notifications/upcoming/', views.get_upcoming_notifications, name='get_upcoming_notifications'),
    path('api/v1/notifications/all/', views.get_all_notifications, name='get_all_notifications'),
    
    # Debug endpoints
    path('api/v1/debug/rooms/', views.debug_rooms, name='debug_rooms'),
    path('api/v1/test/rooms/all/', views.test_rooms_all, name='test_rooms_all'),
]
