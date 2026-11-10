"""Pm Reports definitions."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from ..models import Property, Room, Topic, Job, PreventiveMaintenance
from ..serializers import RoomSerializer, TopicSerializer, JobSerializer, PropertyPMStatusSerializer
from django.shortcuts import get_object_or_404
import logging
from django.http import HttpResponse
from ..tenancy import get_accessible_jobs, restrict_pm_for_company_technicians, get_accessible_properties
from ..timezones import object_timezone
from ..plan_capabilities import require_request_feature

logger = logging.getLogger('myappLubd.views')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_data(request):
    """
    Get aggregated preventive maintenance data for all properties the user has access to.
    """
    require_request_feature(request, 'preventive_maintenance')
    logger.info(f"get_preventive_maintenance_data called by user: {request.user.username}")
    try:
        # Get properties accessible to the current user
        user_properties = get_accessible_properties(request.user)
        logger.info(f"Found {user_properties.count()} properties for user")

        # Get preventive maintenance jobs for these properties
        pm_jobs = get_accessible_jobs(request.user).filter(
            property__in=user_properties,
            is_preventivemaintenance=True
        ).select_related('user').prefetch_related('rooms', 'topics')

        # Get counts by status
        status_counts = {
            'total': pm_jobs.count(),
            'pending': pm_jobs.filter(status='pending').count(),
            'in_progress': pm_jobs.filter(status='in_progress').count(),
            'completed': pm_jobs.filter(status='completed').count(),
            'waiting_sparepart': pm_jobs.filter(status='waiting_sparepart').count(),
            'cancelled': pm_jobs.filter(status='cancelled').count(),
        }

        # Calculate completion rate
        completion_rate = 0
        if status_counts['total'] > 0:
            completion_rate = (status_counts['completed'] / status_counts['total']) * 100

        # Return aggregated data
        return Response({
            'status_counts': status_counts,
            'completion_rate': completion_rate,
            'property_count': user_properties.count(),
        })
    except Exception as e:
        logger.exception(f"Error in get_preventive_maintenance_data: {str(e)}")
        return Response(
            {"detail": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_jobs(request):
    """Get jobs marked for preventive maintenance"""
    require_request_feature(request, 'preventive_maintenance')
    # Get query parameters
    property_id = request.query_params.get('property_id')
    status_param = request.query_params.get('status')
    limit = request.query_params.get('limit', 50)  # Default to 50 jobs
    user_filter = request.query_params.get('user_id')

    # Build base query
    query = get_accessible_jobs(request.user).filter(is_preventivemaintenance=True)

    # Add property filter if provided
    if property_id:
        try:
            property_obj = get_object_or_404(Property, property_id=property_id)
            if not get_accessible_properties(request.user).filter(pk=property_obj.pk).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            query = query.filter(property=property_obj)
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = get_accessible_properties(request.user)
        query = query.filter(property__in=user_properties)

    # Add status filter if provided
    if status_param:
        query = query.filter(status=status_param)

    # Add user filter if provided (supports numeric id or username)
    if user_filter and str(user_filter).lower() != 'all':
        try:
            query = query.filter(user_id=int(user_filter))
        except (TypeError, ValueError):
            query = query.filter(user__username=str(user_filter))

    # Apply distinct, select related, and prefetch related for efficiency
    query = query.distinct().select_related('user').prefetch_related(
        'rooms', 'topics', 'job_images'
    )

    # Apply limit
    if limit and limit.isdigit():
        query = query[:int(limit)]

    # Serialize and return
    serializer = JobSerializer(query, many=True, context={'request': request})
    return Response({'jobs': serializer.data, 'count': len(serializer.data)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_rooms(request):
    """Get rooms with preventive maintenance jobs"""
    require_request_feature(request, 'preventive_maintenance')

    # Get property_id from query params
    property_id = request.query_params.get('property_id')

    # Start with rooms that have PM jobs
    rooms_with_pm = Room.objects.filter(
        jobs__is_preventivemaintenance=True
    ).distinct()

    # Add property filter if provided
    if property_id:
        try:
            property_obj = get_object_or_404(Property, property_id=property_id)
            # Check user has access to this property
            if not get_accessible_properties(request.user).filter(pk=property_obj.pk).exists():
                return Response(
                    {"detail": "You do not have permission to access this property"},
                    status=status.HTTP_403_FORBIDDEN
                )
            rooms_with_pm = rooms_with_pm.filter(property=property_obj)
        except Property.DoesNotExist:
            return Response(
                {"detail": f"Property with ID {property_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # If no property specified, filter by user's properties
        user_properties = get_accessible_properties(request.user)
        rooms_with_pm = rooms_with_pm.filter(property__in=user_properties)

    # Serialize and return
    serializer = RoomSerializer(rooms_with_pm, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_preventive_maintenance_topics(request):
    """Get topics used in preventive maintenance jobs"""
    require_request_feature(request, 'preventive_maintenance')

    # Get user's properties
    user_properties = get_accessible_properties(request.user)

    # Get topics from PM jobs for user's properties
    topics = Topic.objects.filter(
        jobs__is_preventivemaintenance=True,
        jobs__property__in=user_properties
    ).distinct()

    # Serialize and return
    serializer = TopicSerializer(topics, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def property_is_preventivemaintenance(request, property_id):
    """Check if a property has preventive maintenance jobs"""
    require_request_feature(request, 'preventive_maintenance', property_id=property_id)

    # Get the property
    property_instance = get_object_or_404(Property, property_id=property_id)

    # Check user has access to this property
    if not get_accessible_properties(request.user).filter(pk=property_instance.pk).exists():
        return Response(
            {"detail": "You do not have permission to access this property"},
            status=status.HTTP_403_FORBIDDEN
        )

    # Check if property has any PM jobs
    has_pm_jobs = Job.objects.filter(
        property=property_instance,
        is_preventivemaintenance=True
    ).exists()

    # Update the property field
    if property_instance.is_preventivemaintenance != has_pm_jobs:
        property_instance.is_preventivemaintenance = has_pm_jobs
        property_instance.save()

    # Serialize and return
    serializer = PropertyPMStatusSerializer(property_instance)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def generate_maintenance_pdf_report(request):
    """
    Generate a clean and compact maintenance PDF report
    Supports filtering and different report formats
    """
    require_request_feature(request, 'advanced_reports')
    try:
        from ..pdf_utils import MaintenanceReportGenerator
        from ..timezones import localtime_for, object_timezone
        from django.http import HttpResponse
        import io

        # Get query parameters
        report_type = request.query_params.get('type', 'detailed')  # 'detailed' or 'compact'
        include_images = request.query_params.get('include_images', 'false').lower() == 'true'
        title = request.query_params.get('title', 'Maintenance Report')

        # Get filter parameters
        status_filter = request.query_params.get('status')
        frequency_filter = request.query_params.get('frequency')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        topic_id = request.query_params.get('topic_id')
        property_id = request.query_params.get('property_id')

        # Build queryset
        queryset = PreventiveMaintenance.objects.select_related(
            'job'
        ).prefetch_related(
            'topics',
            'job__rooms',
            'job__property'
        )

        # Apply filters
        if status_filter:
            now = timezone.now()
            if status_filter == 'completed':
                queryset = queryset.filter(completed_date__isnull=False)
            elif status_filter == 'pending':
                queryset = queryset.filter(completed_date__isnull=True, scheduled_date__gte=now)
            elif status_filter == 'overdue':
                queryset = queryset.filter(completed_date__isnull=True, scheduled_date__lt=now)

        if frequency_filter and frequency_filter != 'all':
            queryset = queryset.filter(frequency=frequency_filter)

        if date_from:
            queryset = queryset.filter(scheduled_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(scheduled_date__lte=date_to)

        if topic_id:
            queryset = queryset.filter(topics__id=topic_id)

        if property_id:
            queryset = queryset.filter(job__property__property_id=property_id)
            report_property = Property.objects.filter(property_id=property_id).select_related('tenant').first()
        else:
            report_property = None

        # Filter by user access (only show maintenance for properties user has access to)
        if not request.user.is_superuser:
            user_properties = get_accessible_properties(request.user)
            queryset = queryset.filter(job__property__in=user_properties)

        # Order by scheduled date
        queryset = restrict_pm_for_company_technicians(queryset, request.user).order_by('scheduled_date')

        # Get the data
        maintenance_data = list(queryset.distinct())

        if not maintenance_data:
            return Response({
                'error': 'No maintenance data found for the specified filters'
            }, status=status.HTTP_404_NOT_FOUND)

        report_tz = object_timezone(report_property or maintenance_data[0])

        # Create PDF generator
        generator = MaintenanceReportGenerator(
            title=title,
            include_images=include_images,
            compact_mode=(report_type == 'compact'),
            tzinfo=report_tz,
        )

        # Generate PDF
        output_stream = io.BytesIO()

        if report_type == 'compact':
            generator.generate_compact_report(maintenance_data, output_stream)
        else:
            generator.generate_report(maintenance_data, output_stream)

        # Create HTTP response
        response = HttpResponse(
            output_stream.getvalue(),
            content_type='application/pdf'
        )

        # Set filename
        timestamp = localtime_for(report_property or maintenance_data[0]).strftime('%Y%m%d_%H%M%S')
        filename = f"maintenance_report_{report_type}_{timestamp}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'

        return response

    except ImportError as e:
        logger.error(f"PDF generation failed - missing dependency: {str(e)}")
        return Response({
            'error': 'PDF generation not available - missing dependencies'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    except Exception as e:
        logger.exception(f"Error generating maintenance PDF report: {str(e)}")
        return Response({
            'error': f'Failed to generate PDF report: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
