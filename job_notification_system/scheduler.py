import schedule
import time
import logging
from datetime import datetime
from job_manager import JobManager
from email_service import EmailService
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DailyJobScheduler:
    def __init__(self):
        self.job_manager = JobManager()
        self.email_service = EmailService()
        self.schedule_time = os.getenv('DAILY_EMAIL_TIME', '09:00')
    
    def send_daily_report(self):
        """Send the daily job summary report"""
        logger.info("Generating daily job summary report...")
        
        try:
            # Get today's job summary
            summary = self.job_manager.get_daily_summary()
            
            # Send email
            if self.email_service.send_daily_summary(summary):
                logger.info("Daily report sent successfully")
            else:
                logger.error("Failed to send daily report")
                
        except Exception as e:
            logger.error(f"Error in daily report generation: {str(e)}")
    
    def run(self):
        """Start the scheduler"""
        # Schedule daily email
        schedule.every().day.at(self.schedule_time).do(self.send_daily_report)
        
        logger.info(f"Scheduler started. Daily emails will be sent at {self.schedule_time}")
        logger.info("Press Ctrl+C to stop the scheduler")
        
        # Keep the scheduler running
        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute

if __name__ == "__main__":
    scheduler = DailyJobScheduler()
    
    # For testing - uncomment to send a test email immediately
    # scheduler.send_daily_report()
    
    # Start the scheduler
    scheduler.run()