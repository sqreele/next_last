#!/usr/bin/env python3
"""
Test script for Admin PDF Export (Job List)
Tests the font registration fix for Thai fonts
"""

import os
import sys
import django

# Add the project directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myLubd.settings')
django.setup()

from myappLubd.models import Job
from myappLubd.admin import JobAdmin
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory
from io import BytesIO

def test_pdf_export():
    """Test the admin PDF export functionality with font fix"""
    print("=" * 60)
    print("Testing Admin PDF Export with Thai Font Fix")
    print("=" * 60)
    
    # Create a mock request
    factory = RequestFactory()
    request = factory.get('/admin/myappLubd/job/')
    
    # Create admin instance
    admin_site = AdminSite()
    job_admin = JobAdmin(Job, admin_site)
    
    # Get some jobs to export
    queryset = Job.objects.all()[:5]  # Get first 5 jobs
    
    if not queryset.exists():
        print("⚠️  No jobs found in database. Creating a test job...")
        from myappLubd.models import User, Property
        
        # Get or create a test user
        user, _ = User.objects.get_or_create(
            username='test_pdf_user',
            defaults={'email': 'test@example.com'}
        )
        
        # Create a test job
        job = Job.objects.create(
            title='Test PDF Export Job',
            description='Testing PDF export with Thai font fix',
            user=user,
            status='pending'
        )
        queryset = Job.objects.filter(id=job.id)
        print(f"✅ Created test job: {job.title}")
    
    print(f"\nExporting {queryset.count()} job(s) to PDF...")
    
    try:
        # Call the export action
        response = job_admin.export_jobs_pdf(request, queryset)
        
        # Check if response is valid
        if response and hasattr(response, 'content'):
            content = response.content
            
            # Save to file for inspection
            output_file = 'test_admin_export.pdf'
            with open(output_file, 'wb') as f:
                f.write(content)
            
            file_size = len(content)
            print(f"\n✅ PDF export successful!")
            print(f"   - File size: {file_size:,} bytes")
            print(f"   - Saved as: {output_file}")
            
            # Verify PDF signature
            if content[:4] == b'%PDF':
                print(f"   - Valid PDF signature: ✅")
            else:
                print(f"   - Invalid PDF signature: ❌")
                return False
            
            # Check for Thai font family messages in logs
            print("\n📋 Font Registration Status:")
            print("   Check Django logs for messages like:")
            print("   - 'Thai font family Sarabun already registered and working'")
            print("   - 'Thai font family Sarabun registered successfully'")
            print("   - 'Thai font family mapping verification failed' (if fonts not available)")
            
            return True
            
        else:
            print("❌ Export failed: No response content")
            return False
            
    except Exception as e:
        print(f"\n❌ Error during PDF export:")
        print(f"   {type(e).__name__}: {e}")
        
        # Check if it's the font error we're trying to fix
        if "Can't map determine family/bold/italic" in str(e):
            print("\n   ⚠️  This is the font mapping error we're trying to fix!")
            print("   The fix should prevent this error.")
        
        import traceback
        print("\nFull traceback:")
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("\nStarting PDF export test...\n")
    success = test_pdf_export()
    print("\n" + "=" * 60)
    if success:
        print("✅ TEST PASSED: PDF export working correctly")
    else:
        print("❌ TEST FAILED: PDF export encountered errors")
    print("=" * 60)
    sys.exit(0 if success else 1)
