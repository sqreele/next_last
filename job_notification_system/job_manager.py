from datetime import datetime, timedelta
from database import Job, JobStatus, init_db, get_session
from sqlalchemy import func
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class JobManager:
    def __init__(self, db_path='jobs.db'):
        self.engine = init_db(db_path)
        self.session = get_session(self.engine)
    
    def add_job(self, job_name, description=None):
        """Add a new job to the system"""
        job = Job(
            job_name=job_name,
            description=description,
            status=JobStatus.PENDING
        )
        self.session.add(job)
        self.session.commit()
        logger.info(f"Added new job: {job_name}")
        return job
    
    def update_job_status(self, job_id, status, error_message=None):
        """Update the status of a job"""
        job = self.session.query(Job).filter_by(id=job_id).first()
        if job:
            job.status = status
            if error_message:
                job.error_message = error_message
            job.updated_at = datetime.utcnow()
            self.session.commit()
            logger.info(f"Updated job {job_id} status to {status.value}")
        return job
    
    def get_daily_summary(self, date=None):
        """Get summary of jobs for a specific day"""
        if date is None:
            date = datetime.utcnow().date()
        
        start_of_day = datetime.combine(date, datetime.min.time())
        end_of_day = datetime.combine(date, datetime.max.time())
        
        # Get all jobs updated today
        jobs_today = self.session.query(Job).filter(
            Job.updated_at >= start_of_day,
            Job.updated_at <= end_of_day
        ).all()
        
        # Get status counts
        status_counts = self.session.query(
            Job.status,
            func.count(Job.id).label('count')
        ).filter(
            Job.updated_at >= start_of_day,
            Job.updated_at <= end_of_day
        ).group_by(Job.status).all()
        
        summary = {
            'date': date.strftime('%Y-%m-%d'),
            'total_jobs': len(jobs_today),
            'status_breakdown': {status.value: count for status, count in status_counts},
            'jobs': jobs_today
        }
        
        return summary
    
    def get_jobs_by_status(self, status, date=None):
        """Get all jobs with a specific status for a given date"""
        if date is None:
            date = datetime.utcnow().date()
        
        start_of_day = datetime.combine(date, datetime.min.time())
        end_of_day = datetime.combine(date, datetime.max.time())
        
        return self.session.query(Job).filter(
            Job.status == status,
            Job.updated_at >= start_of_day,
            Job.updated_at <= end_of_day
        ).all()
    
    def close(self):
        """Close the database session"""
        self.session.close()