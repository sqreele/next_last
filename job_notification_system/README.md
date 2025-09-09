# Job Notification System

An automated system that tracks job statuses and sends daily email summaries of all jobs processed during the day.

## Features

- **Job Tracking**: Track jobs with various statuses (Pending, Running, Completed, Failed, Cancelled)
- **Daily Summary**: Automatically generates daily reports of all jobs
- **Email Notifications**: Sends beautiful HTML email reports at a scheduled time
- **Status Breakdown**: Shows statistics for each job status
- **Detailed Job Information**: Includes job names, descriptions, timestamps, and error messages

## Installation

1. Clone or download this project
2. Install dependencies:
```bash
cd job_notification_system
pip install -r requirements.txt
```

3. Configure email settings:
```bash
cp .env.example .env
# Edit .env file with your email configuration
```

## Configuration

Edit the `.env` file with your email settings:

- `SMTP_SERVER`: Your SMTP server (default: smtp.gmail.com)
- `SMTP_PORT`: SMTP port (default: 587)
- `SMTP_USERNAME`: Your email address
- `SMTP_PASSWORD`: Your email password or app password
- `FROM_EMAIL`: Sender email address
- `TO_EMAILS`: Comma-separated list of recipient emails
- `DAILY_EMAIL_TIME`: Time to send daily emails (24-hour format, e.g., "09:00")

### Gmail Configuration
If using Gmail:
1. Enable 2-factor authentication
2. Generate an app password: https://myaccount.google.com/apppasswords
3. Use the app password in the `SMTP_PASSWORD` field

## Usage

### 1. Start the Scheduler
Run the scheduler to send daily emails automatically:
```bash
python scheduler.py
```

### 2. Add Jobs Programmatically
Use the JobManager to add and update jobs:
```python
from job_manager import JobManager, JobStatus

manager = JobManager()

# Add a new job
job = manager.add_job("Data Backup", "Daily backup of user data")

# Update job status
manager.update_job_status(job.id, JobStatus.COMPLETED)

# Get daily summary
summary = manager.get_daily_summary()
```

### 3. Test with Sample Data
Generate sample jobs for testing:
```bash
python sample_jobs.py
```

### 4. Manual Email Test
To test email sending immediately:
```python
from scheduler import DailyJobScheduler

scheduler = DailyJobScheduler()
scheduler.send_daily_report()
```

## API Reference

### JobManager Methods

- `add_job(job_name, description=None)`: Add a new job
- `update_job_status(job_id, status, error_message=None)`: Update job status
- `get_daily_summary(date=None)`: Get summary for a specific date
- `get_jobs_by_status(status, date=None)`: Get jobs by status

### Job Statuses

- `PENDING`: Job is waiting to start
- `RUNNING`: Job is currently executing
- `COMPLETED`: Job finished successfully
- `FAILED`: Job encountered an error
- `CANCELLED`: Job was cancelled

## Email Report Contents

The daily email includes:
- Date of the report
- Total number of jobs processed
- Status breakdown with counts
- Detailed table with:
  - Job ID
  - Job Name
  - Current Status
  - Description
  - Last Updated timestamp
  - Error messages (if any)

## Integration Examples

### With Cron Jobs
```python
from job_manager import JobManager, JobStatus
import subprocess

manager = JobManager()

# Track a cron job
job = manager.add_job("Nightly Backup", "Backup database")
manager.update_job_status(job.id, JobStatus.RUNNING)

try:
    # Run your actual job
    subprocess.run(["./backup.sh"], check=True)
    manager.update_job_status(job.id, JobStatus.COMPLETED)
except Exception as e:
    manager.update_job_status(job.id, JobStatus.FAILED, str(e))
```

### With Python Scripts
```python
from job_manager import JobManager, JobStatus

def track_job(job_name, description):
    def decorator(func):
        def wrapper(*args, **kwargs):
            manager = JobManager()
            job = manager.add_job(job_name, description)
            manager.update_job_status(job.id, JobStatus.RUNNING)
            
            try:
                result = func(*args, **kwargs)
                manager.update_job_status(job.id, JobStatus.COMPLETED)
                return result
            except Exception as e:
                manager.update_job_status(job.id, JobStatus.FAILED, str(e))
                raise
        return wrapper
    return decorator

# Usage
@track_job("Data Processing", "Process daily sales data")
def process_data():
    # Your job logic here
    pass
```

## Troubleshooting

1. **Email not sending**: Check SMTP credentials and firewall settings
2. **Database errors**: Ensure write permissions for the database file
3. **Schedule not working**: Verify the time format in .env file

## License

This project is open source and available under the MIT License.