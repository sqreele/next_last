"""
PDF Generation Utilities for Maintenance Reports
Provides clean, compact, and professional maintenance report generation
"""

import os
import io
from datetime import datetime
from django.conf import settings
from django.utils import timezone
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    PageBreak, Image, ListFlowable, ListItem, PageTemplate, 
    Frame, NextPageTemplate, BaseDocTemplate
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from PIL import Image as PILImage
import logging

logger = logging.getLogger(__name__)

class MaintenanceReportGenerator:
    """Generates clean and compact maintenance PDF reports"""
    
    def __init__(self, title="Maintenance Report", include_images=True, compact_mode=True):
        self.title = title
        self.include_images = include_images
        self.compact_mode = compact_mode
        self.styles = self._create_styles()
        
    def _create_styles(self):
        """Create custom styles for the report"""
        styles = getSampleStyleSheet()
        
        # Title style
        styles.add(ParagraphStyle(
            name='CustomTitle',
            parent=styles['Title'],
            fontSize=18,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.darkblue
        ))
        
        # Section header style
        styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=12,
            spaceBefore=16,
            textColor=colors.darkblue,
            borderWidth=1,
            borderColor=colors.lightgrey,
            borderPadding=6,
            backColor=colors.lightgrey
        ))
        
        # Compact text style
        styles.add(ParagraphStyle(
            name='CompactText',
            parent=styles['Normal'],
            fontSize=9,
            spaceAfter=6,
            spaceBefore=6,
            leading=11
        ))
        
        # Status style
        styles.add(ParagraphStyle(
            name='Status',
            parent=styles['Normal'],
            fontSize=8,
            spaceAfter=4,
            spaceBefore=4,
            alignment=TA_CENTER,
            borderWidth=1,
            borderPadding=3
        ))
        
        return styles
    
    def _create_header_footer(self, canvas, doc):
        """Create header and footer for each page"""
        canvas.saveState()
        
        # Header
        canvas.setFont('Helvetica-Bold', 10)
        canvas.setFillColor(colors.darkblue)
        canvas.drawString(doc.leftMargin, doc.height + doc.topMargin + 10, self.title)
        
        # Footer
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.grey)
        canvas.drawString(doc.leftMargin, doc.bottomMargin - 10, 
                        f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        canvas.drawRightString(doc.width + doc.leftMargin, doc.bottomMargin - 10, 
                             f"Page {doc.page}")
        
        canvas.restoreState()
    
    def _get_status_color(self, status):
        """Get color for different status types"""
        status_colors = {
            'completed': colors.green,
            'pending': colors.orange,
            'overdue': colors.red,
            'in_progress': colors.blue,
            'cancelled': colors.grey
        }
        return status_colors.get(status.lower(), colors.black)
    
    def _format_date(self, date_obj):
        """Format date for display"""
        if not date_obj:
            return "Not set"
        if isinstance(date_obj, str):
            return date_obj
        return date_obj.strftime('%Y-%m-%d %H:%M')
    
    def _create_summary_table(self, data):
        """Create summary statistics table"""
        if not data:
            return []
        
        # Calculate statistics
        total = len(data)
        completed = len([item for item in data if getattr(item, 'completed_date', None)])
        pending = len([item for item in data if not getattr(item, 'completed_date', None) and 
                      getattr(item, 'scheduled_date', None) and 
                      getattr(item, 'scheduled_date') > timezone.now()])
        overdue = len([item for item in data if not getattr(item, 'completed_date', None) and 
                      getattr(item, 'scheduled_date', None) and 
                      getattr(item, 'scheduled_date') <= timezone.now()])
        
        summary_data = [
            ['Total Tasks', str(total)],
            ['Completed', str(completed)],
            ['Pending', str(pending)],
            ['Overdue', str(overdue)],
            ['Completion Rate', f"{(completed/total*100):.1f}%" if total > 0 else "0%"]
        ]
        
        summary_table = Table(summary_data, colWidths=[2*inch, 1*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        return [Paragraph("Summary Statistics", self.styles['SectionHeader']), 
                summary_table, Spacer(1, 12)]
    
    def _create_maintenance_item(self, item, index):
        """Create a compact maintenance item section"""
        elements = []
        
        # Item header with status
        status = "completed" if getattr(item, 'completed_date', None) else "pending"
        if status == "pending" and getattr(item, 'scheduled_date', None):
            if getattr(item, 'scheduled_date') <= timezone.now():
                status = "overdue"
        
        status_color = self._get_status_color(status)
        
        # Create compact header
        header_data = [
            [f"Task {index + 1}: {getattr(item, 'pmtitle', 'No Title')}", 
             f"Status: {status.upper()}", 
             f"ID: {getattr(item, 'pm_id', 'N/A')}"]
        ]
        
        header_table = Table(header_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
        header_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, 0), status_color),
            ('BACKGROUND', (1, 0), (2, 0), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('GRID', (0, 0), (-1, 0), 1, colors.black)
        ]))
        
        elements.append(header_table)
        elements.append(Spacer(1, 6))
        
        # Key details in compact format
        details = []
        
        # Scheduled date
        scheduled_date = getattr(item, 'scheduled_date', None)
        if scheduled_date:
            details.append(f"<b>Scheduled:</b> {self._format_date(scheduled_date)}")
        
        # Completed date
        completed_date = getattr(item, 'completed_date', None)
        if completed_date:
            details.append(f"<b>Completed:</b> {self._format_date(completed_date)}")
        
        # Frequency
        frequency = getattr(item, 'frequency', None)
        if frequency:
            details.append(f"<b>Frequency:</b> {frequency}")
        
        # Location info
        if hasattr(item, 'job') and item.job:
            if hasattr(item.job, 'rooms') and item.job.rooms.exists():
                room_names = [room.name for room in item.job.rooms.all()]
                details.append(f"<b>Location:</b> {', '.join(room_names)}")
        
        # Topics
        if hasattr(item, 'topics') and item.topics.exists():
            topic_names = [topic.name for topic in item.topics.all()]
            details.append(f"<b>Topics:</b> {', '.join(topic_names)}")
        
        if details:
            details_text = " | ".join(details)
            elements.append(Paragraph(details_text, self.styles['CompactText']))
            elements.append(Spacer(1, 4))
        
        # Notes (truncated if too long)
        notes = getattr(item, 'notes', None)
        if notes and len(notes) > 100:
            notes = notes[:100] + "..."
        if notes:
            elements.append(Paragraph(f"<b>Notes:</b> {notes}", self.styles['CompactText']))
            elements.append(Spacer(1, 4))
        
        # Procedure (truncated if too long)
        procedure = getattr(item, 'procedure', None)
        if procedure and len(procedure) > 150:
            procedure = procedure[:150] + "..."
        if procedure:
            elements.append(Paragraph(f"<b>Procedure:</b> {procedure}", self.styles['CompactText']))
        
        elements.append(Spacer(1, 8))
        
        return elements
    
    def generate_report(self, maintenance_data, output_stream=None):
        """Generate the complete maintenance report"""
        if output_stream is None:
            output_stream = io.BytesIO()
        
        # Create document with custom page template
        doc = BaseDocTemplate(output_stream, pagesize=A4)
        
        # Create page template with header/footer
        page_template = PageTemplate(
            id='CustomPage',
            frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height)],
            onPage=self._create_header_footer
        )
        doc.addPageTemplates([page_template])
        
        # Build story
        story = []
        
        # Title page
        story.append(Paragraph(self.title, self.styles['CustomTitle']))
        story.append(Spacer(1, 20))
        
        # Summary statistics
        story.extend(self._create_summary_table(maintenance_data))
        story.append(PageBreak())
        
        # Maintenance items
        if maintenance_data:
            story.append(Paragraph("Maintenance Tasks", self.styles['SectionHeader']))
            story.append(Spacer(1, 12))
            
            for index, item in enumerate(maintenance_data):
                story.extend(self._create_maintenance_item(item, index))
                
                # Add page break every 5 items for compact layout
                if (index + 1) % 5 == 0 and index < len(maintenance_data) - 1:
                    story.append(PageBreak())
                    story.append(Paragraph("Maintenance Tasks (Continued)", self.styles['SectionHeader']))
                    story.append(Spacer(1, 12))
        
        # Build PDF
        doc.build(story)
        
        if hasattr(output_stream, 'seek'):
            output_stream.seek(0)
        
        return output_stream
    
    def generate_compact_report(self, maintenance_data, output_stream=None):
        """Generate an ultra-compact version of the report"""
        if output_stream is None:
            output_stream = io.BytesIO()
        
        # Create document
        doc = SimpleDocTemplate(output_stream, pagesize=A4)
        
        # Build story
        story = []
        
        # Title
        story.append(Paragraph(self.title, self.styles['CustomTitle']))
        story.append(Spacer(1, 12))
        
        # Summary
        story.extend(self._create_summary_table(maintenance_data))
        story.append(Spacer(1, 12))
        
        # Compact table format
        if maintenance_data:
            # Create table headers
            headers = ['#', 'Task', 'Status', 'Scheduled', 'Location', 'Topics']
            table_data = [headers]
            
            for index, item in enumerate(maintenance_data):
                # Determine status
                status = "✓" if getattr(item, 'completed_date', None) else "⏳"
                if status == "⏳" and getattr(item, 'scheduled_date', None):
                    if getattr(item, 'scheduled_date') <= timezone.now():
                        status = "⚠"
                
                # Get location
                location = "N/A"
                if hasattr(item, 'job') and item.job:
                    if hasattr(item.job, 'rooms') and item.job.rooms.exists():
                        room_names = [room.name for room in item.job.rooms.all()]
                        location = ', '.join(room_names)
                
                # Get topics
                topics = "N/A"
                if hasattr(item, 'topics') and item.topics.exists():
                    topic_names = [topic.name for topic in item.topics.all()]
                    topics = ', '.join(topic_names)
                
                # Add row
                row = [
                    str(index + 1),
                    getattr(item, 'pmtitle', 'No Title')[:30] + "..." if len(getattr(item, 'pmtitle', 'No Title')) > 30 else getattr(item, 'pmtitle', 'No Title'),
                    status,
                    self._format_date(getattr(item, 'scheduled_date', None))[:10],
                    location[:20] + "..." if len(location) > 20 else location,
                    topics[:20] + "..." if len(topics) > 20 else topics
                ]
                table_data.append(row)
            
            # Create table
            table = Table(table_data, colWidths=[0.3*inch, 2.5*inch, 0.5*inch, 1*inch, 1.5*inch, 1.5*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.beige])
            ]))
            
            story.append(table)
        
        # Build PDF
        doc.build(story)
        
        if hasattr(output_stream, 'seek'):
            output_stream.seek(0)
        
        return output_stream
