import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from jinja2 import Template
import logging
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_username = os.getenv('SMTP_USERNAME')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        self.from_email = os.getenv('FROM_EMAIL')
        self.to_emails = os.getenv('TO_EMAILS', '').split(',')
        
        # Email template
        self.email_template = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c3e50; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .summary-box { background-color: #fff; padding: 15px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .status-badge { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; margin: 2px; }
        .status-pending { background-color: #f39c12; }
        .status-running { background-color: #3498db; }
        .status-completed { background-color: #27ae60; }
        .status-failed { background-color: #e74c3c; }
        .status-cancelled { background-color: #95a5a6; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #ecf0f1; font-weight: bold; }
        tr:hover { background-color: #f5f5f5; }
        .footer { margin-top: 30px; padding: 20px; text-align: center; color: #7f8c8d; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Daily Job Summary Report</h1>
            <p>Date: {{ summary.date }}</p>
        </div>
        
        <div class="content">
            <div class="summary-box">
                <h2>Summary Statistics</h2>
                <p><strong>Total Jobs Processed:</strong> {{ summary.total_jobs }}</p>
                
                <h3>Status Breakdown:</h3>
                <div>
                    {% for status, count in summary.status_breakdown.items() %}
                    <span class="status-badge status-{{ status }}">{{ status.upper() }}: {{ count }}</span>
                    {% endfor %}
                </div>
            </div>
            
            {% if summary.jobs %}
            <h2>Job Details</h2>
            <table>
                <thead>
                    <tr>
                        <th>Job ID</th>
                        <th>Job Name</th>
                        <th>Status</th>
                        <th>Description</th>
                        <th>Last Updated</th>
                        <th>Error Message</th>
                    </tr>
                </thead>
                <tbody>
                    {% for job in summary.jobs %}
                    <tr>
                        <td>{{ job.id }}</td>
                        <td>{{ job.job_name }}</td>
                        <td><span class="status-badge status-{{ job.status.value }}">{{ job.status.value.upper() }}</span></td>
                        <td>{{ job.description or '-' }}</td>
                        <td>{{ job.updated_at.strftime('%Y-%m-%d %H:%M:%S') }}</td>
                        <td>{{ job.error_message or '-' }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
            {% else %}
            <p>No jobs were processed today.</p>
            {% endif %}
        </div>
        
        <div class="footer">
            <p>This is an automated email from the Job Notification System.</p>
            <p>Generated at {{ generation_time }}</p>
        </div>
    </div>
</body>
</html>
"""
    
    def send_daily_summary(self, summary):
        """Send the daily job summary email"""
        if not self.smtp_username or not self.smtp_password:
            logger.error("SMTP credentials not configured. Please set up .env file.")
            return False
        
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"Daily Job Summary - {summary['date']}"
            msg['From'] = self.from_email
            msg['To'] = ', '.join(self.to_emails)
            
            # Render HTML content
            template = Template(self.email_template)
            html_content = template.render(
                summary=summary,
                generation_time=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            )
            
            # Attach HTML content
            html_part = MIMEText(html_content, 'html')
            msg.attach(html_part)
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Daily summary email sent successfully to {', '.join(self.to_emails)}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return False