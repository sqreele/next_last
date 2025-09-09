#!/usr/bin/env python3
"""
Main application entry point for the Job Notification System
"""
import argparse
import sys
from job_manager import JobManager, JobStatus
from email_service import EmailService
from scheduler import DailyJobScheduler
from datetime import datetime

def add_job(args):
    """Add a new job"""
    manager = JobManager()
    job = manager.add_job(args.name, args.description)
    print(f"Added job: {job.id} - {job.job_name}")
    manager.close()

def update_job(args):
    """Update job status"""
    manager = JobManager()
    status_map = {
        'pending': JobStatus.PENDING,
        'running': JobStatus.RUNNING,
        'completed': JobStatus.COMPLETED,
        'failed': JobStatus.FAILED,
        'cancelled': JobStatus.CANCELLED
    }
    
    status = status_map.get(args.status.lower())
    if not status:
        print(f"Invalid status: {args.status}")
        sys.exit(1)
    
    job = manager.update_job_status(args.id, status, args.error)
    if job:
        print(f"Updated job {job.id} to status: {status.value}")
    else:
        print(f"Job {args.id} not found")
    manager.close()

def show_summary(args):
    """Show daily summary"""
    manager = JobManager()
    date = datetime.strptime(args.date, '%Y-%m-%d').date() if args.date else None
    summary = manager.get_daily_summary(date)
    
    print(f"\nDaily Summary for {summary['date']}")
    print("=" * 50)
    print(f"Total Jobs: {summary['total_jobs']}")
    print("\nStatus Breakdown:")
    for status, count in summary['status_breakdown'].items():
        print(f"  {status.upper()}: {count}")
    
    if summary['jobs']:
        print("\nJob Details:")
        print("-" * 50)
        for job in summary['jobs']:
            print(f"[{job.id}] {job.job_name}")
            print(f"    Status: {job.status.value}")
            print(f"    Updated: {job.updated_at.strftime('%Y-%m-%d %H:%M:%S')}")
            if job.error_message:
                print(f"    Error: {job.error_message}")
            print()
    
    manager.close()

def send_report(args):
    """Send email report"""
    manager = JobManager()
    email_service = EmailService()
    
    date = datetime.strptime(args.date, '%Y-%m-%d').date() if args.date else None
    summary = manager.get_daily_summary(date)
    
    if email_service.send_daily_summary(summary):
        print("Email report sent successfully")
    else:
        print("Failed to send email report")
    
    manager.close()

def start_scheduler(args):
    """Start the automatic scheduler"""
    scheduler = DailyJobScheduler()
    print("Starting scheduler...")
    scheduler.run()

def main():
    parser = argparse.ArgumentParser(description='Job Notification System')
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Add job command
    add_parser = subparsers.add_parser('add', help='Add a new job')
    add_parser.add_argument('name', help='Job name')
    add_parser.add_argument('-d', '--description', help='Job description')
    add_parser.set_defaults(func=add_job)
    
    # Update job command
    update_parser = subparsers.add_parser('update', help='Update job status')
    update_parser.add_argument('id', type=int, help='Job ID')
    update_parser.add_argument('status', choices=['pending', 'running', 'completed', 'failed', 'cancelled'])
    update_parser.add_argument('-e', '--error', help='Error message (for failed jobs)')
    update_parser.set_defaults(func=update_job)
    
    # Show summary command
    summary_parser = subparsers.add_parser('summary', help='Show daily summary')
    summary_parser.add_argument('-d', '--date', help='Date (YYYY-MM-DD), defaults to today')
    summary_parser.set_defaults(func=show_summary)
    
    # Send report command
    report_parser = subparsers.add_parser('send-report', help='Send email report')
    report_parser.add_argument('-d', '--date', help='Date (YYYY-MM-DD), defaults to today')
    report_parser.set_defaults(func=send_report)
    
    # Start scheduler command
    scheduler_parser = subparsers.add_parser('scheduler', help='Start automatic scheduler')
    scheduler_parser.set_defaults(func=start_scheduler)
    
    args = parser.parse_args()
    
    if hasattr(args, 'func'):
        args.func(args)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()