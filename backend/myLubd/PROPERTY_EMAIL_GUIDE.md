# Property-Specific Email Notifications Guide

This guide explains how to use the property-specific email notification system for job filtering and reporting.

## Overview

The system now supports sending email notifications filtered by property, allowing you to:
- Send daily summaries for specific properties
- Send property-specific job reports
- Filter job statistics by property ID
- Send notifications to users who have access to specific properties

## Available Commands

### 1. User-Specific Property Job Emails ⭐ NEW

Send personalized job emails to users based on their property access:

```bash
# Send job emails to all users for their accessible properties (last 7 days)
python manage.py send_user_property_jobs

# Send job emails for specific property to all users
python manage.py send_user_property_jobs --property-id 1

# Send job emails for last 30 days
python manage.py send_user_property_jobs --days 30

# Send job emails to specific user
python manage.py send_user_property_jobs --user-id 1

# Filter by job status
python manage.py send_user_property_jobs --status pending --property-id 1

# Filter by job priority
python manage.py send_user_property_jobs --priority high --days 3

# Test mode (send to first user only)
python manage.py send_user_property_jobs --test --property-id 1
```

### 2. Property-Specific Daily Summary

Send a daily summary email filtered by property:

```bash
# Send daily summary for a specific property
python manage.py send_daily_summary --property-id 1 --to admin@example.com

# Send to all staff users for property 1
python manage.py send_daily_summary --property-id 1

# Send to all users for property 1
python manage.py send_daily_summary --property-id 1 --all-users
```

### 3. Property Jobs Summary

Send a comprehensive property-specific job report:

```bash
# Send property summary for last 7 days
python manage.py send_property_jobs_summary --property-id 1 --to admin@example.com

# Send property summary for last 30 days
python manage.py send_property_jobs_summary --property-id 1 --days 30

# Send summaries for all properties to their respective users
python manage.py send_property_jobs_summary --all-properties
```

### 4. Test Commands

Test the email functionality:

```bash
# Test user-specific job email
python manage.py test_user_job_email --user-id 1 --property-id 1

# Test property email
python manage.py test_property_email --property-id 1 --to test@example.com
```

## Email Templates

### User Property Jobs Template ⭐ NEW
- **File**: `templates/emails/user_property_jobs.html`
- **Usage**: Personalized job emails for individual users
- **Features**:
  - Personalized greeting with user name
  - User's jobs for their accessible properties
  - Job details with status and priority
  - Clickable job IDs linking to dashboard
  - Room-based job breakdown
  - Topic statistics for user's jobs
  - Color-coded status and priority indicators

### Daily Summary Template
- **File**: `templates/emails/daily_summary.html`
- **Usage**: General daily summaries with optional property filtering
- **Features**: 
  - Daily and monthly statistics
  - Status breakdowns
  - Topic statistics
  - Daily breakdown charts

### Property Jobs Summary Template
- **File**: `templates/emails/property_jobs_summary.html`
- **Usage**: Property-specific job reports
- **Features**:
  - Property-specific job statistics
  - Recent jobs list with property information for each job
  - Shows all properties that each job belongs to (for jobs spanning multiple properties)
  - Room-based job breakdown
  - Topic statistics for the property
  - Property identification in header

## Property Filtering Logic

The system uses comprehensive property filtering that checks:

1. **Direct property_id match**: `job.property_id == property_id`
2. **Room properties**: `job.rooms.properties.id == property_id`
3. **Properties array**: `property_id in job.properties`

This ensures that jobs are properly filtered regardless of how the property relationship is stored.

## Configuration

### Environment Variables

Make sure these email configuration variables are set in your `.env` file:

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_HOST_USER=your-email@domain.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=no-reply@yourdomain.com
SERVER_EMAIL=no-reply@yourdomain.com

# Gmail API (Optional - preferred over SMTP)
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token

