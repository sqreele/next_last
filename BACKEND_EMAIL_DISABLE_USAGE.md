# Backend Usage Guide: Disable Email Notifications

## Table of Contents
1. [Database Migration](#database-migration)
2. [Using Django Admin](#using-django-admin)
3. [Using Django Shell](#using-django-shell)
4. [Using API Endpoints](#using-api-endpoints)
5. [Using Management Commands](#using-management-commands)
6. [Examples](#examples)

---

## Database Migration

First, create and apply the migration to add the `email_notifications_enabled` field:

```bash
cd backend/myLubd
python manage.py makemigrations
python manage.py migrate
```

**Expected Output:**
```
Migrations for 'myappLubd':
  myappLubd/migrations/XXXX_add_email_notifications_enabled.py
    - Add field email_notifications_enabled to userprofile
```

---

## Using Django Admin

### Step 1: Access Django Admin
1. Navigate to: `http://your-domain.com/admin/`
2. Login with admin credentials

### Step 2: Find User Profile
1. Go to **MyappLubd** → **User profiles**
2. Find the user you want to disable emails for
3. Click on the user profile

### Step 3: Disable Email Notifications
1. Find the **"Email notifications enabled"** checkbox
2. **Uncheck** it to disable emails
3. Click **Save**

### Step 4: Verify
- The user will no longer receive email notifications
- Check the user's profile to confirm `email_notifications_enabled = False`

---

## Using Django Shell

### Disable Emails for One User

```python
# Start Django shell
cd backend/myLubd
python manage.py shell

# In shell:
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()

# Find user by email
user = User.objects.get(email='user@example.com')

# Get or create profile
profile, created = UserProfile.objects.get_or_create(user=user)

# Disable email notifications
profile.email_notifications_enabled = False
profile.save()

print(f"✓ Email notifications disabled for {user.email}")
```

### Disable Emails for Multiple Users

```python
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()

# List of emails to disable
emails_to_disable = [
    'user1@example.com',
    'user2@example.com',
    'user3@example.com'
]

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

### Re-enable Emails

```python
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()

user = User.objects.get(email='user@example.com')
profile, created = UserProfile.objects.get_or_create(user=user)
profile.email_notifications_enabled = True
profile.save()

print(f"✓ Email notifications enabled for {user.email}")
```

### Check Email Status

```python
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()

# Check all users with disabled emails
disabled_users = User.objects.filter(
    profile__email_notifications_enabled=False
).select_related('profile').values('id', 'email', 'username', 'profile__email_notifications_enabled')

print("Users with disabled emails:")
for user in disabled_users:
    print(f"  - {user['username']} ({user['email']})")

# Check specific user
user = User.objects.get(email='user@example.com')
if hasattr(user, 'profile'):
    status = "enabled" if user.profile.email_notifications_enabled else "disabled"
    print(f"Email notifications for {user.email}: {status}")
else:
    print(f"No profile found for {user.email} (emails enabled by default)")
```

---

## Using API Endpoints

### Endpoint: Update Email Notifications

**URL:** `PATCH /api/v1/user-profiles/update_email_notifications/`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "email_notifications_enabled": false
}
```

**Response (Success):**
```json
{
  "message": "Email notifications setting updated successfully",
  "email_notifications_enabled": false,
  "profile": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "email_notifications_enabled": false,
    ...
  }
}
```

**cURL Example:**
```bash
curl -X PATCH "https://your-api.com/api/v1/user-profiles/update_email_notifications/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_notifications_enabled": false}'
```

**Python Example:**
```python
import requests

url = "https://your-api.com/api/v1/user-profiles/update_email_notifications/"
headers = {
    "Authorization": "Bearer YOUR_ACCESS_TOKEN",
    "Content-Type": "application/json"
}
data = {
    "email_notifications_enabled": False
}

response = requests.patch(url, json=data, headers=headers)
print(response.json())
```

### Endpoint: Get User Profile (Check Status)

**URL:** `GET /api/v1/user-profiles/me/`

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "email_notifications_enabled": false,
  ...
}
```

---

## Using Management Commands

### Exclude Users from Daily Summary

```bash
# Exclude by email addresses
python manage.py send_daily_summary \
  --all-users \
  --exclude-emails "user1@example.com,user2@example.com"

# Exclude by user IDs
python manage.py send_daily_summary \
  --all-users \
  --exclude-user-ids "5,10,15"

# Combine both
python manage.py send_daily_summary \
  --all-users \
  --exclude-emails "user1@example.com" \
  --exclude-user-ids "5,10"
```

### Exclude Users from Property Summary

```bash
# Exclude emails from property summary
python manage.py send_property_jobs_summary \
  --property-id "P123" \
  --exclude-emails "user1@example.com,user2@example.com"

# Exclude user IDs
python manage.py send_property_jobs_summary \
  --property-id "P123" \
  --exclude-user-ids "5,10"
```

### Exclude Users from User Property Jobs

```bash
# Exclude emails
python manage.py send_user_property_jobs \
  --exclude-emails "user1@example.com,user2@example.com"

# Exclude user IDs
python manage.py send_user_property_jobs \
  --exclude-user-ids "5,10,15"
```

---

## Examples

### Example 1: Disable Emails via API (Frontend Integration)

**Frontend Code (TypeScript/React):**
```typescript
async function disableEmailNotifications(accessToken: string) {
  const response = await fetch(
    '/api/v1/user-profiles/update_email_notifications/',
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_notifications_enabled: false
      })
    }
  );
  
  const data = await response.json();
  return data;
}
```

### Example 2: Bulk Disable via Django Shell

```python
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()

# Disable emails for all non-staff users
non_staff_users = User.objects.filter(is_staff=False, is_active=True)

for user in non_staff_users:
    profile, created = UserProfile.objects.get_or_create(user=user)
    profile.email_notifications_enabled = False
    profile.save()
    print(f"Disabled emails for {user.email}")

print(f"Total users updated: {non_staff_users.count()}")
```

### Example 3: Disable for Users Without Profile

```python
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()

# Find users without profiles
users_without_profiles = User.objects.filter(profile__isnull=True, is_active=True)

for user in users_without_profiles:
    profile = UserProfile.objects.create(user=user)
    profile.email_notifications_enabled = False
    profile.save()
    print(f"Created profile and disabled emails for {user.email}")
```

### Example 4: Scheduled Task to Disable Emails

```python
# In a Django management command or scheduled task
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile
from django.utils import timezone
from datetime import timedelta

User = get_user_model()

# Disable emails for users who haven't logged in for 90 days
cutoff_date = timezone.now() - timedelta(days=90)
inactive_users = User.objects.filter(
    last_login__lt=cutoff_date,
    is_active=True
)

for user in inactive_users:
    profile, created = UserProfile.objects.get_or_create(user=user)
    if profile.email_notifications_enabled:
        profile.email_notifications_enabled = False
        profile.save()
        print(f"Disabled emails for inactive user: {user.email}")
```

### Example 5: Test Email Exclusion

```bash
# Test daily summary with exclusions
python manage.py send_daily_summary \
  --all-users \
  --exclude-emails "test@example.com" \
  --property-id "P123"

# Verify test@example.com didn't receive email
```

---

## Summary

| Method | Use Case | When to Use |
|--------|----------|-------------|
| **Django Admin** | Manual, one-off changes | Quick admin actions |
| **Django Shell** | Bulk operations, scripts | Automation, bulk updates |
| **API Endpoint** | User self-service, frontend | User preferences page |
| **Command Flags** | Temporary exclusions | One-time email sends |

---

## Notes

- **Default Behavior:** New users have `email_notifications_enabled=True` by default
- **Users Without Profiles:** Users without profiles are included in emails (default behavior)
- **Command Flags Override:** Using `--exclude-emails` will exclude those emails even if their profile says enabled
- **Permanent vs Temporary:** 
  - Profile field = Permanent setting
  - Command flags = Temporary exclusion for one command run

---

## Troubleshooting

### Issue: Migration fails
```bash
# Check if field already exists
python manage.py showmigrations myappLubd

# If migration exists but not applied
python manage.py migrate myappLubd
```

### Issue: User still receives emails
1. Check profile: `user.profile.email_notifications_enabled`
2. Check if user has profile: `hasattr(user, 'profile')`
3. Verify email function is filtering correctly

### Issue: API endpoint returns 404
- Check URL routing in `urls.py`
- Verify endpoint is registered in router
- Check authentication token is valid

---

## Quick Reference

**Disable emails:**
```python
profile.email_notifications_enabled = False
profile.save()
```

**Enable emails:**
```python
profile.email_notifications_enabled = True
profile.save()
```

**Check status:**
```python
status = user.profile.email_notifications_enabled
```

**Exclude from command:**
```bash
--exclude-emails "email1@example.com,email2@example.com"
--exclude-user-ids "1,2,3"
```

