import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import PreventiveMaintenance, Property


logger = logging.getLogger(__name__)


# Maintenance PDF Report Generation
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def generate_maintenance_pdf_report(request):
    """
    Generate a clean and compact maintenance PDF report
    Supports filtering and different report formats
    """
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
            'job__rooms__properties'
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
            queryset = queryset.filter(job__rooms__properties__property_id=property_id)
            report_property = Property.objects.filter(property_id=property_id).select_related('tenant').first()
        else:
            report_property = None
        
        # Filter by user access (only show maintenance for properties user has access to)
        if not request.user.is_staff:
            user_properties = Property.objects.filter(users=request.user)
            queryset = queryset.filter(job__rooms__properties__in=user_properties)
        
        # Order by scheduled date
        queryset = queryset.order_by('scheduled_date')
        
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

