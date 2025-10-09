# Property Email System Updates - Summary

This document summarizes all changes made to the property email notification system.

## Overview
Two major updates were implemented to improve the property jobs summary email system:

1. **Show Property Information for Each Job** - Display which properties each job belongs to
2. **Strict User-Property Filtering** - Ensure users only receive emails for their assigned properties

---

## Update 1: Property Information in Job Listings

### What Changed
The property jobs summary email now displays all properties associated with each job. This is especially useful for jobs that span multiple properties.

### Files Modified
- `backend/myLubd/src/myappLubd/management/commands/send_property_jobs_summary.py`
- `backend/myLubd/src/myappLubd/templates/emails/property_jobs_summary.html`
- `backend/myLubd/PROPERTY_EMAIL_GUIDE.md`

### Features Added
- **Property Column**: New "Properties" column in the Recent Jobs table
- **Property Badges**: Each job shows all properties it belongs to as styled badges
- **Multi-Property Support**: Jobs spanning multiple properties are clearly identified
- **Visual Clarity**: Light blue badges with property names

### Example Output
```
Recent Jobs Table:
Job ID    | Description          | Properties                    | Status    | Created
j251A2B3C | Fix AC unit...       | 🏷️ Lubd Bangkok 🏷️ Lubd Phuket | Pending   | Jan 15, 2025
j251D4E5F | Replace light bulb...| 🏷️ Lubd Bangkok               | Completed | Jan 14, 2025
```

### Technical Details
- Jobs linked to properties through Rooms (many-to-many relationships)
- Efficient query: `Property.objects.filter(rooms__jobs=job).distinct()`
- Shows "N/A" if job has no associated properties
- Works in both plain text and HTML emails

### Documentation
See `PROPERTY_JOBS_EMAIL_UPDATE.md` for complete details.

---

## Update 2: Strict User-Property Filtering

### What Changed
Users now ONLY receive emails for properties they are explicitly assigned to. Staff users no longer automatically receive emails for all properties.

### Files Modified
- `backend/myLubd/src/myappLubd/management/commands/send_property_jobs_summary.py`
- `backend/myLubd/PROPERTY_EMAIL_GUIDE.md`

### Features Added
- **Strict Mode** (Default): Users only receive emails for their assigned properties
- **--include-staff Flag**: Optional flag to include staff users in all property emails
- **Improved User Filtering**: Clear separation between property-assigned users and staff
- **Enhanced Logging**: Better tracking of email distribution

### Behavior Changes

#### BEFORE
```bash
python manage.py send_property_jobs_summary --property-id 1
# Sent to: Property 1 users + ALL staff users
```

#### AFTER (Default)
```bash
python manage.py send_property_jobs_summary --property-id 1
# Sent to: Property 1 users ONLY (staff NOT included)
```

#### AFTER (With Flag)
```bash
python manage.py send_property_jobs_summary --property-id 1 --include-staff
# Sent to: Property 1 users + ALL staff users (legacy behavior)
```

### Benefits
✅ **Privacy**: Users only see jobs for their properties
✅ **Reduced Email Overload**: Staff not bombarded with all property emails
✅ **Scalability**: Better for multi-property organizations
✅ **Flexibility**: Optional staff inclusion when needed
✅ **Security**: Clear data boundaries between properties

### User Assignment
Users are assigned to properties via `UserProfile.properties` (many-to-many):

```python
# Assign user to property
user.profile.properties.add(property_obj)
```

### Documentation
See `USER_PROPERTY_FILTERING_UPDATE.md` for complete details.

---

## Quick Reference

### Send Property Summary (Strict Mode - Default)
```bash
# Only users assigned to Property 1 receive email
python manage.py send_property_jobs_summary --property-id 1

# Each user receives email ONLY for their assigned properties
python manage.py send_property_jobs_summary --all-properties
```

### Send Property Summary (Include Staff)
```bash
# Property 1 users + all staff users receive email
python manage.py send_property_jobs_summary --property-id 1 --include-staff

# All users receive emails for their properties, staff receive all
python manage.py send_property_jobs_summary --all-properties --include-staff
```

### Send to Specific Email
```bash
# Override all filtering, send to specific email
python manage.py send_property_jobs_summary --property-id 1 --to admin@example.com
```

---

## Email Template Features

The updated email now includes:

1. **Property Header**: Shows property name and ID
2. **Job Statistics**: Total jobs, completed jobs, status breakdown
3. **Recent Jobs Table**: 
   - Job ID (clickable)
   - Description
   - **Properties** (NEW!) - Shows all properties for each job
   - Status (color-coded)
   - Creation date
4. **Room Statistics**: Jobs by room
5. **Topic Statistics**: Top topics

---

## Testing