# Daily Summary Recipients (Optional)
DAILY_SUMMARY_RECIPIENTS=admin@example.com,manager@example.com
```

### User Access Control

Users receive property-specific emails based on:
- **Property Access**: Users assigned to specific properties
- **Staff Status**: Staff users can receive all property emails
- **Explicit Recipients**: When using `--to` parameter

## Usage Examples

### 1. User-Specific Job Emails ⭐ NEW

Send personalized job emails to all users for their accessible properties:

```bash
# Send job emails to all users (last 7 days)
python manage.py send_user_property_jobs
```

This will:
- Find all active users
- Get their accessible properties
- Send personalized emails with their jobs
- Include job details, status, priority, and statistics

### 2. Property-Specific User Emails

Send job emails to all users for a specific property:

```bash
python manage.py send_user_property_jobs --property-id 1 --days 14
```

This will:
- Send emails to all users who have access to property 1
- Include jobs from the last 14 days
- Show property name in the email header

### 3. Filtered Job Emails

Send emails with specific job filters:

```bash
# Send only pending jobs for property 1
python manage.py send_user_property_jobs --property-id 1 --status pending

# Send only high priority jobs for last 3 days
python manage.py send_user_property_jobs --priority high --days 3

# Send to specific user only
python manage.py send_user_property_jobs --user-id 5 --property-id 1
```

### 4. Daily Property Summary

Send a daily summary for "Lubd Bangkok Chainatown" property:

```bash
python manage.py send_daily_summary --property-id 1 --to admin@example.com
```

This will send an email with:
- Property name in the subject and content
- Job statistics filtered to only that property
- Daily and monthly breakdowns for the property
- Topic statistics for the property

### 5. Weekly Property Report

Send a comprehensive weekly report for a property:

```bash
python manage.py send_property_jobs_summary --property-id 1 --days 7 --to manager@example.com
```

This will send an email with:
- Property-specific job statistics
- Recent jobs list
- Room-based job breakdown
- Top topics for the property

### 6. All Properties Summary

Send summaries for all properties to their respective users:

```bash
python manage.py send_property_jobs_summary --all-properties
```

This will:
- Find all properties in the system
- Send property-specific summaries to users who have access to each property
- Use the last 7 days of data by default

## Scheduling

### Cron Job Setup

Add these to your crontab for automated email sending:

```bash
# Daily summary at 6 PM (18:00) for all properties
0 18 * * * cd /path/to/your/project && python manage.py send_daily_summary

# Weekly property reports every Monday at 9 AM
0 9 * * 1 cd /path/to/your/project && python manage.py send_property_jobs_summary --all-properties --days 7

# Daily summary for specific property (Property ID 1)
0 18 * * * cd /path/to/your/project && python manage.py send_daily_summary --property-id 1
```

### Docker Compose

If using Docker, use these commands:

```bash
# Daily summary for all properties
docker compose exec backend python manage.py send_daily_summary

# Property-specific summary
docker compose exec backend python manage.py send_daily_summary --property-id 1

# Property jobs summary
docker compose exec backend python manage.py send_property_jobs_summary --property-id 1 --days 7
```

## Troubleshooting

### Common Issues

1. **No jobs found for property**
   - Check if the property ID exists
   - Verify job-property relationships in the database
   - Use the test command to debug

2. **Email not sending**
   - Check email configuration in `.env`
   - Verify SMTP credentials or Gmail API setup
   - Check logs for error messages

3. **Users not receiving emails**
   - Verify user email addresses are valid
   - Check if users have access to the property
   - Ensure users are active and not deleted

### Debug Commands

```bash
# Test email functionality
python manage.py test_property_email --property-id 1 --to test@example.com

# Check property exists
python manage.py shell -c "from myappLubd.models import Property; print(Property.objects.get(id=1))"

# Check jobs for property
python manage.py shell -c "from myappLubd.models import Job; print(Job.objects.filter(property_id=1).count())"
```

## Customization

### Email Templates

You can customize the email templates by editing:
- `templates/emails/daily_summary.html` - General daily summaries
- `templates/emails/property_jobs_summary.html` - Property-specific summaries

### Adding New Filters

To add new filtering criteria, modify the property filter logic in:
- `management/commands/send_daily_summary.py`
- `management/commands/send_property_jobs_summary.py`

### Custom Recipients

You can modify the recipient logic in the command files to:
- Add custom recipient groups
- Filter by user roles
- Add additional email addresses

## Security Notes

- Never commit real email credentials to version control
- Use environment variables for all sensitive configuration
- Consider using a secret management service in production
- Regularly rotate email passwords and API keys
- Monitor email sending logs for suspicious activity
