# Quick Start: Disable Email Notifications

## 🚀 Step 1: Run Migration

```bash
cd backend/myLubd
python manage.py makemigrations
python manage.py migrate
```

## 🎯 Step 2: Choose Your Method

### Option A: Django Admin (Easiest)
1. Go to `/admin/`
2. Navigate to **MyappLubd** → **User profiles**
3. Click on user → Uncheck **"Email notifications enabled"** → Save

### Option B: Django Shell (Quick)
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

### Option C: API Endpoint (For Frontend)
```bash
PATCH /api/v1/user-profiles/update_email_notifications/
Body: {"email_notifications_enabled": false}
```

### Option D: Command Line (Temporary)
```bash
python manage.py send_daily_summary --exclude-emails "user@example.com"
```

## ✅ Step 3: Verify

```python
# Check status
user = User.objects.get(email='user@example.com')
print(user.profile.email_notifications_enabled)  # Should be False
```

## 📚 Full Documentation

- **Backend Usage:** See `BACKEND_EMAIL_DISABLE_USAGE.md`
- **General Guide:** See `DISABLE_EMAIL_NOTIFICATIONS_GUIDE.md`

