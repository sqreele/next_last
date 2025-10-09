# User Property Filtering Update

## Summary
Updated the property jobs summary email system to ensure **users only receive emails for properties they are explicitly assigned to**. This prevents users from seeing jobs from other properties they don't manage.

## Problem Statement
Previously, the system included staff users when sending property-specific emails, meaning:
- Staff users received emails for ALL properties (even if not assigned)
- Users in Property A could potentially see emails meant for Property B users
- No clear separation between property-assigned users and staff users

## Solution
Implemented **strict property filtering** by default, with an optional flag to include staff users.

## Changes Made

### 1. Updated `send_property_jobs_summary.py`

#### Modified `get_property_users()` Method
Added a `strict_mode` parameter to control user filtering:

```python
def get_property_users(self, property_id, strict_mode=True):
    """Get users who have access to this property.
    
    Args:
        property_id: The property ID to filter users by
        strict_mode: If True, only users assigned to this property receive emails.
                    If False, staff users also receive emails (default: True)
    """
    User = get_user_model()
    if strict_mode:
        # Only users explicitly assigned to this property
        return User.objects.filter(
            is_active=True,
            profile__properties__id=property_id
        ).exclude(email__isnull=True).exclude(email__exact="")
    else:
        # Include staff users (legacy behavior)
        return User.objects.filter(
            Q(is_active=True) & 
            (Q(profile__properties__id=property_id) | Q(is_staff=True))
        ).exclude(email__isnull=True).exclude(email__exact="")
```

#### Added `--include-staff` Flag
New command-line argument to optionally include staff users:

```bash
parser.add_argument(
    "--include-staff",
    action="store_true",
    dest="include_staff",
    help="Include staff users in email recipients (by default, only property-assigned users receive emails)",
)
```

#### Updated `handle()` Method
Modified to use strict mode by default:

```python
def handle(self, *args, **options):
    include_staff = options.get('include_staff', False)
    strict_mode = not include_staff  # strict_mode is True unless --include-staff is specified
    
    # Use strict_mode when getting users
    users = self.get_property_users(property_obj.id, strict_mode=strict_mode)
```

### 2. Updated Documentation

Updated `PROPERTY_EMAIL_GUIDE.md` to explain:
- Default strict mode behavior
- How to use `--include-staff` flag
- User access control rules
- Examples for both modes

## Behavior Comparison

### BEFORE (Old Behavior)
```bash
# This command sent emails to:
# - Users assigned to Property 1
# - ALL staff users (regardless of property assignment)
python manage.py send_property_jobs_summary --property-id 1
```

**Problem**: Staff users received emails for all properties, leading to email overload and confusion.

### AFTER (New Default Behavior)
```bash
# This command now sends emails ONLY to:
# - Users explicitly assigned to Property 1
# - Staff users are NOT included by default
python manage.py send_property_jobs_summary --property-id 1
```

**Result**: Clean separation - users only see emails for their assigned properties.

### AFTER (With --include-staff Flag)
```bash
# This command sends emails to:
# - Users assigned to Property 1
# - ALL staff users (legacy behavior)
python manage.py send_property_jobs_summary --property-id 1 --include-staff
```

**Use Case**: When you want staff members to oversee all properties.

## Usage Examples

### Example 1: Send to Property A Users Only (Default)
```bash
# Users assigned to Property A receive email
# Users assigned to Property B do NOT receive email
# Staff users do NOT receive email
python manage.py send_property_jobs_summary --property-id 1
```

### Example 2: Send to All Properties (Strict Mode)
```bash
# Each user receives email ONLY for their assigned properties
# User A (Property A) → receives Property A email only
# User B (Property B) → receives Property B email only
# Staff users → do NOT receive any emails
python manage.py send_property_jobs_summary --all-properties
```

### Example 3: Send to All Properties Including Staff
```bash
# Each property-assigned user receives their property emails
# Staff users receive emails for ALL properties
python manage.py send_property_jobs_summary --all-properties --include-staff
```

### Example 4: Send to Specific Email Address
```bash
# Override all filtering and send to specific email
# Useful for testing or one-off reports
python manage.py send_property_jobs_summary --property-id 1 --to manager@example.com
```

