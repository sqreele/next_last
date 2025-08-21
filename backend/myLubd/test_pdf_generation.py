#!/usr/bin/env python3
"""
Test script for Maintenance PDF Report Generation
Run this script to test the PDF generation functionality
"""

import os
import sys
import django
from datetime import datetime, timedelta

# Add the project directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.pdf_utils import MaintenanceReportGenerator
from myappLubd.models import PreventiveMaintenance, Job, Room, Property, Topic, User
from django.utils import timezone

def create_test_data():
    """Create some test data for PDF generation"""
    print("Creating test data...")
    
    # Create test property
    property_obj, created = Property.objects.get_or_create(
        property_id="TEST001",
        defaults={
            'name': 'Test Facility',
            'description': 'Test facility for PDF generation'
        }
    )
    
    # Create test room
    room, created = Room.objects.get_or_create(
        name='Test Room',
        defaults={
            'description': 'Test room for maintenance',
            'property': property_obj
        }
    )
    
    # Create test topic
    topic, created = Topic.objects.get_or_create(
        name='Equipment Maintenance',
        defaults={
            'description': 'General equipment maintenance tasks'
        }
    )
    
    # Create test job
    job, created = Job.objects.get_or_create(
        title='Test Maintenance Job',
        defaults={
            'description': 'Test job for PDF generation',
            'status': 'pending',
            'priority': 'medium'
        }
    )
    job.rooms.add(room)
    job.topics.add(topic)
    
    # Create test maintenance tasks
    maintenance_tasks = []
    
    # Completed task
    completed_task = PreventiveMaintenance.objects.create(
        pmtitle='Monthly Equipment Inspection',
        procedure='1. Check all moving parts\n2. Lubricate bearings\n3. Test safety systems',
        scheduled_date=timezone.now() - timedelta(days=5),
        completed_date=timezone.now() - timedelta(days=2),
        frequency='monthly',
        notes='Completed successfully. All systems operational.',
        job=job
    )
    completed_task.topics.add(topic)
    maintenance_tasks.append(completed_task)
    
    # Pending task
    pending_task = PreventiveMaintenance.objects.create(
        pmtitle='Quarterly System Calibration',
        procedure='1. Calibrate sensors\n2. Adjust parameters\n3. Run test cycles',
        scheduled_date=timezone.now() + timedelta(days=10),
        frequency='quarterly',
        notes='Scheduled for next week. Tools and materials ready.',
        job=job
    )
    pending_task.topics.add(topic)
    maintenance_tasks.append(pending_task)
    
    # Overdue task
    overdue_task = PreventiveMaintenance.objects.create(
        pmtitle='Annual Safety Review',
        procedure='1. Review safety protocols\n2. Update procedures\n3. Train staff',
        scheduled_date=timezone.now() - timedelta(days=15),
        frequency='annual',
        notes='Overdue. Need to reschedule immediately.',
        job=job
    )
    overdue_task.topics.add(topic)
    maintenance_tasks.append(overdue_task)
    
    print(f"Created {len(maintenance_tasks)} test maintenance tasks")
    return maintenance_tasks

def test_pdf_generation():
    """Test the PDF generation functionality"""
    print("Testing PDF generation...")
    
    # Create test data
    maintenance_data = create_test_data()
    
    # Test detailed report
    print("Generating detailed report...")
    generator = MaintenanceReportGenerator(
        title="Test Maintenance Report",
        include_images=False,
        compact_mode=False
    )
    
    detailed_output = generator.generate_report(maintenance_data)
    
    # Save detailed report
    with open('test_detailed_report.pdf', 'wb') as f:
        f.write(detailed_output.getvalue())
    print("Detailed report saved as 'test_detailed_report.pdf'")
    
    # Test compact report
    print("Generating compact report...")
    compact_output = generator.generate_compact_report(maintenance_data)
    
    # Save compact report
    with open('test_compact_report.pdf', 'wb') as f:
        f.write(compact_output.getvalue())
    print("Compact report saved as 'test_compact_report.pdf'")
    
    print("PDF generation test completed successfully!")
    print("Files generated:")
    print("- test_detailed_report.pdf")
    print("- test_compact_report.pdf")

if __name__ == '__main__':
    try:
        test_pdf_generation()
    except Exception as e:
        print(f"Error during testing: {e}")
        import traceback
        traceback.print_exc()
