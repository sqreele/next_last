# Backend Usage Summary: Disable Email Notifications

## ✅ What Was Added

1. **Database Field:** `email_notifications_enabled` in `UserProfile` model
2. **API Endpoint:** `PATCH /api/v1/user-profiles/update_email_notifications/`
3. **Serializer Field:** Added to `UserProfileSerializer`
4. **Automatic Filtering:** All email commands exclude users with disabled emails
5. **Command Flags:** `--exclude-emails` and `--exclude-user-ids` for temporary exclusions

---

## 🚀 Quick Start

### 1. Run Migration
```bash
cd backend/myLubd
python manage.py makemigrations
python manage.py migrate
```

### 2. Disable Emails (Choose One Method)

**Method A: Django Admin**
- Admin → User profiles → Uncheck "Email notifications enabled"

**Method B: Django Shell**
```python
python manage.py shell
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile
User = get_user_model()
user = User.objects.get(email='user@example.com')
profile, created = UserProfile.objects.get_or_create(user=user)
profile.email_notifications_enabled = False
profile.save()
```

**Method C: API**
```bash
PATCH /api/v1/user-profiles/update_email_notifications/
{"email_notifications_enabled": false}
```

**Method D: Command Flag (Temporary)**
```bash
python manage.py send_daily_summary --exclude-emails "user@example.com"
```

---

## 📋 All Methods Explained

### Method 1: Django Admin (GUI)
**Best for:** Manual, one-off changes

1. Navigate to `/admin/`
2. Go to **MyappLubd** → **User profiles**
3. Click user → Uncheck **"Email notifications enabled"** → Save

### Method 2: Django Shell (Python)
**Best for:** Bulk operations, scripts, automation

```python
# Single user
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile
User = get_user_model()
user = User.objects.get(email='user@example.com')
profile, created = UserProfile.objects.get_or_create(user=user)
profile.email_notifications_enabled = False
profile.save()

# Multiple users
emails = ['user1@example.com', 'user2@example.com']
for email in emails:
    user = User.objects.get(email=email)
    profile, created = UserProfile.objects.get_or_create(user=user)
    profile.email_notifications_enabled = False
    profile.save()
```

### Method 3: API Endpoint (REST)
**Best for:** Frontend integration, user self-service

**Endpoint:** `PATCH /api/v1/user-profiles/update_email_notifications/`

**Request:**
```bash
curl -X PATCH "https://api.example.com/api/v1/user-profiles/update_email_notifications/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email_notifications_enabled": false}'
```

**Response:**
```json
{
  "message": "Email notifications setting updated successfully",
  "email_notifications_enabled": false,
  "profile": { ... }
}
```

### Method 4: Command-Line Flags (Temporary)
**Best for:** One-time email sends, testing

```bash
# Exclude by email
python manage.py send_daily_summary --exclude-emails "user1@example.com,user2@example.com"

# Exclude by user ID
python manage.py send_daily_summary --exclude-user-ids "5,10,15"

# Available in all email commands:
# - send_daily_summary
# - send_property_jobs_summary
# - send_user_property_jobs
```

---

## 🔍 How It Works

### Automatic Exclusion
All email functions automatically exclude users where `profile.email_notifications_enabled=False`:

```python
# In email commands:
users_qs = users_qs.filter(
    Q(profile__email_notifications_enabled=True) | Q(profile__isnull=True)
)
```

**Note:** Users without profiles are included (default behavior).

### Manual Exclusion (Command Flags)
Command flags allow temporary exclusion without changing user settings:

- `--exclude-emails`: Comma-separated email addresses
- `--exclude-user-ids`: Comma-separated user IDs

These override profile settings for that specific command run.

---

## 📊 Examples

### Example 1: Disable for One User
```python
# Django shell
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()
user = User.objects.get(email='john@example.com')
profile, created = UserProfile.objects.get_or_create(user=user)
profile.email_notifications_enabled = False
profile.save()
```

