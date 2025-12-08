# Migration Error Fix Guide

## Problem

You're getting this error when running migrations:
```
KeyError: 'after_image'
```

This happens because migration 0040 tries to remove `after_image` from `preventivemaintenance`, but migration 0047 already restored it.

## Solution

I've fixed migration 0040 to safely handle the case where the field might not exist. The migration now uses `.pop()` with a check to avoid KeyError.

## Steps to Fix

### Option 1: Apply the Fixed Migration (Recommended)

The migration file has been updated. Try running migrations again:

```bash
cd backend/myLubd
python manage.py migrate
```

### Option 2: If Migration Still Fails

If you still get errors, you may need to fake the problematic migration:

```bash
# Check which migrations are applied
python manage.py showmigrations myappLubd

# If migration 0040 is causing issues and 0047 is already applied,
# you can fake migration 0040 (mark it as applied without running it)
python manage.py migrate myappLubd 0040 --fake

# Then continue with remaining migrations
python manage.py migrate
```

### Option 3: Reset Migration State (Last Resort)

**⚠️ WARNING: Only use this if you're sure about your database state**

```bash
# 1. Check current migration state
python manage.py showmigrations myappLubd

# 2. If migrations are inconsistent, you may need to:
# - Fake migrations that are already applied to database
# - Or manually fix the migration files

# 3. Create a new migration for email_notifications_enabled
python manage.py makemigrations

# 4. Apply it
python manage.py migrate
```

## What Was Fixed

1. **Migration 0040**: Updated `RemoveFieldStateOnly.state_forwards()` to safely handle missing fields
2. **Migration 0050**: Created new migration for `email_notifications_enabled` field

## Verify Fix

After running migrations, verify:

```bash
# Check migration status
python manage.py showmigrations myappLubd

# Should show all migrations as [X] (applied)

# Verify the field exists in database
python manage.py shell
>>> from myappLubd.models import UserProfile
>>> UserProfile._meta.get_field('email_notifications_enabled')
<django.db.models.fields.BooleanField: email_notifications_enabled>
```

## Expected Output

After successful migration:

```
Operations to perform:
  Apply all migrations: admin, auth, contenttypes, myappLubd, sessions
Running migrations:
  Applying myappLubd.0050_add_email_notifications_enabled... OK
```

## Troubleshooting

### If you get "Migration dependencies are inconsistent"

Check migration dependencies:
```bash
python manage.py showmigrations myappLubd
```

Make sure migrations are applied in order. If 0047 is applied but 0040 isn't, you may need to fake 0040.

### If you get "Table already exists" errors

The database might already have the field. Check:
```bash
python manage.py dbshell
# Then check if column exists
\d myappLubd_userprofile
```

If the column exists, you can fake the migration:
```bash
python manage.py migrate myappLubd 0050 --fake
```

## Summary

✅ **Fixed**: Migration 0040 now safely handles missing fields
✅ **Created**: Migration 0050 for `email_notifications_enabled` field
✅ **Next Step**: Run `python manage.py migrate`

