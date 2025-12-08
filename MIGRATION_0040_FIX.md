# Migration 0040 Fix - KeyError: 'after_image'

## Problem

Migration 0040 was incorrectly trying to remove fields (`after_image`, `before_image`, `after_image_jpeg_path`, `before_image_jpeg_path`) from the `preventivemaintenance` model. However, these fields were **never removed** from `preventivemaintenance` - they were only removed from `maintenanceprocedure` in migration 0038.

## Solution Applied

Migration 0040 has been fixed to:
1. Only rename the index on `maintenanceprocedure` (which was already done in migration 0038)
2. **NOT** remove any fields from `preventivemaintenance`

## If You're Still Getting the Error

The error occurs when Django tries to build the migration state. This happens if migration 0040 was already applied with the old (incorrect) version. Here's how to fix it:

### Step 1: Check Migration Status

```bash
docker-compose -f docker-compose.dev.yml exec backend python manage.py showmigrations myappLubd
```

### Step 2: If Migration 0040 is Applied [X]

If migration 0040 shows as `[X]` (applied), you need to reset it:

```bash
# Option A: Fake unapply migration 0040 (go back to 0039)
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate myappLubd 0039 --fake

# Then fake apply the fixed version
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate myappLubd 0040 --fake

# Continue with remaining migrations
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate
```

### Step 3: If Migration 0040 is NOT Applied [ ]

If migration 0040 shows as `[ ]` (not applied), try:

```bash
# Try to apply migration 0040
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate myappLubd 0040

# If that fails with the same error, fake it:
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate myappLubd 0040 --fake

# Then continue
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate
```

### Alternative: Use the Diagnostic Script

Run the diagnostic script to get specific recommendations:

```bash
docker-compose -f docker-compose.dev.yml exec backend python fix_migration_state.py
```

This will check the current state and provide specific fix instructions.

## Alternative: If Migration 0040 Shows as Not Applied

If migration 0040 shows as `[ ]` (not applied), you can simply run:

```bash
docker-compose -f docker-compose.dev.yml exec backend python manage.py migrate
```

The fixed migration should now apply correctly.

## What Was Changed

**Migration 0040** (`0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more.py`):
- Removed incorrect `RemoveFieldStateOnly` operations that were trying to remove fields from `preventivemaintenance`
- Now only renames the index on `maintenanceprocedure` (matching what migration 0038 did in the database)

**Migration 0047** (`0047_restore_preventivemaintenance_image_fields_state.py`):
- Updated comments to reflect that migration 0040 no longer removes these fields
- The migration is still safe (checks if fields exist before adding them)

## Verification

After fixing, verify the migration state:

```bash
docker-compose -f docker-compose.dev.yml exec backend python manage.py showmigrations myappLubd
```

All migrations should show as `[X]` (applied).

## Summary

✅ **Fixed**: Migration 0040 no longer incorrectly removes fields from `preventivemaintenance`  
✅ **Safe**: Migration 0047 already handles edge cases safely  
⚠️ **Action Required**: If migration 0040 was already applied with the old version, fake it as described above

