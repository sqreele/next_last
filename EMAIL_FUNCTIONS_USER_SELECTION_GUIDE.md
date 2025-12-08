# Email Summary Functions - User Selection Guide

## Overview
This guide explains how to select users for email summary functions in the PCMS system.

## Available Email Functions

### 1. `send_daily_summary.py` - Daily Maintenance Summary
Sends daily maintenance notification summaries via email.

**User Selection Options:**
- `--to EMAIL` - Send to specific email address (overrides all other options)
- `--all-users` - Send to ALL active users with email addresses
- **Default** (no flags) - Sends to active staff users only
- `--property-id ID` - Filter jobs by property (doesn't change recipients, only filters data)

**Examples:**
```bash
# Send to specific email
python manage.py send_daily_summary --to admin@example.com

# Send to all active users
python manage.py send_daily_summary --all-users

# Send to staff only (default)
python manage.py send_daily_summary

# Send to staff with property-filtered data
python manage.py send_daily_summary --property-id 1
```

**Recipient Logic:**
```python
if explicit_to:
    recipients = [explicit_to]  # Single email
elif env_recipients:  # DAILY_SUMMARY_RECIPIENTS env variable
    recipients = list from env variable
else:
    if --all-users:
        recipients = all active users with emails
    else:
        recipients = active staff users only
```

---

### 2. `send_property_jobs_summary.py` - Property Job Summary
Sends property-specific job summaries via email.

**User Selection Options:**
- `--to EMAIL` - Send to specific email address (overrides all other options)
- `--property-id ID` - Required (unless using --all-properties)
- `--all-properties` - Send summary for ALL properties to their respective users
- `--include-staff` - Include staff users (default: only property-assigned users)
- **Default** (strict mode) - Only users assigned to the property receive emails

**Examples:**
```bash
# Send to specific email
python manage.py send_property_jobs_summary --property-id 1 --to admin@example.com

# Send to property-assigned users only (strict mode - default)
python manage.py send_property_jobs_summary --property-id 1

# Send to property users + staff users
python manage.py send_property_jobs_summary --property-id 1 --include-staff

# Send to all properties (each property's users get their own email)
python manage.py send_property_jobs_summary --all-properties
```

**Recipient Logic:**
```python
if explicit_to:
    users = [explicit_to]  # Single email
else:
    if strict_mode (default):
        users = users assigned to property via profile.properties
    else (--include-staff):
        users = property-assigned users + all staff users
    
    if no users found:
        fallback to staff users
```

**User Assignment:**
Users are assigned to properties via `UserProfile.properties` (many-to-many relationship):
```python
# Assign user to property
user.profile.properties.add(property_obj)
```

---

### 3. `send_user_property_jobs.py` - Personalized User Job Emails
Sends personalized job emails to users based on their property access.

**User Selection Options:**
- `--user-id ID` - Send email only to specific user ID
- `--property-id ID` - Filter jobs by specific property
- **Default** (no --user-id) - Send to ALL active users with emails
- `--test` - Test mode: send to first user only
- `--days N` - Number of days to look back (default: 7)
- `--status STATUS` - Filter jobs by status
- `--priority PRIORITY` - Filter jobs by priority

**Examples:**
```bash
# Send to specific user
python manage.py send_user_property_jobs --user-id 5

# Send to all users for their accessible properties
python manage.py send_user_property_jobs

# Send to all users for specific property
python manage.py send_user_property_jobs --property-id 1

# Send to specific user with filters
python manage.py send_user_property_jobs --user-id 5 --days 30 --status pending

# Test mode (first user only)
python manage.py send_user_property_jobs --test
```

**Recipient Logic:**
```python
if --user-id:
    users = User.objects.filter(id=user_id)
else:
    users = all active users with emails

if --test:
    users = users[:1]  # First user only

for each user:
    jobs = get jobs for user's accessible properties
    if jobs exist:
        send personalized email
```

**Property Access:**
Users receive jobs for properties they are assigned to via `Property.objects.filter(users=user)`.

---

## Summary Table

| Function | Default Recipients | Options to Select Users |
|----------|-------------------|------------------------|
| `send_daily_summary` | Active staff users | `--to EMAIL`, `--all-users` |
| `send_property_jobs_summary` | Property-assigned users | `--to EMAIL`, `--include-staff`, `--all-properties` |
| `send_user_property_jobs` | All active users | `--user-id ID`, `--test` |

---

## How to Select Specific Users

### Option 1: Use `--to` Flag (All Functions)
Send to a specific email address:
```bash
python manage.py send_daily_summary --to user@example.com
python manage.py send_property_jobs_summary --property-id 1 --to user@example.com
python manage.py send_user_property_jobs --user-id 5 --to user@example.com
```

### Option 2: Use `--user-id` (send_user_property_jobs only)
Send to a specific user by ID:
```bash
python manage.py send_user_property_jobs --user-id 5
```

### Option 3: Filter by Property Assignment
Users assigned to properties automatically receive property-specific emails:
```bash
# Only users assigned to property 1 receive email
python manage.py send_property_jobs_summary --property-id 1
```

### Option 4: Use Environment Variables
Set `DAILY_SUMMARY_RECIPIENTS` in settings for fixed recipient list:
```python
# settings.py
DAILY_SUMMARY_RECIPIENTS = "user1@example.com,user2@example.com"
```

---

## User Selection Functions Reference

### `send_daily_summary.py`
**Location:** `backend/myLubd/src/myappLubd/management/commands/send_daily_summary.py`

**Key Function:** Lines 350-381
```python
# Determine recipients
explicit_to = options.get("to_email")
recipients = []

if explicit_to:
    recipients = [explicit_to]
elif env_recipients:
    recipients = list from DAILY_SUMMARY_RECIPIENTS
else:
    if options.get("all_users"):
        users_qs = User.objects.filter(is_active=True).exclude(email__isnull=True)
    else:
        users_qs = User.objects.filter(is_active=True, is_staff=True).exclude(email__isnull=True)
    recipients = list(users_qs.values_list("email", flat=True))
```

### `send_property_jobs_summary.py`
**Location:** `backend/myLubd/src/myappLubd/management/commands/send_property_jobs_summary.py`

**Key Function:** `get_property_users()` - Lines 135-155
```python
def get_property_users(self, property_id, strict_mode=True):
    """Get users who have access to this property."""
    User = get_user_model()
    if strict_mode:
        # Only users explicitly assigned to this property
        return User.objects.filter(
            is_active=True,
            profile__properties__id=property_id
        ).exclude(email__isnull=True).exclude(email__exact="")
    else:
        # Include staff users
        return User.objects.filter(
            Q(is_active=True) & 
            (Q(profile__properties__id=property_id) | Q(is_staff=True))
        ).exclude(email__isnull=True).exclude(email__exact="")
```

**Usage:** Lines 187-204
```python
explicit_to = options.get("to_email")
if explicit_to:
    users = [explicit_to]
else:
    user_objects = self.get_property_users(property_id, strict_mode=strict_mode)
    users = list(user_objects.values_list("email", flat=True))
```

### `send_user_property_jobs.py`
**Location:** `backend/myLubd/src/myappLubd/management/commands/send_user_property_jobs.py`

**Key Function:** Lines 265-278
```python
# Get users to send emails to
if user_id:
    users = User.objects.filter(id=user_id, is_active=True).exclude(email__isnull=True)
else:
    users = User.objects.filter(is_active=True).exclude(email__isnull=True)

if test_mode:
    users = users[:1]  # First user only
```

---

## Best Practices

1. **Test First**: Always use `--test` or `--to your-email@example.com` to test before sending to all users
2. **Property Assignment**: Ensure users are properly assigned to properties via `user.profile.properties.add(property)`
3. **Email Validation**: Functions automatically exclude users without email addresses
4. **Strict Mode**: Use strict mode (default) to ensure users only receive emails for their assigned properties
5. **Logging**: Check logs to see which users received emails

---

## Common Use Cases

### Send to Selected Users Only
```bash
# Method 1: Use --to flag multiple times (if supported) or create a script
# Method 2: Assign users to a property and use property-based sending
python manage.py send_property_jobs_summary --property-id 1

# Method 3: Use --user-id for personalized emails
python manage.py send_user_property_jobs --user-id 5
```

### Send to Multiple Selected Users
Currently, there's no built-in `--user-ids` flag. Options:
1. Create a custom property and assign selected users to it
2. Use environment variable `DAILY_SUMMARY_RECIPIENTS` (for daily summary)
3. Modify the command to accept multiple user IDs
4. Create a wrapper script that calls the command multiple times

---

## Notes

- All functions exclude users without email addresses
- All functions exclude inactive users
- Property-based filtering uses `UserProfile.properties` many-to-many relationship
- Staff users can be included with `--include-staff` flag (property summary only)
- Test mode is available in `send_user_property_jobs` with `--test` flag

