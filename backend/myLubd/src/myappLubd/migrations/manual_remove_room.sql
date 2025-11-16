-- Manual SQL script to remove room column from utilityconsumption table
-- Run this if migration fails or if you need to manually remove the column

-- Step 1: Remove the index if it exists
DROP INDEX IF EXISTS myappLubd_u_room_id_bbb8a0_idx;
DROP INDEX IF EXISTS myappLubd_u_room_2cee2c_idx;

-- Step 2: Remove the room column
ALTER TABLE myappLubd_utilityconsumption DROP COLUMN IF EXISTS room;

-- Step 3: Update unique constraint (if needed)
-- The unique_together constraint will be updated by Django migration
-- But if you need to manually update it:
-- ALTER TABLE myappLubd_utilityconsumption DROP CONSTRAINT IF EXISTS myappLubd_utilityconsumption_property_id_room_month_year_uniq;
-- ALTER TABLE myappLubd_utilityconsumption ADD CONSTRAINT myappLubd_utilityconsumption_property_id_month_year_uniq UNIQUE (property_id, month, year);

