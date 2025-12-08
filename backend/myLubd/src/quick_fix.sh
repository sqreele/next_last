#!/bin/bash
# Quick fix script for migration state
# Run this inside the Docker container: bash quick_fix.sh

set -e

echo "=========================================="
echo "Migration State Fix Script"
echo "=========================================="

# Step 1: Try to fix using Python script
echo ""
echo "Step 1: Running Python fix script..."
python fix_migrations_complete.py || {
    echo "Python script failed, trying direct SQL..."
    
    # Step 2: Direct SQL fix
    echo ""
    echo "Step 2: Using direct SQL..."
    PGPASSWORD="${SQL_PASSWORD:-mylubd_password}" psql -h db -U mylubd_user -d mylubd_db <<EOF
-- Remove migration 0040 if it exists
DELETE FROM django_migrations 
WHERE app = 'myappLubd' 
AND name = '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more';

SELECT 'Migration 0040 removed (if it existed)' as result;
EOF
}

# Step 3: Clear Python cache
echo ""
echo "Step 3: Clearing Python cache..."
find . -name "*.pyc" -delete 2>/dev/null || true
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
echo "✓ Cache cleared"

# Step 4: Fake apply migration 0040
echo ""
echo "Step 4: Fake applying migration 0040..."
python manage.py migrate myappLubd 0040 --fake || {
    echo "Warning: Could not fake apply migration 0040"
    echo "This might be okay if it's already applied"
}

# Step 5: Run migrations
echo ""
echo "Step 5: Running migrations..."
python manage.py migrate || {
    echo "Error: Migrations failed"
    echo "Please check the error message above"
    exit 1
}

echo ""
echo "=========================================="
echo "SUCCESS! Migrations completed"
echo "=========================================="