### Test Property Information Display
```bash
# Send test email to see property information in job listings
docker compose exec backend python manage.py send_property_jobs_summary --property-id 1 --to test@example.com
```

### Test Strict User Filtering
```bash
# Verify only Property 1 users receive email
docker compose exec backend python manage.py send_property_jobs_summary --property-id 1

# Verify each user only receives their property emails
docker compose exec backend python manage.py send_property_jobs_summary --all-properties
```

### Verify User Property Assignments
```python
from django.contrib.auth import get_user_model
User = get_user_model()

user = User.objects.get(username='john')
properties = user.profile.properties.all()
print(f"{user.username} has access to: {[p.name for p in properties]}")
```

---

## Migration Guide

### For Existing Deployments

If you have cron jobs or scripts using the old behavior:

#### Option 1: Add --include-staff Flag (Quick Fix)
Update your cron jobs to include the flag:
```bash
# Update this line in your crontab
python manage.py send_property_jobs_summary --all-properties --include-staff
```

#### Option 2: Assign Staff to Properties (Recommended)
Explicitly assign staff users to the properties they should manage:
```python
staff_user = User.objects.get(username='admin')
properties = Property.objects.filter(id__in=[1, 2, 3])  # Properties to manage

for prop in properties:
    staff_user.profile.properties.add(prop)
```

This is recommended because:
- Makes access control explicit and auditable
- Works with default strict mode
- Provides granular control
- Scales better as properties are added

---

## Configuration

### Cron Job Setup (Recommended)

```bash
# Daily summary for all properties (strict mode)
# Each user receives email only for their assigned properties
0 18 * * * cd /path/to/project && python manage.py send_property_jobs_summary --all-properties

# Weekly summary for specific property
0 9 * * 1 cd /path/to/project && python manage.py send_property_jobs_summary --property-id 1 --days 7
```

### Docker Commands

```bash
# Send summary for Property 1 (strict mode)
docker compose exec backend python manage.py send_property_jobs_summary --property-id 1

# Send summary for all properties (strict mode)
docker compose exec backend python manage.py send_property_jobs_summary --all-properties

# Send summary for all properties (include staff)
docker compose exec backend python manage.py send_property_jobs_summary --all-properties --include-staff
```

---

## Troubleshooting

### Issue: No Emails Being Sent
**Cause**: No users assigned to property
**Solution**: 
```python
# Assign users to the property
user = User.objects.get(username='john')
property = Property.objects.get(id=1)
user.profile.properties.add(property)
```

### Issue: Staff Users Not Receiving Emails
**Cause**: Strict mode is now default
**Solution**: 
- Use `--include-staff` flag, OR
- Assign staff users to properties they should manage

### Issue: User Receiving Emails from Multiple Properties
**Cause**: User is assigned to multiple properties
**Solution**: This is expected behavior. To limit:
```python
# Remove user from unwanted properties
user.profile.properties.remove(unwanted_property)
```

---

## Summary of All Changes

### Code Changes
1. ✅ Added property information to job listings in email
2. ✅ Implemented strict user-property filtering by default
3. ✅ Added `--include-staff` command-line flag
4. ✅ Updated HTML email template with Properties column
5. ✅ Enhanced logging for email distribution tracking
6. ✅ Improved user filtering logic with strict_mode parameter

### Documentation Changes
1. ✅ Created `PROPERTY_JOBS_EMAIL_UPDATE.md` - Property info feature docs
2. ✅ Created `USER_PROPERTY_FILTERING_UPDATE.md` - User filtering docs
3. ✅ Updated `PROPERTY_EMAIL_GUIDE.md` - User guide with examples
4. ✅ Created this summary document

### Benefits Delivered
- ✅ Users see which properties each job belongs to
- ✅ Better visibility for multi-property jobs
- ✅ Users only receive emails for their assigned properties
- ✅ Reduced email overload for staff users
- ✅ Better security and data privacy
- ✅ Improved scalability for multi-property organizations
- ✅ Flexible inclusion of staff when needed

---

## Further Information

- **Property Info Feature**: See `PROPERTY_JOBS_EMAIL_UPDATE.md`
- **User Filtering Feature**: See `USER_PROPERTY_FILTERING_UPDATE.md`
- **User Guide**: See `backend/myLubd/PROPERTY_EMAIL_GUIDE.md`
- **API Documentation**: See `API_ACCESS_GUIDE.md`

---

## Questions & Support

For questions about:
- **Property Assignment**: Check Django Admin → User Profiles → Properties field
- **Email Configuration**: Check `.env` file for SMTP/Gmail API settings
- **Job-Property Relationships**: Check Django Admin → Jobs → Rooms → Properties
- **Testing**: Use `--to` parameter to send test emails to yourself

---

**Last Updated**: January 2025
**Version**: 2.0
**Status**: Production Ready ✅
