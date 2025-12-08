# How to Disable Email Notifications via Django Admin UI

## Prerequisites

1. **Run Migration First** (if not done already):
   ```bash
   cd backend/myLubd
   python manage.py makemigrations
   python manage.py migrate
   ```

2. **Access Django Admin:**
   - You need admin credentials
   - URL: `http://your-domain.com/admin/` or `http://localhost:8000/admin/`

---

## Step-by-Step Guide

### Step 1: Login to Django Admin

1. Navigate to Django Admin URL:
   ```
   http://your-domain.com/admin/
   ```

2. Enter your admin username and password
3. Click **"Log in"**

### Step 2: Navigate to User Profiles

1. In the Django Admin homepage, find the **"MYAPPLUBD"** section
2. Look for **"User profiles"** link
3. Click on **"User profiles"**

**What you'll see:**
- A list of all user profiles in the system
- Columns showing: Username, Email, Profile image, etc.

### Step 3: Find the User

You can find users by:

**Option A: Search**
- Use the search box at the top
- Search by username or email
- Click **"Search"**

**Option B: Filter**
- Use filters on the right sidebar
- Filter by properties, etc.

**Option C: Browse**
- Scroll through the list
- Use pagination at the bottom if there are many users

### Step 4: Open User Profile

1. Click on the username or email of the user you want to modify
2. This opens the user profile edit page

### Step 5: Disable Email Notifications

1. Scroll down to find the **"Email notifications enabled"** checkbox
2. **Uncheck** the checkbox (it should be checked by default)
3. The checkbox should now be empty/unchecked

**Location:** The checkbox is in the main form, typically near other profile settings.

### Step 6: Save Changes

1. Scroll to the bottom of the page
2. Click the **"Save"** button (or **"Save and add another"** / **"Save and continue editing"**)
3. You should see a success message: **"User profile was changed successfully."**

### Step 7: Verify

1. The page will reload showing the updated profile
2. Check that **"Email notifications enabled"** is now unchecked
3. The user will no longer receive email notifications

---

## Visual Guide (Text Description)

```
┌─────────────────────────────────────────────────┐
│ Django Administration                            │
│                                                 │
│ MYAPPLUBD                                       │
│ ├── Properties                                  │
│ ├── User profiles  ← CLICK HERE                │
│ ├── Rooms                                        │
│ └── ...                                         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Select user profile to change                   │
│                                                 │
│ Search: [________________] [Search]            │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Username    │ Email              │ Actions │ │
│ ├─────────────────────────────────────────────┤ │
│ │ john_doe    │ john@example.com   │ [Change]│ │
│ │ jane_smith  │ jane@example.com  │ [Change]│ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Change user profile                             │
│                                                 │
│ User: john_doe                                  │
│ Email: john@example.com                         │
│                                                 │
│ ... (other fields) ...                          │
│                                                 │
│ ☐ Email notifications enabled  ← UNCHECK THIS  │
│                                                 │
│ [Save] [Save and add another] [Save and continue]│
└─────────────────────────────────────────────────┘
```

---

## Bulk Operations (Multiple Users)

### Method 1: One by One
- Repeat Steps 3-6 for each user

### Method 2: Using Actions (If Available)
1. In the user profiles list, check the boxes next to users you want to modify
2. Select **"Change email notifications"** from the **"Action"** dropdown (if custom action exists)
3. Click **"Go"**

**Note:** If bulk action doesn't exist, you'll need to edit users one by one, or use Django Shell for bulk operations.

---

## Re-enable Email Notifications

To re-enable emails for a user:

1. Follow Steps 1-4 above
2. In Step 5, **check** the **"Email notifications enabled"** checkbox
3. Click **"Save"**

---

## Troubleshooting

### Issue: "Email notifications enabled" checkbox not visible

**Solution:**
- Make sure migration has been run: `python manage.py migrate`
- Refresh the page (Ctrl+F5 or Cmd+Shift+R)
- Check that you're editing a User Profile, not a User

### Issue: Changes not saving

**Solution:**
- Check for validation errors (red text on page)
- Make sure you clicked "Save" button
- Check browser console for errors
- Verify you have admin permissions

### Issue: Can't find user

**Solution:**
- Use the search box
- Check if user has a profile (some users might not have profiles yet)
- Verify you're in the correct section (User profiles, not Users)

### Issue: User still receives emails

**Solution:**
1. Verify the checkbox is unchecked
2. Check if user has a profile: In Django shell:
   ```python
   from django.contrib.auth import get_user_model
   User = get_user_model()
   user = User.objects.get(email='user@example.com')
   print(hasattr(user, 'profile'))
   print(user.profile.email_notifications_enabled if hasattr(user, 'profile') else 'No profile')
   ```
3. Verify email commands are using the filter correctly

---

## Quick Reference

**To Disable:**
1. Admin → User profiles → Click user → Uncheck "Email notifications enabled" → Save

**To Enable:**
1. Admin → User profiles → Click user → Check "Email notifications enabled" → Save

**To Check Status:**
1. Admin → User profiles → Click user → Look at "Email notifications enabled" checkbox

---

## Alternative: Django Shell (Faster for Bulk)

If you need to disable emails for many users, Django Shell is faster:

```python
python manage.py shell

from django.contrib.auth import get_user_model
from myappLubd.models import UserProfile

User = get_user_model()

# Single user
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

---

## Summary

✅ **Steps:**
1. Login to `/admin/`
2. Go to **User profiles**
3. Click on user
4. Uncheck **"Email notifications enabled"**
5. Click **Save**

✅ **Result:** User will no longer receive email notifications

✅ **To Re-enable:** Check the checkbox and save

