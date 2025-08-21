#!/usr/bin/env python3
"""
Simple test script for PDF generation core functionality
This tests the PDF generation without Django dependencies
"""

import sys
import os

def test_dependencies():
    """Test if required packages are available"""
    print("Testing dependencies...")
    
    # Test ReportLab
    try:
        import reportlab
        print("✓ ReportLab is available")
    except ImportError:
        print("✗ ReportLab is NOT available")
        return False
    
    # Test Pillow
    try:
        from PIL import Image
        print("✓ Pillow is available")
    except ImportError:
        print("✗ Pillow is NOT available")
        return False
    
    # Test other required packages
    try:
        import io
        print("✓ io module is available")
    except ImportError:
        print("✗ io module is NOT available")
        return False
    
    try:
        from datetime import datetime
        print("✓ datetime module is available")
    except ImportError:
        print("✗ datetime module is NOT available")
        return False
    
    return True

def test_pdf_generation():
    """Test basic PDF generation functionality"""
    print("\nTesting PDF generation...")
    
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        import io
        
        # Create a simple PDF
        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=A4)
        
        # Create content
        styles = getSampleStyleSheet()
        story = []
        
        # Add title
        title = Paragraph("Test PDF Generation", styles['Title'])
        story.append(title)
        story.append(Spacer(1, 12))
        
        # Add content
        content = Paragraph("This is a test PDF to verify the PDF generation system is working correctly.", styles['Normal'])
        story.append(content)
        story.append(Spacer(1, 12))
        
        # Add timestamp
        timestamp = Paragraph(f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal'])
        story.append(timestamp)
        
        # Build PDF
        doc.build(story)
        
        # Check if PDF was generated
        pdf_content = output.getvalue()
        if len(pdf_content) > 0:
            print("✓ PDF generation successful")
            print(f"  PDF size: {len(pdf_content)} bytes")
            
            # Save test PDF
            with open('test_basic_pdf.pdf', 'wb') as f:
                f.write(pdf_content)
            print("  Test PDF saved as 'test_basic_pdf.pdf'")
            return True
        else:
            print("✗ PDF generation failed - empty output")
            return False
            
    except Exception as e:
        print(f"✗ PDF generation test failed: {e}")
        return False

def main():
    """Main test function"""
    print("=" * 50)
    print("Maintenance PDF Report System - Core Test")
    print("=" * 50)
    
    # Test dependencies
    if not test_dependencies():
        print("\n❌ Dependency test failed. Please install required packages:")
        print("   pip install reportlab Pillow")
        return False
    
    # Test PDF generation
    if not test_pdf_generation():
        print("\n❌ PDF generation test failed.")
        return False
    
    print("\n✅ All tests passed! The PDF generation system is ready.")
    print("\nNext steps:")
    print("1. Start Django server")
    print("2. Test the full API endpoint")
    print("3. Generate maintenance reports")
    
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
