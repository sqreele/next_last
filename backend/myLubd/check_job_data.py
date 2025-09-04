#!/usr/bin/env python
import os
import sys
import django

# Add the source directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myproject.settings")
django.setup()

from myappLubd.models import Job, Topic, Room

def check_job_data():
    """Check if jobs have topics and rooms associated"""
    
    print("=== JOB DATA ANALYSIS ===")
    
    # Total jobs
    total_jobs = Job.objects.count()
    print(f"\nTotal jobs in database: {total_jobs}")
    
    # Jobs with topics
    jobs_with_topics = Job.objects.filter(topics__isnull=False).distinct().count()
    jobs_without_topics = Job.objects.filter(topics__isnull=True).count()
    
    print(f"\nJobs with topics: {jobs_with_topics}")
    print(f"Jobs without topics: {jobs_without_topics}")
    
    # Sample topics
    print("\nSample topics in use:")
    topics = Topic.objects.all()[:5]
    for topic in topics:
        job_count = topic.job_set.count()
        print(f"  - {topic.title}: {job_count} jobs")
    
    # Jobs with rooms
    jobs_with_rooms = Job.objects.filter(rooms__isnull=False).distinct().count()
    jobs_without_rooms = Job.objects.filter(rooms__isnull=True).count()
    
    print(f"\nJobs with rooms: {jobs_with_rooms}")
    print(f"Jobs without rooms: {jobs_without_rooms}")
    
    # Sample rooms
    print("\nSample rooms in use:")
    rooms = Room.objects.all()[:5]
    for room in rooms:
        job_count = room.jobs.count()
        print(f"  - {room.name} (ID: {room.room_id}): {job_count} jobs")
    
    # Sample job data
    print("\n=== SAMPLE JOB DATA ===")
    sample_jobs = Job.objects.all()[:3]
    for job in sample_jobs:
        print(f"\nJob ID: {job.id} ({job.job_id})")
        print(f"  Topics: {list(job.topics.values_list('title', flat=True))}")
        print(f"  Rooms: {list(job.rooms.values_list('name', flat=True))}")

if __name__ == "__main__":
    check_job_data()