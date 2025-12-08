# Fix Migration State - Step by Step

## Problem
Django can't build migration state because it thinks `after_image` was removed from `preventivemaintenance`, but the field still exists in the model and database.

## Quick Fix (Recommended)

**Inside the Docker container, run:**

```bash
cd /app/src
bash quick_fix.sh
```

This script will automatically:
1. Remove migration 0040 from the database if it was applied with the old version
2. Clear Python cache
3. Fake apply the fixed migration 0040
4. Run remaining migrations

## Manual Fix (If Quick Fix Doesn't Work)

### Step 1: Check Database State

Inside the Docker container, connect to the database:

```bash
psql -h db -U mylubd_user -d mylubd_db
```

Then run:

```sql
-- Check if migration 0040 is applied
SELECT name, applied 
FROM django_migrations 
WHERE app = 'myappLubd' 
AND name LIKE '0040%';

-- Check if fields exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'myappLubd_preventivemaintenance'
AND column_name IN ('after_image', 'before_image');
```

### Step 2: Remove Migration 0040 from Database

If migration 0040 is found, remove it:

```sql
DELETE FROM django_migrations 
WHERE app = 'myappLubd' 
AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more';
```

Exit psql:
```sql
\q
```

### Step 3: Clear Python Cache

```bash
find . -name "*.pyc" -delete
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
```

### Step 4: Fake Apply Fixed Migration 0040

```bash
python manage.py migrate myappLubd 0040 --fake
```

### Step 5: Continue with Migrations

```bash
python manage.py migrate
```

## Alternative: If Still Failing

If the error persists, try removing ALL migrations from 0040 onwards and re-applying:

```sql
-- Inside psql
DELETE FROM django_migrations 
WHERE app = 'myappLubd' 
AND name >= '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more';
```

Then fake apply them in order:
```bash
python manage.py migrate myappLubd 0040 --fake
python manage.py migrate myappLubd 0041 --fake
python manage.py migrate myappLubd 0042 --fake
# ... continue for all migrations up to the latest
python manage.py migrate
```