## User Property Assignment

Users are assigned to properties through the `UserProfile` model:

```python
# In models.py
class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    properties = models.ManyToManyField(
        Property,
        related_name='user_profiles',
        blank=True
    )
```

### How to Assign Users to Properties

#### Via Django Admin
1. Go to Django Admin → User Profiles
2. Select a user profile
3. In the "Properties" field, select which properties the user should have access to
4. Save

#### Via Django Shell
```python
from django.contrib.auth import get_user_model
from myappLubd.models import Property

User = get_user_model()
user = User.objects.get(username='john')
property_a = Property.objects.get(id=1)

# Assign user to property
user.profile.properties.add(property_a)
```

## Benefits

### 1. **Privacy & Security**
- Users only see jobs for their assigned properties
- No accidental exposure of data from other properties
- Clear data boundaries between properties

### 2. **Reduced Email Overload**
- Staff users no longer bombarded with emails from all properties
- Each user receives only relevant emails
- Better email management and focus

### 3. **Scalability**
- As more properties are added, email volume doesn't explode for staff
- Each property team operates independently
- Better suited for multi-property organizations

### 4. **Flexibility**
- Default strict mode for security and clarity
- Optional `--include-staff` flag for oversight scenarios
- Explicit `--to` parameter for custom recipients

## Migration Guide

### For Existing Deployments

If you were relying on staff users receiving all property emails:

#### Option 1: Use --include-staff Flag (Quick Fix)
```bash
# Add the flag to your cron jobs
python manage.py send_property_jobs_summary --all-properties --include-staff
```

#### Option 2: Assign Staff to Properties (Recommended)
```python
# Assign staff users to all properties they should manage
staff_user = User.objects.get(username='admin')
properties = Property.objects.all()

for prop in properties:
    staff_user.profile.properties.add(prop)
```

This is the recommended approach as it:
- Makes access control explicit and auditable
- Works with default strict mode
- Provides better granular control

## Testing

### Test Strict Mode (Default)
```bash
# Should only send to Property 1 users
docker compose exec backend python manage.py send_property_jobs_summary --property-id 1
```

### Test with Staff Inclusion
```bash
# Should send to Property 1 users AND all staff
docker compose exec backend python manage.py send_property_jobs_summary --property-id 1 --include-staff
```

### Test All Properties
```bash
# Each user should only receive emails for their assigned properties
docker compose exec backend python manage.py send_property_jobs_summary --all-properties
```

### Verify User Assignments
```python
# Check which properties a user is assigned to
python manage.py shell

from django.contrib.auth import get_user_model
User = get_user_model()

user = User.objects.get(username='john')
properties = user.profile.properties.all()
print(f"User {user.username} has access to: {[p.name for p in properties]}")
```

## Backward Compatibility

The changes are backward compatible:
- Existing commands work without modification
- `--include-staff` flag is optional
- Fallback to staff users if no property-assigned users exist
- Explicit `--to` parameter still works as before

## Logging

Enhanced logging to track email distribution:
```
INFO: Property summary sent for Lubd Bangkok to 3 users
INFO: No property-assigned users found. Falling back to 2 staff users
INFO: User job email sent to john@example.com for property Lubd Bangkok
```

## Related Files Modified

1. `backend/myLubd/src/myappLubd/management/commands/send_property_jobs_summary.py`
   - Added `strict_mode` parameter
   - Added `--include-staff` flag
   - Updated user filtering logic

2. `backend/myLubd/PROPERTY_EMAIL_GUIDE.md`
   - Updated documentation
   - Added usage examples
   - Explained user access control

## Summary

✅ **Users assigned to Property A now ONLY receive emails for Property A**
✅ **Users assigned to Property B now ONLY receive emails for Property B**
✅ **Staff users do NOT automatically receive all emails (unless --include-staff is used)**
✅ **Clear separation between properties**
✅ **Reduced email overload**
✅ **Better security and privacy**

The system now enforces strict property boundaries by default, ensuring users only see what they're supposed to see!
