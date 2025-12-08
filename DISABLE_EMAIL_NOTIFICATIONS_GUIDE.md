# How to Disable Email Notifications for Users

## Overview
This guide explains how to prevent specific users from receiving email notifications (summary emails, etc.).

## Methods to Disable Email Notifications

### Method 1: Disable via UserProfile Field (Recommended)
Set `email_notifications_enabled=False` in the user's profile. This is the permanent way to disable emails for a user.

**Via Django Admin:**
1. Go to Django Admin → User Profiles
2. Find the user's profile
3. Uncheck "Email notifications enabled"
4. Save

**Via Django Shell:**
```python
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()
user = User.objects.get(email='user@example.com')
profile, created = UserProfile.objects.get_or_create(user=user)
profile.email_notifications_enabled = False
profile.save()
```

**Via API (if you add an endpoint):**
```python
# Update user profile
user.profile.email_notifications_enabled = False
user.profile.save()
```

### Method 2: Exclude via Command-Line Flags
Use `--exclude-emails` or `--exclude-user-ids` flags when running email commands.

**Exclude by Email Address:**
```bash
# Exclude specific emails
python manage.py send_daily_summary --exclude-emails "user1@example.com,user2@example.com"

# Exclude emails from property summary
python manage.py send_property_jobs_summary --property-id 1 --exclude-emails "user1@example.com"

# Exclude emails from user property jobs
python manage.py send_user_property_jobs --exclude-emails "user1@example.com,user2@example.com"
```

**Exclude by User ID:**
```bash
# Exclude specific user IDs
python manage.py send_daily_summary --exclude-user-ids "5,10,15"

# Exclude user IDs from property summary
python manage.py send_property_jobs_summary --property-id 1 --exclude-user-ids "5,10"

# Exclude user IDs from user property jobs
python manage.py send_user_property_jobs --exclude-user-ids "5,10,15"
```

**Combine Both Methods:**
```bash
python manage.py send_daily_summary --all-users --exclude-emails "user1@example.com" --exclude-user-ids "5,10"
```

## How It Works

### Automatic Exclusion (Method 1)
All email functions automatically exclude users where `profile.email_notifications_enabled=False`:

1. **send_daily_summary.py**
   - Filters: `Q(profile__email_notifications_enabled=True) | Q(profile__isnull=True)`
   - Users without profiles are included (default behavior)

2. **send_property_jobs_summary.py**
   - `get_property_users()` filters out users with disabled notifications
   - Applied to both strict mode and include-staff mode

3. **send_user_property_jobs.py**
   - Filters users before sending personalized emails
   - Skips users with `email_notifications_enabled=False`

### Manual Exclusion (Method 2)
Command-line flags allow temporary exclusion without changing user settings:

- `--exclude-emails`: Comma-separated list of email addresses
- `--exclude-user-ids`: Comma-separated list of user IDs

## Examples

### Example 1: Disable for One User Permanently
```python
# Django shell
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()
user = User.objects.get(email='john@example.com')
profile, created = UserProfile.objects.get_or_create(user=user)
profile.email_notifications_enabled = False
profile.save()
print(f"Email notifications disabled for {user.email}")
```

### Example 2: Disable for Multiple Users
```python
# Django shell
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()
emails_to_disable = ['user1@example.com', 'user2@example.com', 'user3@example.com']

for email in emails_to_disable:
    try:
        user = User.objects.get(email=email)
        profile, created = UserProfile.objects.get_or_create(user=user)
        profile.email_notifications_enabled = False
        profile.save()
        print(f"✓ Disabled emails for {email}")
    except User.DoesNotExist:
        print(f"✗ User {email} not found")
```

### Example 3: Temporarily Exclude Users from One Email
```bash
# Send daily summary but exclude specific users
python manage.py send_daily_summary --all-users \
    --exclude-emails "user1@example.com,user2@example.com" \
    --exclude-user-ids "5,10"
```

### Example 4: Re-enable Email Notifications
```python
# Django shell
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()
user = User.objects.get(email='john@example.com')
profile, created = UserProfile.objects.get_or_create(user=user)
profile.email_notifications_enabled = True
profile.save()
print(f"Email notifications enabled for {user.email}")
```

## Database Migration

After adding the `email_notifications_enabled` field, run:

```bash
cd backend/myLubd
python manage.py makemigrations
python manage.py migrate
```

This will create a migration file and add the field to the database.

## Checking User Email Status

**Via Django Shell:**
```python
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()

# Check all users with disabled emails
disabled_users = User.objects.filter(
    profile__email_notifications_enabled=False
).values('id', 'email', 'username')

for user in disabled_users:
    print(f"User {user['username']} ({user['email']}) has emails disabled")

# Check specific user
user = User.objects.get(email='user@example.com')
if hasattr(user, 'profile'):
    status = "enabled" if user.profile.email_notifications_enabled else "disabled"
    print(f"Email notifications for {user.email}: {status}")
else:
    print(f"No profile found for {user.email} (emails enabled by default)")
```

## Summary

| Method | Scope | Persistence | Use Case |
|--------|-------|-------------|----------|
| **UserProfile field** | All emails | Permanent | User wants to opt-out permanently |
| **--exclude-emails** | Single command | Temporary | One-time exclusion |
| **--exclude-user-ids** | Single command | Temporary | One-time exclusion |

## Notes

- Users without profiles default to **emails enabled** (included in email lists)
- The `email_notifications_enabled` field defaults to `True` for new profiles
- Command-line exclusions override profile settings (if you use `--exclude-emails`, those emails won't receive emails even if their profile says enabled)
- All methods still respect other filters (active users, has email, etc.)

