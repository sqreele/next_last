-- SQL script to fix migration state
-- Run this in psql: \i fix_migration_sql.sql
-- Or: psql -h db -U mylubd_user -d mylubd_db -f fix_migration_sql.sql

-- Check if migration 0040 is applied
SELECT 'Migration 0040 status:' as info;
SELECT name, applied 
FROM django_migrations 
WHERE app = 'myappLubd' 
AND name LIKE '0040%';

-- Check if fields exist in preventivemaintenance table
SELECT 'Fields in preventivemaintenance table:' as info;
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'myappLubd_preventivemaintenance'
AND column_name IN ('after_image', 'before_image', 'after_image_jpeg_path', 'before_image_jpeg_path')
ORDER BY column_name;

-- Remove migration 0040 if it exists (this allows Django to rebuild state)
DELETE FROM django_migrations 
WHERE app = 'myappLubd' 
AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more';

SELECT 'Migration 0040 removed (if it existed)' as result;

