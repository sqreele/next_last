# Property Jobs Summary Email Update

## Summary
Updated the property jobs summary email to display all properties associated with each job. This allows users to see which properties a job belongs to, especially useful for jobs that span multiple properties through their associated rooms.

## Changes Made

### 1. Backend - Command File
**File**: `backend/myLubd/src/myappLubd/management/commands/send_property_jobs_summary.py`

#### Changes:
- Modified the `get_property_job_statistics()` method to include property information for each job
- Now fetches all properties that each job belongs to through its rooms relationship
- Returns job data in a structured format: `{'job': job_object, 'properties': [list of property names]}`
- Updated both plain text and HTML email generation to include property information

**Key Code Changes**:
```python
# Get recent jobs (last 10) with property information
recent_jobs_queryset = jobs.order_by('-created_at')[:10]
recent_jobs = []
for job in recent_jobs_queryset:
    # Get all properties this job belongs to through its rooms
    job_properties = Property.objects.filter(
        rooms__jobs=job
    ).distinct().values_list('name', flat=True)
    
    recent_jobs.append({
        'job': job,
        'properties': list(job_properties) if job_properties else []
    })
```

### 2. Email Template
**File**: `backend/myLubd/src/myappLubd/templates/emails/property_jobs_summary.html`

#### Changes:
- Added a new "Properties" column to the Recent Jobs table
- Displays property names as styled badges for each job
- Shows "N/A" if a job has no associated properties
- Each property is displayed in a light blue badge with rounded corners

**Visual Features**:
- Property badges: Light blue background (`#e0f2fe`) with dark blue text (`#0369a1`)
- Responsive design that works across email clients
- Multiple properties are displayed as separate badges in a horizontal layout

### 3. Documentation
**File**: `backend/myLubd/PROPERTY_EMAIL_GUIDE.md`

Updated the Property Jobs Summary Template section to reflect the new feature:
- Added note about property information being displayed for each job
- Clarified that it shows all properties that each job belongs to
- Useful for jobs spanning multiple properties

## How It Works

### Job-Property Relationship
Jobs are linked to properties through a many-to-many relationship via Rooms:
- Jobs have a many-to-many relationship with Rooms
- Rooms have a many-to-many relationship with Properties
- Therefore, a job can belong to multiple properties if its rooms are associated with different properties

### Query Logic
The system queries all properties where:
```sql
Property.objects.filter(rooms__jobs=job).distinct()
```

This finds all properties that have rooms associated with the specific job.

## Email Output

### Plain Text Email
Example output:
```
Recent jobs:
- j251A2B3C: Fix air conditioning unit... (pending) [Properties: Lubd Bangkok, Lubd Phuket]
- j251D4E5F: Replace light bulb... (completed) [Properties: Lubd Bangkok]
- j251G6H7I: Repair door lock... (in_progress)
```

### HTML Email
The HTML email displays:
- A table with columns: Job ID, Description, Properties, Status, Created
- Property names displayed as styled badges
- Visual separation between different jobs
- Color-coded status indicators

## Usage

Send property jobs summary as usual:
```bash
# Send property summary for last 7 days
python manage.py send_property_jobs_summary --property-id 1 --to admin@example.com

# Send property summary for last 30 days
python manage.py send_property_jobs_summary --property-id 1 --days 30

# Send summaries for all properties to their respective users
python manage.py send_property_jobs_summary --all-properties
```

## Benefits

1. **Transparency**: Users can see exactly which properties each job belongs to
2. **Multi-Property Jobs**: Easily identify jobs that span multiple properties
3. **Better Tracking**: Helps property managers understand cross-property maintenance work
4. **Improved Context**: Provides complete information about job scope and reach

## Testing

To test the changes:
```bash
# Test with Docker
docker compose exec backend python manage.py send_property_jobs_summary --property-id 1 --to your-email@example.com

# Test all properties
docker compose exec backend python manage.py send_property_jobs_summary --all-properties
```

## Technical Details

- **Database Queries**: Uses efficient `distinct()` to avoid duplicate properties
- **Performance**: Optimized query using `values_list('name', flat=True)` to fetch only property names
- **Compatibility**: Maintains backward compatibility - jobs without properties show "N/A"
- **Email Clients**: HTML template tested for compatibility with major email clients