### Example 2: Disable for All Non-Staff Users
```python
# Django shell
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()
non_staff = User.objects.filter(is_staff=False, is_active=True)
for user in non_staff:
    profile, created = UserProfile.objects.get_or_create(user=user)
    profile.email_notifications_enabled = False
    profile.save()
```

### Example 3: Check Who Has Emails Disabled
```python
# Django shell
from django.contrib.auth import get_user_model

User = get_user_model()
disabled = User.objects.filter(
    profile__email_notifications_enabled=False
).values('email', 'username')

for user in disabled:
    print(f"{user['username']} ({user['email']})")
```

### Example 4: Re-enable Emails
```python
# Django shell
from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()
user = User.objects.get(email='john@example.com')
profile, created = UserProfile.objects.get_or_create(user=user)
profile.email_notifications_enabled = True
profile.save()
```

### Example 5: Send Email But Exclude Specific Users
```bash
# Exclude specific emails from daily summary
python manage.py send_daily_summary \
  --all-users \
  --exclude-emails "user1@example.com,user2@example.com"

# Exclude from property summary
python manage.py send_property_jobs_summary \
  --property-id "P123" \
  --exclude-emails "user1@example.com"
```

---

## 🎯 Use Cases

| Use Case | Recommended Method |
|----------|-------------------|
| User wants to opt-out | API Endpoint (Method 3) |
| Admin disables for one user | Django Admin (Method 1) |
| Bulk disable for many users | Django Shell (Method 2) |
| Temporary exclusion (one email) | Command Flag (Method 4) |
| Scheduled/automated disable | Django Shell Script (Method 2) |

---

## 📝 API Endpoint Details

### Update Email Notifications
- **URL:** `/api/v1/user-profiles/update_email_notifications/`
- **Method:** `PATCH` or `PUT`
- **Auth:** Required (Bearer token)
- **Body:**
  ```json
  {
    "email_notifications_enabled": false
  }
  ```
- **Response:**
  ```json
  {
    "message": "Email notifications setting updated successfully",
    "email_notifications_enabled": false,
    "profile": { ... }
  }
  ```

### Get User Profile (Check Status)
- **URL:** `/api/v1/user-profiles/me/`
- **Method:** `GET`
- **Auth:** Required
- **Response:** Includes `email_notifications_enabled` field

---

## ⚙️ Command-Line Options

All email commands support:

```bash
--exclude-emails EMAIL_LIST      # Comma-separated emails
--exclude-user-ids ID_LIST        # Comma-separated user IDs
```

**Available Commands:**
- `send_daily_summary`
- `send_property_jobs_summary`
- `send_user_property_jobs`

---

## 🔧 Troubleshooting

### Migration Issues
```bash
# Check migration status
python manage.py showmigrations myappLubd

# Apply migrations
python manage.py migrate myappLubd
```

### User Still Receives Emails
1. Check profile exists: `hasattr(user, 'profile')`
2. Check setting: `user.profile.email_notifications_enabled`
3. Verify email function is filtering correctly

### API Endpoint Not Found
- Check URL routing in `urls.py`
- Verify endpoint is registered in router
- Check authentication token

---

## 📚 Full Documentation

- **Quick Start:** `QUICK_START_EMAIL_DISABLE.md`
- **Backend Usage:** `BACKEND_EMAIL_DISABLE_USAGE.md`
- **General Guide:** `DISABLE_EMAIL_NOTIFICATIONS_GUIDE.md`

---

## ✅ Summary

**4 Ways to Disable Emails:**
1. ✅ Django Admin (GUI)
2. ✅ Django Shell (Python)
3. ✅ API Endpoint (REST)
4. ✅ Command Flags (Temporary)

**All email functions automatically exclude users with `email_notifications_enabled=False`**

**Default:** New users have emails enabled (`email_notifications_enabled=True`)

