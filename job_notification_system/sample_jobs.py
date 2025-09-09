"""
Sample script to populate the database with test jobs
"""
from job_manager import JobManager, JobStatus
import random
from datetime import datetime, timedelta

def create_sample_jobs():
    manager = JobManager()
    
    # Sample job names
    job_names = [
        "Data Backup",
        "Report Generation",
        "Database Cleanup",
        "User Sync",
        "Log Analysis",
        "Email Campaign",
        "System Maintenance",
        "API Health Check",
        "Cache Clear",
        "File Processing"
    ]
    
    # Create sample jobs with different statuses
    for i, job_name in enumerate(job_names):
        # Add job
        job = manager.add_job(
            job_name=f"{job_name} - {datetime.now().strftime('%Y%m%d')}",
            description=f"Automated {job_name.lower()} task"
        )
        
        # Randomly assign status
        status_choices = [
            (JobStatus.COMPLETED, None),
            (JobStatus.FAILED, "Connection timeout"),
            (JobStatus.RUNNING, None),
            (JobStatus.PENDING, None),
            (JobStatus.CANCELLED, None)
        ]
        
        status, error = random.choice(status_choices)
        
        # Update job status
        manager.update_job_status(job.id, status, error)
        
        print(f"Created job: {job.job_name} with status {status.value}")
    
    # Get and print summary
    summary = manager.get_daily_summary()
    print(f"\nDaily Summary for {summary['date']}:")
    print(f"Total Jobs: {summary['total_jobs']}")
    print("Status Breakdown:")
    for status, count in summary['status_breakdown'].items():
        print(f"  {status}: {count}")
    
    manager.close()

if __name__ == "__main__":
    create_sample_jobs()